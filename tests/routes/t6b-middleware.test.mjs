import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test, after } from 'node:test';
import Database from 'better-sqlite3';
import { signSession, hashPassword } from '../../src/lib/crypto.ts';
import * as schema from '../../src/db/schema.ts';
import { createD1Db } from '../../src/db/d1.ts';

const blockedNative = new Set(['@/db/connection', '@/lib/migrate-features', '@/lib/analytics']);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'astro:middleware') {
      return { url: 'data:text/javascript,export%20const%20defineMiddleware%20%3D%20handler%20%3D%3E%20handler', shortCircuit: true };
    }
    if (blockedNative.has(specifier)) throw new Error(`Worker attempted native-only import: ${specifier}`);
    return nextResolve(specifier, context);
  },
});

const { handleRequest } = await import('../../src/middleware.ts');
const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, permissions INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
`);
const binding = {
  prepare(query) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async all() { return { results: sqlite.prepare(query).all(...args) }; },
      async raw() { return sqlite.prepare(query).raw().all(...args); },
      async first() { return sqlite.prepare(query).get(...args) ?? null; },
      async run() { const result = sqlite.prepare(query).run(...args); return { success: true, meta: { changes: result.changes } }; },
    };
    return statement;
  },
};
const workerDb = await createD1Db(binding);
const secret = 'synthetic-worker-session-secret';
const cookies = (token) => ({ get: (name) => name === 'car_site_admin' && token ? { value: token } : undefined, set() {} });
const contextFor = (pathname, token, env = { DB_PREVIEW: binding, SESSION_SECRET: secret }) => ({
  request: new Request(`https://preview.example${pathname}`),
  url: new URL(`https://preview.example${pathname}`),
  locals: { runtime: { env } },
  cookies: cookies(token),
  redirect: (url) => new Response(null, { status: 302, headers: { location: url } }),
});

after(() => sqlite.close());

test('Worker middleware returns 503 before continuing when either required binding is missing', async () => {
  for (const env of [{ DB_PREVIEW: binding }, { SESSION_SECRET: secret }, {}]) {
    let continued = false;
    const response = await handleRequest(contextFor('/', null, env), async () => { continued = true; return new Response('ok'); });
    assert.equal(response.status, 503);
    assert.equal(continued, false);
  }
});

test('unauthenticated public Worker request proceeds without page tracking', async () => {
  const response = await handleRequest(contextFor('/'), async () => new Response('public page'));
  assert.equal(await response.text(), 'public page');
  assert.equal(response.headers.has('set-cookie'), false);
});

test('same-host POST guard remains active for Worker admin API requests', async () => {
  const context = contextFor('/api/admin/change-password', null);
  context.request = new Request('https://preview.example/api/admin/change-password', {
    method: 'POST', headers: { origin: 'https://attacker.example', host: 'preview.example' },
  });
  let continued = false;
  const response = await handleRequest(context, async () => { continued = true; return new Response('unexpected'); });
  assert.equal(response.status, 403);
  assert.equal(continued, false);
});

test('valid synthetic D1 session resolves the request admin from the Worker binding', async () => {
  const now = new Date().toISOString();
  await workerDb.insert(schema.adminUsers).values({ id: 'worker-user', username: 'worker', passwordHash: hashPassword('synthetic-password'), role: 'admin', permissions: 1, createdAt: now });
  await workerDb.insert(schema.adminSessions).values({ id: 'worker-session', userId: 'worker-user', expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now });
  const token = signSession('worker-session', secret);
  const context = contextFor('/admin/dashboard', token);
  let observedAdmin;
  const response = await handleRequest(context, async () => { observedAdmin = context.locals.admin; return new Response('dashboard'); });
  assert.equal(response.status, 200);
  assert.deepEqual(observedAdmin, { id: 'worker-user', username: 'worker', role: 'admin', permissions: 1 });
});

test('protected admin route uses the same D1 binding for forced-password-change lookup', async () => {
  const now = new Date().toISOString();
  await workerDb.insert(schema.adminUsers).values({ id: 'forced-user', username: 'forced', passwordHash: hashPassword('change-me-now'), role: 'admin', permissions: 0, createdAt: now });
  await workerDb.insert(schema.adminSessions).values({ id: 'forced-session', userId: 'forced-user', expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now });
  const token = signSession('forced-session', secret);
  let continued = false;
  const response = await handleRequest(contextFor('/admin/dashboard', token), async () => { continued = true; return new Response('unexpected'); });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/account?force=1');
  assert.equal(continued, false);
});
