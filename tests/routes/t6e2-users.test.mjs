import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { users: [], events: [], authOptions: [], analytics: 0, unauthorized: false };
globalThis.__t6e2Users = state;
const modules = {
  '@/db/d1': `export async function createD1Db(binding) {
    globalThis.__t6e2Users.binding = binding;
    const rows = globalThis.__t6e2Users.users;
    const matches = (filter, row) => !filter || Object.entries(filter).every(([key, value]) => row[key] === value);
    const query = (kind, payload = {}) => ({
      from() { return this; }, orderBy(...order) { this.order = order; return this; },
      select(columns) { this.columns = columns; return this; },
      where(filter) { this.filter = filter; return this; }, limit(count) { this.limitCount = count; return this; },
      values(value) { this.value = value; return this; },
      set(value) { this.value = value; return this; },
      then(resolve, reject) {
        globalThis.__t6e2Users.events.push({ kind, filter: this.filter, value: this.value, limitCount: this.limitCount, order: this.order });
        if (kind === 'insert') rows.push(this.value);
        if (kind === 'update') rows.forEach(row => { if (matches(this.filter, row)) Object.assign(row, this.value); });
        if (kind === 'delete') globalThis.__t6e2Users.users = rows.filter(row => !matches(this.filter, row));
        const selected = kind === 'select' ? rows.filter(row => matches(this.filter, row)) : [];
        const ordered = this.order?.length ? selected.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id))) : selected;
        const limited = this.limitCount === undefined ? ordered : ordered.slice(0, this.limitCount);
        const result = limited.map(row => this.columns ? Object.fromEntries(Object.keys(this.columns).map(key => [key, row[key]])) : ({ ...row }));
        return Promise.resolve(result).then(resolve, reject);
      },
    });
  return { binding, select: columns => query('select').select(columns), insert: () => query('insert'), update: () => query('update'), delete: () => query('delete') };
  }`,
  '@/db/connection': `export const db = { select() { throw new Error('Node DB used in Worker'); } };`,
  '@/db/schema': `export const adminUsers = { id: 'id', username: 'username', role: 'role', permissions: 'permissions', createdAt: 'createdAt' };`,
  'drizzle-orm': `export const asc = value => value; export const eq = (column, value) => ({ [column]: value });`,
  '@/lib/auth': `export async function getPermittedOrResponse(_cookies, permission, options) {
    globalThis.__t6e2Users.authOptions.push({ permission, options });
    if (globalThis.__t6e2Users.unauthorized) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    return { id: 'fixture-admin', username: 'fixture-admin', role: 'superadmin', permissions: 7 };
  }`,
  '@/lib/permissions': `export const PERMISSIONS = { USERS_MANAGE: 4 };`,
  '@/lib/crypto': `export function hashPassword(password) { return 'synthetic-hash:' + password; }`,
  '@/lib/analytics': `globalThis.__t6e2Users.analytics++; export function hashIp(ip) { return 'hash:' + ip; } export async function logAdminActivity() {}`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const [{ GET, POST }, { PATCH, DELETE }] = await Promise.all([
  import('../../src/pages/api/admin/users/index.ts'),
  import('../../src/pages/api/admin/users/[id].ts'),
]);
const binding = { marker: 'synthetic-request-d1' };
const secret = 'synthetic-session-secret';
const env = { DB_PREVIEW: binding, SESSION_SECRET: secret };

function context({ method = 'GET', body, runtime = true, bindings = env, id } = {}) {
  return {
    request: new Request('https://preview.example/api/admin/users', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    cookies: { get: () => undefined },
    params: { id },
    locals: { runtime: runtime ? { env: bindings } : undefined },
  };
}

test('Worker users routes reject unauthorized and missing DB/secret bindings before DB access', async () => {
  state.users = [];
  state.events = [];
  state.authOptions = [];
  state.unauthorized = true;
  assert.equal((await GET(context())).status, 401);
  assert.equal(state.authOptions[0].options.db.binding, binding);
  assert.equal(state.authOptions[0].options.sessionSecret, secret);
  const authCount = state.authOptions.length;
  assert.equal((await POST(context({ method: 'POST', body: {}, bindings: { SESSION_SECRET: secret } }))).status, 503);
  assert.equal((await PATCH(context({ method: 'PATCH', body: { permissions: 1 }, id: 'fixture-user', bindings: { DB_PREVIEW: binding } }))).status, 503);
  assert.equal(state.authOptions.length, authCount);
  assert.deepEqual(state.events, []);
  state.unauthorized = false;
});

test('Worker users routes perform list/create/update/delete through request D1', async () => {
  state.users = [{ id: 'fixture-user', username: 'fixture-user', role: 'admin', permissions: 1, createdAt: '2025-01-01' }];
  state.events = [];
  state.authOptions = [];
  state.analytics = 0;
  const listed = await GET(context());
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [{ id: 'fixture-user', username: 'fixture-user', role: 'admin', permissions: 1, createdAt: '2025-01-01' }]);
  const listQuery = state.events.find(event => event.kind === 'select');
  assert.equal(listQuery.limitCount, 100);

  const created = await POST(context({ method: 'POST', body: { username: 'synthetic-new-user', password: 'synthetic-password', permissions: 1 } }));
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { ok: true });
  const newUser = state.users.find(user => user.username === 'synthetic-new-user');
  assert.ok(newUser);
  assert.equal(newUser.passwordHash, 'synthetic-hash:synthetic-password');

  const updated = await PATCH(context({ method: 'PATCH', id: newUser.id, body: { permissions: 3 } }));
  assert.equal(updated.status, 200);
  assert.equal(state.users.find(user => user.id === newUser.id).permissions, 3);
  const deleted = await DELETE(context({ method: 'DELETE', id: newUser.id }));
  assert.equal(deleted.status, 200);
  assert.equal(state.users.some(user => user.id === newUser.id), false);
  assert.ok(state.authOptions.every(({ options }) => options.db && options.sessionSecret === secret));
  assert.ok(state.events.some(event => event.kind === 'insert'));
  assert.ok(state.events.some(event => event.kind === 'update'));
  assert.ok(state.events.some(event => event.kind === 'delete'));
  assert.equal(state.analytics, 0);
});
