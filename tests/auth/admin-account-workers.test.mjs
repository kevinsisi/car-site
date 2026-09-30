import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST as logout } from '../../src/pages/api/admin/logout.ts';
import { POST as changePassword } from '../../src/pages/api/admin/change-password.ts';
import { hashPassword, signSession, verifyPassword } from '../../src/lib/crypto.ts';

const secret = 'synthetic-account-worker-secret';

function syntheticD1() {
  let currentPasswordHash = hashPassword('current-password');
  let sessionCount = 1;
  const writes = [];
  const binding = {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...parameters) { values = parameters; return statement; },
        async all() {
          if (query.includes('admin_sessions')) {
            return { results: sessionCount ? [{ id: 'synthetic-user', username: 'synthetic', role: 'admin', permissions: 3 }] : [] };
          }
          return { results: [{ id: 'synthetic-user', username: 'synthetic', password_hash: currentPasswordHash, role: 'admin', permissions: 3, created_at: new Date().toISOString() }] };
        },
        async raw() {
          if (query.includes('admin_sessions')) {
            return sessionCount ? [['synthetic-user', 'synthetic', 'admin', 3]] : [];
          }
          return [['synthetic-user', 'synthetic', currentPasswordHash, 'admin', 3, new Date().toISOString()]];
        },
        async first() {
          return null;
        },
        async run() {
          writes.push({ query, values });
          if (query.toLowerCase().includes('delete') && query.includes('admin_sessions')) sessionCount = 0;
          if (query.toLowerCase().includes('update') && query.includes('admin_users')) currentPasswordHash = values.find((value) => typeof value === 'string' && value.startsWith('scrypt:'));
          return { success: true, meta: { changes: 1, last_row_id: 1 } };
        },
      };
      return statement;
    },
    writes,
    countSessions() { return sessionCount; },
    passwordHash() { return currentPasswordHash; },
  };
  return binding;
}

function context(binding, path, body = '', signedCookie = signSession('synthetic-session', secret)) {
  let deletedCookie;
  let destination;
  const cookies = {
    get(name) { return name === 'car_site_admin' ? { value: signedCookie } : undefined; },
    delete(name, options) { deletedCookie = { name, options }; },
  };
  return {
    request: new Request(`https://synthetic.test${path}`, { method: 'POST', body }),
    cookies,
    locals: { runtime: { env: { DB_PREVIEW: binding, SESSION_SECRET: secret } } },
    redirect(location) { destination = location; return new Response(null, { status: 302, headers: { location } }); },
    get deletedCookie() { return deletedCookie; },
    get destination() { return destination; },
  };
}

test('Workers logout revokes the request D1 session and preserves redirect/cookie behavior', async () => {
  const binding = syntheticD1();
  const ctx = context(binding, '/api/admin/logout');
  const response = await logout(ctx);

  assert.equal(binding.countSessions(), 0);
  assert.equal(ctx.deletedCookie.name, 'car_site_admin');
  assert.deepEqual(ctx.deletedCookie.options, { path: '/' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login');
});

test('Workers password change validates and updates only the request D1 user with scrypt', async () => {
  const binding = syntheticD1();
  const ctx = context(binding, '/api/admin/change-password', JSON.stringify({
    currentPassword: 'current-password', newPassword: 'new-password-123',
  }));
  const response = await changePassword(ctx);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(binding.passwordHash(), /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.ok(binding.writes.some(({ query, values }) => query.toLowerCase().includes('update') && values.some((value) => typeof value === 'string' && verifyPassword('new-password-123', value))));
  assert.equal(binding.countSessions(), 1);
});

test('Workers password change preserves validation and authentication responses', async () => {
  const binding = syntheticD1();
    const short = await changePassword(context(binding, '/api/admin/change-password', JSON.stringify({
      currentPassword: 'current-password', newPassword: 'short',
    })));
    assert.equal(short.status, 400);
    assert.deepEqual(await short.json(), { error: '新密碼長度至少 8 個字元' });

    const wrongPassword = await changePassword(context(binding, '/api/admin/change-password', JSON.stringify({
      currentPassword: 'incorrect-password', newPassword: 'new-password-123',
    })));
    assert.equal(wrongPassword.status, 400);
    assert.deepEqual(await wrongPassword.json(), { error: '目前密碼不正確' });
});

test('Workers logout and password change fail unavailable without D1 or secret', async () => {
  for (const missing of ['DB_PREVIEW', 'SESSION_SECRET']) {
    for (const route of ['logout', 'change-password']) {
      const binding = syntheticD1();
      const ctx = context(binding, `/api/admin/${route}`, JSON.stringify({
        currentPassword: 'current-password', newPassword: 'new-password-123',
      }));
      if (missing === 'DB_PREVIEW') delete ctx.locals.runtime.env.DB_PREVIEW;
      else delete ctx.locals.runtime.env.SESSION_SECRET;
      const response = route === 'logout' ? await logout(ctx) : await changePassword(ctx);
      assert.equal(response.status, 503, `${route} with missing ${missing}`);
      assert.equal(ctx.deletedCookie, undefined);
      assert.equal(binding.writes.length, 0);
    }
  }
});
