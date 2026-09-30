import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { users: [], events: [], authOptions: [] };
globalThis.__t6e3Accounts = state;
const modules = {
  '@/db/d1': `export function createD1Db(binding) {
    const rows = globalThis.__t6e3Accounts.users;
    const query = (kind, columns) => ({
      from() { return this; }, orderBy() { return this; },
      where(filter) { this.filter = filter; return this; }, limit(value) { this.limitValue = value; return this; },
      values(value) { this.value = value; return this; },
      then(resolve, reject) {
        const state = globalThis.__t6e3Accounts;
        state.events.push({ kind, filter: this.filter, columns, limit: this.limitValue });
        if (kind === 'select' && columns?.value === 'COUNT(*)') return Promise.resolve([{ value: rows.length }]).then(resolve, reject);
        if (kind === 'select') {
          const result = this.filter ? rows.filter(row => row.id === Object.values(this.filter)[0]) : rows;
          return Promise.resolve(this.limitValue === undefined ? result : result.slice(0, this.limitValue)).then(resolve, reject);
        }
        if (kind === 'insert') rows.push(this.value);
        if (kind === 'delete') state.users = rows.filter(row => row.id !== Object.values(this.filter)[0]);
        return Promise.resolve([]).then(resolve, reject);
      },
    });
    return { binding, select: columns => query('select', columns), insert: () => query('insert'), delete: () => query('delete') };
  }`,
  '@/db/connection': `export const db = { select() { throw new Error('Node DB should not be used'); } };`,
  '@/db/schema': `export const adminUsers = { id: 'id', username: 'username', role: 'role', permissions: 'permissions', createdAt: 'createdAt' };`,
  'drizzle-orm': `export const asc = value => value; export const eq = (column, value) => ({ [column]: value }); export const count = () => 'COUNT(*)';`,
  '@/lib/auth': `export async function getAdminOrResponse(_cookies, options) {
    globalThis.__t6e3Accounts.authOptions.push(options);
    return { id: 'admin-1', username: 'fixture-admin', role: 'superadmin', permissions: 0 };
  }`,
  '@/lib/crypto': `export function hashPassword(password) { return 'synthetic-hash:' + password; }`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const [{ GET, POST }, { DELETE }] = await Promise.all([
  import('../../src/pages/api/admin/accounts/index.ts'),
  import('../../src/pages/api/admin/accounts/[id].ts'),
]);
const binding = { marker: 'synthetic-request-d1' };
const secret = 'synthetic-session-secret';
function context({ method = 'GET', body, id, env = { DB_PREVIEW: binding, SESSION_SECRET: secret }, worker = true } = {}) {
  return {
    request: new Request('https://preview.example/api/admin/accounts', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    cookies: { get: () => undefined }, params: { id },
    locals: { runtime: worker ? { env } : undefined },
  };
}

test('Worker account routes require both bindings and pass request D1 to auth and account queries', async () => {
  state.users = Array.from({ length: 125 }, (_, index) => ({
    id: `admin-${index + 1}`, username: `fixture-admin-${index + 1}`, role: 'superadmin', permissions: 0, createdAt: `2025-01-${String(index + 1).padStart(2, '0')}`,
  }));
  state.events = [];
  state.authOptions = [];
  for (const env of [{ SESSION_SECRET: secret }, { DB_PREVIEW: binding }]) {
    assert.equal((await GET(context({ env }))).status, 503);
    assert.equal((await POST(context({ method: 'POST', body: {}, env }))).status, 503);
    assert.equal((await DELETE(context({ method: 'DELETE', id: 'target', env }))).status, 503);
  }
  assert.equal(state.authOptions.length, 0);

  const listed = await GET(context());
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).accounts.length, 100);
  assert.equal(state.events.find(event => event.kind === 'select' && event.columns)?.limit, 100);
  const created = await POST(context({ method: 'POST', body: { username: 'synthetic-user', password: 'synthetic-password' } }));
  assert.equal(created.status, 200);
  assert.equal(state.users.find(row => row.username === 'synthetic-user').passwordHash, 'synthetic-hash:synthetic-password');
  assert.ok(state.authOptions.every(options => options.db.binding === binding && options.sessionSecret === secret));
  assert.ok(state.events.some(event => event.kind === 'insert'));
});

test('delete guard uses a bounded count and keeps the final account', async () => {
  state.users = [{ id: 'admin-1', username: 'fixture-admin' }];
  state.events = [];
  const response = await DELETE(context({ method: 'DELETE', id: 'other-account' }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: '至少需要保留一個管理員帳號' });
  assert.deepEqual(state.users, [{ id: 'admin-1', username: 'fixture-admin' }]);
  assert.deepEqual(state.events.map(event => event.columns), [{ value: 'COUNT(*)' }]);
});
