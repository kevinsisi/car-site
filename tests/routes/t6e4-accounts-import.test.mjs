import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { PERMISSIONS } from '../../src/lib/permissions.ts';

const state = { nodeDbImports: 0, order: null, limit: null, requiredPermission: PERMISSIONS.USERS_MANAGE };
globalThis.__t6e4Accounts = state;
const modules = {
  '@/db/d1': `export function createD1Db(binding) {
    return {
      binding,
      select() { return {
        from() { return this; },
        orderBy(...order) { globalThis.__t6e4Accounts.order = order; return this; },
        limit(value) { globalThis.__t6e4Accounts.limit = value; return Promise.resolve([{ id: 'a', username: 'fixture', createdAt: '2025-01-01' }]); },
      }; },
    };
  }`,
  '@/db/schema': `export const adminUsers = { id: 'id', username: 'username', createdAt: 'createdAt' };`,
  '@/lib/auth': `export async function getPermittedOrResponse(_cookies, required, options) {
    if (required !== globalThis.__t6e4Accounts.requiredPermission) throw new Error('accounts must require USERS_MANAGE');
    return options.db.binding ? { id: 'admin', role: 'superadmin', permissions: 0 } : Response.json({ error: 'missing request db' }, { status: 500 });
  }`,
  '@/lib/crypto': `export function hashPassword(value) { return value; }`,
  'drizzle-orm': `export const asc = value => ({ direction: 'asc', value }); export const eq = (column, value) => ({ [column]: value }); export const count = () => 'COUNT(*)';`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/db/connection') {
      state.nodeDbImports += 1;
      return { url: `data:text/javascript,${encodeURIComponent('export const db = {};')}`, shortCircuit: true };
    }
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const [{ GET }, { DELETE }] = await Promise.all([
  import('../../src/pages/api/admin/accounts/index.ts'),
  import('../../src/pages/api/admin/accounts/[id].ts'),
]);

function context(env) {
  return {
    cookies: { get: () => undefined },
    params: { id: 'unused' },
    locals: { runtime: { env } },
  };
}

test('account routes import without loading Node DB and Worker GET is bounded', async () => {
  assert.equal(state.nodeDbImports, 0);
  assert.deepEqual(await (await GET(context({}))).json(), { error: 'Worker database or session configuration is unavailable' });
  assert.equal((await GET(context({ DB_PREVIEW: {}, SESSION_SECRET: 'secret' }))).status, 200);
  assert.equal(state.limit, 100);
  assert.equal(state.order.length, 2);
  assert.equal(state.order[0].direction, 'asc');
  assert.equal(state.order[1].direction, 'asc');
  assert.equal(state.nodeDbImports, 0);
  assert.equal((await DELETE(context({}))).status, 503);
  assert.equal(state.nodeDbImports, 0);
});
