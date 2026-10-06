import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';
import { ADMIN_COOKIE, createSession } from '../../src/lib/auth.ts';
import { hashPassword } from '../../src/lib/crypto.ts';
import { PERMISSIONS } from '../../src/lib/permissions.ts';
import { GET, POST } from '../../src/pages/api/admin/accounts/index.ts';
import { DELETE } from '../../src/pages/api/admin/accounts/[id].ts';
import { POST as changePassword } from '../../src/pages/api/admin/change-password.ts';

// Only the external D1 binding is substituted. Routes, Drizzle, session checks,
// permissions and password hashing execute their production implementations.
class MemoryD1 {
  sqlite = new DatabaseSync(':memory:');

  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    let values = [];
    const prepared = {
      bind(...args) { values = args; return prepared; },
      all() { return { results: statement.all(...values) }; },
      first() { return statement.get(...values) ?? null; },
      raw() { return statement.all(...values).map(row => Object.values(row)); },
      run() { return statement.run(...values); },
    };
    return prepared;
  }
}

const password = 'synthetic-password';
const sessionSecret = 'synthetic-legacy-accounts-secret';
const passwordHash = hashPassword(password);

async function fixture(t) {
  const binding = new MemoryD1();
  t.after(() => binding.sqlite.close());
  binding.sqlite.exec('PRAGMA foreign_keys = ON');
  binding.sqlite.exec(readFileSync(new URL('../../migrations/d1/0001_baseline.sql', import.meta.url), 'utf8'));
  const users = [
    ['root', 'superadmin', 0],
    ['other-root', 'superadmin', PERMISSIONS.ALL],
    ['manager', 'admin', PERMISSIONS.USERS_MANAGE],
    ['none', 'admin', 0],
    ['viewer', 'admin', PERMISSIONS.VEHICLES_VIEW],
  ];
  const insert = binding.sqlite.prepare('INSERT INTO admin_users (id, username, password_hash, role, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [id, role, permissions] of users) {
    insert.run(id, id, passwordHash, role, permissions, '2026-01-01T00:00:00.000Z');
  }
  const db = await createD1Db(binding);
  const authOptions = { db, sessionSecret };
  const sessions = new Map();
  for (const [id] of users) {
    const session = await createSession(id, password, authOptions);
    assert.ok(session, `fixture session for ${id}`);
    sessions.set(id, session.cookieValue);
  }
  return {
    authOptions,
    context(actor, { method = 'GET', body, id } = {}) {
      return {
        request: new Request('https://fixture.invalid/api/admin/accounts', {
          method,
          headers: { 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        cookies: { get: name => name === ADMIN_COOKIE && sessions.has(actor) ? { value: sessions.get(actor) } : undefined },
        locals: { runtime: { env: { DB_PREVIEW: binding, SESSION_SECRET: sessionSecret } } },
        params: { id },
      };
    },
  };
}

test('legacy list requires USERS_MANAGE and preserves its public account shape', async t => {
  const { context } = await fixture(t);
  assert.equal((await GET(context())).status, 401);
  for (const actor of ['none', 'viewer']) {
    assert.equal((await GET(context(actor))).status, 403, `${actor} cannot list accounts`);
  }
  for (const actor of ['manager', 'root']) {
    const response = await GET(context(actor));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['accounts']);
    assert.equal(body.accounts.length, 5);
    for (const account of body.accounts) {
      assert.deepEqual(Object.keys(account).sort(), ['createdAt', 'id', 'username']);
    }
  }
});

test('legacy creation is restricted to superadmins, including when an admin can manage users', async t => {
  const { context, authOptions } = await fixture(t);
  const body = { username: 'created-account', password };
  assert.equal((await POST(context(undefined, { method: 'POST', body }))).status, 401);
  for (const actor of ['none', 'viewer', 'manager']) {
    const response = await POST(context(actor, { method: 'POST', body }));
    assert.equal(response.status, 403, `${actor} cannot create accounts`);
  }
  const before = await (await GET(context('root'))).json();
  assert.equal(before.accounts.some(account => account.username === body.username), false);

  const response = await POST(context('root', { method: 'POST', body }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const created = await createSession(body.username, password, authOptions);
  assert.ok(created, 'created account can sign in');
  assert.equal(created.user.role, 'admin');
  assert.equal(created.user.permissions, 0);
  assert.equal((await POST(context('root', { method: 'POST', body }))).status, 400, 'duplicate remains a validation error');
  assert.equal((await POST(context('root', { method: 'POST', body: { username: 'invalid user', password } }))).status, 400);
  assert.equal((await POST(context('root', { method: 'POST', body: { username: 'short-password', password: 'short' } }))).status, 400);
  const after = await (await GET(context('root'))).json();
  assert.equal(after.accounts.length, before.accounts.length + 1);
});

test('legacy deletion rejects ordinary admins, self and every superadmin target', async t => {
  const { context, authOptions } = await fixture(t);
  assert.equal((await DELETE(context(undefined, { method: 'DELETE', id: 'viewer' }))).status, 401);
  for (const actor of ['none', 'viewer', 'manager']) {
    assert.equal((await DELETE(context(actor, { method: 'DELETE', id: 'other-root' }))).status, 403, `${actor} cannot delete a superadmin`);
    assert.equal((await DELETE(context(actor, { method: 'DELETE', id: 'none' }))).status, 403, `${actor} cannot delete an ordinary account`);
  }
  for (const id of ['root', 'other-root']) {
    assert.equal((await DELETE(context('root', { method: 'DELETE', id }))).status, 400, `cannot delete ${id}`);
  }
  assert.equal((await DELETE(context('root', { method: 'DELETE' }))).status, 400);
  assert.equal((await DELETE(context('root', { method: 'DELETE', id: 'missing' }))).status, 404);
  const before = await (await GET(context('root'))).json();
  assert.equal(before.accounts.length, 5, 'failed deletions preserve all accounts');

  const response = await DELETE(context('root', { method: 'DELETE', id: 'manager' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal((await GET(context('manager'))).status, 401, 'deleted user loses an existing session');
  assert.equal(await createSession('manager', password, authOptions), null);
  const after = await (await GET(context('root'))).json();
  assert.deepEqual(after.accounts.map(account => account.id), before.accounts.filter(account => account.id !== 'manager').map(account => account.id));
});

test('an admin with no permissions can still change only their own password', async t => {
  const { context, authOptions } = await fixture(t);
  const newPassword = 'synthetic-new-password';
  const requestOptions = body => ({ method: 'POST', body });
  assert.equal((await changePassword(context(undefined, requestOptions({ currentPassword: password, newPassword })))).status, 401);
  assert.equal((await changePassword(context('none', requestOptions({ currentPassword: 'wrong-password', newPassword })))).status, 400);
  assert.equal((await changePassword(context('none', requestOptions({ currentPassword: password, newPassword: password })))).status, 400);
  assert.equal((await changePassword(context('none', requestOptions({ currentPassword: password, newPassword: 'short' })))).status, 400);
  assert.ok(await createSession('none', password, authOptions), 'failed changes preserve current password');

  const response = await changePassword(context('none', requestOptions({ currentPassword: password, newPassword, id: 'root', username: 'root' })));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(await createSession('none', password, authOptions), null);
  assert.ok(await createSession('none', newPassword, authOptions));
  assert.ok(await createSession('root', password, authOptions), 'body cannot choose a different password-change target');
  assert.equal((await GET(context('none'))).status, 403, 'password change does not grant account management');
});
