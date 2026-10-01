import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { POST } from '../../src/pages/api/admin/sell-inquiries/[id]/read.ts';
import { createSession } from '../../src/lib/auth.ts';
import { hashPassword } from '../../src/lib/crypto.ts';
import { createD1Db } from '../../src/db/d1.ts';
import * as schema from '../../src/db/schema.ts';
import { listSellInquiries } from '../../src/lib/sell-inquiries.ts';

const pagePath = new URL('../../src/pages/admin/sell-inquiries.astro', import.meta.url);
const routePath = new URL('../../src/pages/api/admin/sell-inquiries/[id]/read.ts', import.meta.url);
const sessionSecret = 'synthetic-inquiry-session-secret';

function createSyntheticD1() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', permissions INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE sell_inquiries (id TEXT PRIMARY KEY, brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', year INTEGER, mileage INTEGER, exterior_color TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', contact_info TEXT NOT NULL, contact_name TEXT NOT NULL DEFAULT '', photo_urls TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, read_at TEXT);
  `);
  const binding = {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...nextValues) { values = nextValues; return statement; },
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

function requestContext(binding, cookieValue) {
  return {
    params: { id: 'DEMO-inquiry-authorized' },
    cookies: { get: (name) => name === 'car_site_admin' ? { value: cookieValue } : undefined },
    locals: { runtime: { env: { DB_PREVIEW: binding, SESSION_SECRET: sessionSecret } } },
  };
}

test('sell inquiries admin page and read API use request-scoped D1 and session secret', async () => {
  const [page, route] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(routePath, 'utf8'),
  ]);

  assert.match(page, /runtime\?\.env\?\.DB_PREVIEW/);
  assert.match(page, /runtime\?\.env\?\.SESSION_SECRET/);
  assert.match(page, /if \(runtime && \(!binding \|\| !sessionSecret\)\)[\s\S]*status: 503/);
  assert.match(page, /hasAnyUsers\(authOptions\)/);
  assert.match(page, /getSession\(Astro\.cookies, authOptions\)/);
  assert.match(page, /getSettings\(adapter\)/);
  assert.match(page, /listSellInquiries\(adapter\)/);

  assert.match(route, /runtime\?\.env\?\.DB_PREVIEW/);
  assert.match(route, /runtime\?\.env\?\.SESSION_SECRET/);
  assert.match(route, /if \(runtime && \(!binding \|\| !sessionSecret\)\)[\s\S]*status: 503/);
  assert.match(route, /getPermittedOrResponse\(cookies, PERMISSIONS\.SELL_INQUIRIES, \{ db: adapter, sessionSecret \}\)/);
  assert.match(route, /markSellInquiryRead\(params\.id!, adapter\)/);
});

test('Worker read API fails closed when request bindings are missing', async () => {
  let nativeFallbackTouched = false;
  const response = await POST({
    params: { id: 'DEMO-inquiry-1' },
    cookies: { get: () => undefined },
    locals: { runtime: { env: {} } },
  }, {
    get db() {
      nativeFallbackTouched = true;
      throw new Error('native fallback must not be used');
    },
  });

  assert.equal(response.status, 503);
  assert.equal(nativeFallbackTouched, false);
});

test('Worker read API updates only the authorized DEMO inquiry and list helper returns an empty list', async (t) => {
  const { binding, sqlite } = createSyntheticD1();
  t.after(() => binding.close());
  const db = await createD1Db(binding);
  const now = new Date().toISOString();
  for (const [id, username, permissions] of [
    ['DEMO-authorized-user', 'DEMO-authorized', 0x0040],
    ['DEMO-unauthorized-user', 'DEMO-unauthorized', 0],
  ]) {
    await db.insert(schema.adminUsers).values({ id, username, passwordHash: hashPassword('synthetic-password'), role: 'admin', permissions, createdAt: now });
  }
  await db.insert(schema.sellInquiries).values([
    { id: 'DEMO-inquiry-authorized', brand: 'DEMO', model: 'Authorized', contactInfo: 'synthetic', createdAt: now, readAt: null },
    { id: 'DEMO-inquiry-unauthorized', brand: 'DEMO', model: 'Unauthorized', contactInfo: 'synthetic', createdAt: now, readAt: null },
  ]);
  const authorized = await createSession('DEMO-authorized', 'synthetic-password', { db, sessionSecret });
  const unauthorized = await createSession('DEMO-unauthorized', 'synthetic-password', { db, sessionSecret });
  assert.ok(authorized);
  assert.ok(unauthorized);

  const unauthorizedResponse = await POST(requestContext(binding, unauthorized.cookieValue));
  assert.equal(unauthorizedResponse.status, 403);
  assert.equal(sqlite.prepare('SELECT read_at FROM sell_inquiries WHERE id = ?').get('DEMO-inquiry-authorized').read_at, null);
  assert.equal(sqlite.prepare('SELECT read_at FROM sell_inquiries WHERE id = ?').get('DEMO-inquiry-unauthorized').read_at, null);

  const authorizedResponse = await POST(requestContext(binding, authorized.cookieValue));
  assert.equal(authorizedResponse.status, 200);
  assert.deepEqual(await authorizedResponse.json(), { ok: true });
  const authorizedReadAt = sqlite.prepare('SELECT read_at FROM sell_inquiries WHERE id = ?').get('DEMO-inquiry-authorized').read_at;
  assert.ok(authorizedReadAt);
  assert.equal(sqlite.prepare('SELECT read_at FROM sell_inquiries WHERE id = ?').get('DEMO-inquiry-unauthorized').read_at, null);

  const emptyBinding = createSyntheticD1();
  t.after(() => emptyBinding.binding.close());
  assert.deepEqual(await listSellInquiries(await createD1Db(emptyBinding.binding)), []);
});
