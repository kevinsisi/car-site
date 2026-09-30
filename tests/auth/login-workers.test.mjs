import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { POST } from '../../src/pages/api/admin/login.ts';
import { hashPassword } from '../../src/lib/crypto.ts';

function syntheticD1({ failClear = false } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/d1/0002_shared_rate_limits.sql', import.meta.url), 'utf8'));
  const writes = [];
  const queries = [];
  const convert = (query) => {
    const statement = { query, params: [] };
    return Object.assign(statement, {
      bind(...values) { statement.params = values; return statement; },
      async all() {
        if (query.includes('admin_users')) {
          return { results: [{ id: 'synthetic-user', username: 'synthetic', passwordHash: hashPassword('synthetic-password'), password_hash: hashPassword('synthetic-password'), role: 'admin', permissions: 3, createdAt: new Date().toISOString(), created_at: new Date().toISOString() }] };
        }
        if (!query.includes('shared_rate_limits')) return { results: [] };
        return { results: sqlite.prepare(query).all(...statement.params) };
      },
      async raw() {
        if (query.includes('admin_users')) {
          return [['synthetic-user', 'synthetic', hashPassword('synthetic-password'), 'admin', 3, new Date().toISOString()]];
        }
        return sqlite.prepare(query).raw().all(...statement.params);
      },
      async first() {
        if (query.includes('admin_users')) return null;
        if (!query.includes('shared_rate_limits')) return null;
        return sqlite.prepare(query).get(...statement.params) ?? null;
      },
      async run() {
        if (failClear && query.includes("limiter = 'login'")) throw new Error('synthetic limiter failure');
        writes.push({ query, params: statement.params });
        if (query.includes('admin_users')) return { success: true, meta: { changes: 1, last_row_id: 1 } };
        if (!query.includes('shared_rate_limits')) return { success: true, meta: { changes: 1, last_row_id: 1 } };
        const result = sqlite.prepare(query).run(...statement.params);
        return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
      },
    });
  };
  const binding = {
    prepare(query) {
      queries.push(query);
      return convert(query);
    },
    async batch(statements) {
      const transaction = sqlite.transaction(() => statements.map(({ query, params }) => {
        if (failClear && query.includes("limiter = 'login'")) throw new Error('synthetic limiter failure');
        writes.push({ query, params });
        if (query.includes('admin_users')) return { success: true, meta: { changes: 1 } };
        if (!query.includes('shared_rate_limits')) return { success: true, meta: { changes: 1 } };
        if (query.includes('RETURNING')) {
          const results = sqlite.prepare(query).all(...params);
          return { success: true, results, meta: { changes: results.length } };
        }
        const result = sqlite.prepare(query).run(...params);
        return { success: true, meta: { changes: result.changes } };
      }));
      return transaction();
    },
    sqlite,
    };
  return { binding, writes, queries, sqlite };
}

function context({ db, secret = 'synthetic-secret', password = 'synthetic-password' } = {}) {
  let destination;
  const setCookies = [];
  const cookies = { set(...args) { setCookies.push(args); } };
  return {
    request: new Request('https://synthetic.test/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '192.0.2.10' },
      body: `username=synthetic&password=${encodeURIComponent(password)}`,
    }),
    cookies,
    redirect(path) { destination = path; return new Response(null, { status: 302, headers: { location: path } }); },
    get destination() { return destination; },
    setCookies,
    locals: { runtime: { env: { DB_PREVIEW: db, SESSION_SECRET: secret } } },
  };
}

test('Workers login uses the request D1, secret, and shared limiter', async () => {
  const { binding, writes, queries, sqlite } = syntheticD1();
  const ctx = context({ db: binding });
  const response = await POST(ctx);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin');
  assert.ok(queries.length >= 1);
  assert.ok(writes.some(({ query }) => query.includes('admin_sessions')));
  assert.ok(queries.some((query) => query.includes('shared_rate_limits')));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM shared_rate_limits').get().count, 0);
  assert.equal(ctx.setCookies.length, 1);
});

test('Workers login fails closed when the shared limiter binding is absent', async () => {
  const ctx = context({ db: {} });
  const response = await POST(ctx);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login?limited=1');
});

test('Workers login returns limited when recording a wrong password fails', async () => {
  const { binding } = syntheticD1();
  binding.batch = async () => { throw new Error('synthetic limiter failure'); };
  const ctx = context({ db: binding, password: 'wrong-password' });
  const response = await POST(ctx);
  assert.equal(response.headers.get('location'), '/admin/login?limited=1');
  assert.equal(ctx.setCookies.length, 0);
});

test('Workers login does not set a cookie when clearing the limiter fails after valid credentials', async () => {
  const { binding } = syntheticD1({ failClear: true });
  const ctx = context({ db: binding });
  const response = await POST(ctx);
  assert.equal(response.headers.get('location'), '/admin/login?limited=1');
  assert.equal(ctx.setCookies.length, 0);
});

test('Workers login preserves successful cookie and redirect behavior with healthy bindings', async () => {
  const { binding } = syntheticD1();
  const ctx = context({ db: binding });
  const response = await POST(ctx);
  assert.equal(response.headers.get('location'), '/admin');
  assert.equal(ctx.setCookies.length, 1);
  assert.equal(ctx.setCookies[0][0], 'car_site_admin');
});

test('Workers login rejects missing D1 or secret before authentication', async () => {
  const { binding } = syntheticD1();
  for (const missing of ['DB_PREVIEW', 'SESSION_SECRET']) {
    const ctx = context({ db: binding });
    if (missing === 'DB_PREVIEW') delete ctx.locals.runtime.env.DB_PREVIEW;
    else delete ctx.locals.runtime.env.SESSION_SECRET;
    const response = await POST(ctx);
    assert.equal(response.headers.get('location'), '/admin/login?limited=1');
    assert.equal(ctx.setCookies.length, 0);
  }
});

test('Workers login counts wrong passwords and locks after five failures', async () => {
  const { binding, sqlite } = syntheticD1();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ctx = context({ db: binding, password: 'wrong-password' });
    const response = await POST(ctx);
    assert.equal(response.headers.get('location'), '/admin/login?error=1');
    assert.equal(ctx.setCookies.length, 0);
  }
  assert.equal(sqlite.prepare("SELECT count FROM shared_rate_limits WHERE limiter = 'login'").get().count, 5);
  const locked = context({ db: binding });
  const response = await POST(locked);
  assert.equal(response.headers.get('location'), '/admin/login?limited=1');
  assert.equal(locked.setCookies.length, 0);
});
