import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Database from 'better-sqlite3';
import { GET } from '../../src/pages/api/admin/analytics.ts';
import { createD1Db } from '../../src/db/d1.ts';
import * as schema from '../../src/db/schema.ts';
import { createSession } from '../../src/lib/auth.ts';
import { hashPassword } from '../../src/lib/crypto.ts';

const secret = 'synthetic-analytics-session-secret';
const sourcePath = new URL('../../src/pages/admin/analytics.astro', import.meta.url);

function syntheticD1() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', permissions INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);
  const binding = {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...next) { values = next; return statement; },
        async all() { return { results: sqlite.prepare(query).all(...values) }; },
        async raw() { return sqlite.prepare(query).raw().all(...values); },
        async first() { return sqlite.prepare(query).get(...values) ?? null; },
        async run() {
          const result = sqlite.prepare(query).run(...values);
          return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
        },
      };
      return statement;
    },
    close() { sqlite.close(); },
  };
  return { binding, sqlite };
}

function context(binding, cookieValue, env = { DB_PREVIEW: binding, SESSION_SECRET: secret }) {
  return {
    cookies: { get: (name) => name === 'car_site_admin' && cookieValue ? { value: cookieValue } : undefined },
    locals: { runtime: { env } },
  };
}

test('Worker analytics API authenticates with request D1, then reports explicit unavailability', async (t) => {
  const { binding, sqlite } = syntheticD1();
  t.after(() => binding.close());
  const db = await createD1Db(binding);
  const now = new Date().toISOString();
  await db.insert(schema.adminUsers).values([
    { id: 'DEMO-analytics-authorized', username: 'DEMO-analytics-authorized', passwordHash: hashPassword('synthetic-password'), role: 'admin', permissions: 0x2000, createdAt: now },
    { id: 'DEMO-analytics-denied', username: 'DEMO-analytics-denied', passwordHash: hashPassword('synthetic-password'), role: 'admin', permissions: 0, createdAt: now },
  ]);
  const authorized = await createSession('DEMO-analytics-authorized', 'synthetic-password', { db, sessionSecret: secret });
  const denied = await createSession('DEMO-analytics-denied', 'synthetic-password', { db, sessionSecret: secret });
  assert.ok(authorized);
  assert.ok(denied);

  const noSession = await GET(context(binding));
  assert.equal(noSession.status, 401);
  assert.equal((await GET(context(binding, denied.cookieValue))).status, 403);

  const response = await GET(context(binding, authorized.cookieValue));
  assert.equal(response.status, 501);
  assert.deepEqual(await response.json(), { error: 'preview_unavailable', message: 'Analytics are unavailable in Worker preview.' });
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name), ['admin_sessions', 'admin_users', 'site_settings']);
});

test('Worker analytics API requires D1 and session secret without falling back to native analytics', async () => {
  for (const env of [{ DB_PREVIEW: {} }, { SESSION_SECRET: secret }, {}]) {
    const response = await GET(context(undefined, undefined, env));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'preview_unavailable');
  }
});

test('analytics page uses request D1 identities and renders an explicit unavailable state in Worker preview', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /hasAnyUsers\(authOptions\)/);
  assert.match(source, /getSession\(Astro\.cookies, authOptions\)/);
  assert.match(source, /getSettings\(workerPreview \? authOptions\.db : undefined\)/);
  assert.match(source, /流量分析目前無法在 Worker 預覽環境使用/);
  assert.match(source, /AdminAnalytics client:load/);

  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter);
  const body = frontmatter[1]
    .replace(/^import .*;\n/gm, '')
    .replace(/env!\./g, 'env.')
    .replace(/(DB_PREVIEW|SESSION_SECRET)!/g, '$1');
  const evaluate = new Function(
    'Astro', 'createD1Db', 'hasAnyUsers', 'getSession', 'getSettings', 'hasFeature', 'FEATURE_ANALYTICS', 'hasPermission', 'PERMISSIONS',
      `return (async () => { ${body}\nreturn { user, settings, workerPreview }; })();`,
  );
  const binding = { marker: 'synthetic-analytics-d1' };
  const d1 = { marker: 'synthetic-drizzle-d1' };
  const calls = [];
  const Astro = {
    locals: { runtime: { env: { DB_PREVIEW: binding, SESSION_SECRET: secret } } },
    cookies: { marker: 'synthetic-cookies' },
    redirect(path) { return { status: 302, path }; },
  };
  const result = await evaluate(
    Astro,
    async (received) => { assert.equal(received, binding); return d1; },
    async (options) => { calls.push(['hasAnyUsers', options]); return true; },
    async (_cookies, options) => { calls.push(['getSession', options]); return { id: 'DEMO-admin' }; },
    async (adapter) => { calls.push(['getSettings', adapter]); return { featureLicenseMask: 0x7fffffff }; },
    () => true,
    0x100,
    () => true,
    { ANALYTICS: 0x2000 },
  );
  assert.equal(result.workerPreview, true);
  assert.deepEqual(calls.map(([name]) => name), ['hasAnyUsers', 'getSession', 'getSettings']);
  assert.equal(calls[0][1].db, d1);
  assert.equal(calls[0][1].sessionSecret, secret);
  assert.equal(calls[1][1], calls[0][1]);
  assert.equal(calls[2][1], d1);
});
