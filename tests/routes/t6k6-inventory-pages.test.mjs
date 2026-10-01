import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createD1Db } from '../../src/db/d1.ts';
import { createSession, getSession, hasAnyUsers } from '../../src/lib/auth.ts';
import { hashPassword } from '../../src/lib/crypto.ts';
import { listBrandAliases } from '../../src/lib/brand-aliases.ts';
import { getSettings } from '../../src/lib/settings.ts';
import * as schema from '../../src/db/schema.ts';

const pageRoot = new URL('../../src/pages/admin/', import.meta.url);
const [vehiclesPage, brandsPage] = await Promise.all([
  readFile(new URL('vehicles.astro', pageRoot), 'utf8'),
  readFile(new URL('brands.astro', pageRoot), 'utf8'),
]);

function createSyntheticD1Binding() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', permissions INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE brand_aliases (source_brand TEXT PRIMARY KEY, display_name TEXT NOT NULL, url_slug TEXT NOT NULL DEFAULT '', icon_url TEXT, updated_at TEXT NOT NULL);
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

test('inventory admin pages require preview bindings and pass request D1 into reads', () => {
  for (const source of [vehiclesPage, brandsPage]) {
    assert.match(source, /const runtime = Astro\.locals\.runtime;/);
    assert.match(source, /const binding = runtime\?\.env\?\.DB_PREVIEW;/);
    assert.match(source, /const sessionSecret = runtime\?\.env\?\.SESSION_SECRET;/);
    assert.match(source, /if \(runtime && \(!binding \|\| !sessionSecret\)\) return new Response\('Preview database unavailable', \{ status: 503 \}\);/);
    assert.match(source, /const adapter = binding \? await createD1Db\(binding\) : undefined;/);
    assert.match(source, /const authOptions = \{ db: adapter, sessionSecret \};/);
    assert.match(source, /hasAnyUsers\(authOptions\)/);
    assert.match(source, /getSession\(Astro\.cookies, authOptions\)/);
    assert.match(source, /listBrandAliases\(adapter, adapter \? 100 : undefined\)/);
    assert.match(source, /listAdminVehicles\(adapter, adapter \? 100 : undefined\)/);
    assert.doesNotMatch(source, /hasAnyUsers\(\)|getSession\(Astro\.cookies\)|listBrandAliases\(\)|listAdminVehicles\(\)/);
  }
  assert.match(vehiclesPage, /getSettings\(adapter\)/);
  assert.doesNotMatch(vehiclesPage, /\.slice\(0,\s*100\)/);
  assert.doesNotMatch(brandsPage, /\.slice\(0,\s*100\)/);
});

test('synthetic request D1 provides auth, settings, aliases, and empty-list behavior', async (t) => {
  const { binding, sqlite } = createSyntheticD1Binding();
  t.after(() => binding.close());
  const db = await createD1Db(binding);
  const updatedAt = new Date().toISOString();
  await db.insert(schema.adminUsers).values({
    id: 'synthetic-inventory-user', username: 'synthetic-inventory',
    passwordHash: hashPassword('synthetic-password'), role: 'admin', permissions: 0, createdAt: updatedAt,
  });
  await db.insert(schema.siteSettings).values({ key: 'siteName', value: 'Synthetic Inventory', updatedAt });
  await db.insert(schema.brandAliases).values({ sourceBrand: 'Synthetic', displayName: 'Synthetic Motors', urlSlug: 'synthetic-motors', iconUrl: null, updatedAt });

  const options = { db, sessionSecret: 'synthetic-inventory-session-secret' };
  assert.equal(await hasAnyUsers(options), true);
  assert.equal((await getSettings(db)).siteName, 'Synthetic Inventory');
  assert.deepEqual(await listBrandAliases(db), [{ sourceBrand: 'Synthetic', displayName: 'Synthetic Motors', urlSlug: 'synthetic-motors', iconUrl: null }]);
  const created = await createSession('synthetic-inventory', 'synthetic-password', options);
  assert.ok(created);
  const cookies = { get: (name) => name === 'car_site_admin' ? { value: created.cookieValue } : undefined };
  assert.equal((await getSession(cookies, options)).id, 'synthetic-inventory-user');
  assert.equal(await hasAnyUsers({ db: await createD1Db(createEmptyBinding()) }), false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get().count, 1);
});

function createEmptyBinding() {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'admin\', permissions INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)');
  return {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...nextValues) { values = nextValues; return statement; },
        async all() { return { results: sqlite.prepare(query).all(...values) }; },
        async raw() { return sqlite.prepare(query).raw().all(...values); },
        async first() { return sqlite.prepare(query).get(...values) ?? null; },
        async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } }; },
      };
      return statement;
    },
  };
}
