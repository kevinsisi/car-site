import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { users: [], limit: null, order: [], nodeLimit: null };
globalThis.__t7Users = state;
const makeDb = (isWorker) => ({
  select(columns) {
    const query = {
      from() { return this; },
      orderBy(...order) { state.order = order; return this; },
      limit(count) { if (isWorker) state.limit = count; else state.nodeLimit = count; return this; },
      then(resolve, reject) {
        const rows = state.users;
        const bounded = isWorker && state.limit !== null ? rows.slice(0, state.limit) : rows;
        return Promise.resolve(bounded.map(row => Object.fromEntries(Object.keys(columns).map(key => [key, row[key]])))).then(resolve, reject);
      },
    };
    return query;
  },
});
const modules = {
  '@/db/d1': `export async function createD1Db() { return globalThis.__t7Users.workerDb; }`,
  '@/db/connection': `export const db = globalThis.__t7Users.nodeDb;`,
  '@/db/schema': `export const adminUsers = { id: 'id', username: 'username', role: 'role', permissions: 'permissions', createdAt: 'createdAt' };`,
  'drizzle-orm': `export const asc = value => value; export const eq = (column, value) => ({ [column]: value });`,
  '@/lib/auth': `export async function getPermittedOrResponse() { return { id: 'synthetic', username: 'synthetic', role: 'admin', permissions: 4 }; }`,
  '@/lib/permissions': `export const PERMISSIONS = { USERS_MANAGE: 4 };`,
  '@/lib/crypto': `export function hashPassword(value) { return value; }`,
  '@/lib/analytics': `export function hashIp(value) { return value; } export async function logAdminActivity() {}`,
};
state.workerDb = makeDb(true);
state.nodeDb = makeDb(false);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { GET } = await import('../../src/pages/api/admin/users/index.ts');
const rows = Array.from({ length: 125 }, (_, index) => ({
  id: `user-${String(index).padStart(3, '0')}`,
  username: `synthetic-${index}`,
  role: 'admin',
  permissions: 4,
  createdAt: '2025-01-01',
}));
state.users = rows;
const context = runtime => ({ cookies: { get: () => undefined }, locals: { runtime } });

test('Worker users GET applies stable order and SQL limit of 100', async () => {
  state.limit = null;
  state.order = [];
  const response = await GET(context({ env: { DB_PREVIEW: { synthetic: true }, SESSION_SECRET: 'synthetic-secret' } }));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.length, 100);
  assert.equal(state.limit, 100);
  assert.deepEqual(state.order, ['createdAt', 'id']);
});

test('Node users GET preserves unlimited results and does not add SQL limit', async () => {
  state.nodeLimit = null;
  state.order = [];
  const response = await GET(context(undefined));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.length, 125);
  assert.equal(state.nodeLimit, null);
  assert.deepEqual(state.order, ['createdAt']);
});
