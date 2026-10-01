import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Database from 'better-sqlite3';
import { hashPassword } from '../../src/lib/crypto.ts';
import { createD1Db } from '../../src/db/d1.ts';
import { createSession, getSession, hasAnyUsers } from '../../src/lib/auth.ts';
import { getSettings } from '../../src/lib/settings.ts';
import * as schema from '../../src/db/schema.ts';

const pagePaths = [
  '../../src/pages/admin/settings.astro',
  '../../src/pages/admin/settings/basic.astro',
  '../../src/pages/admin/settings/features.astro',
  '../../src/pages/admin/settings/layout.astro',
  '../../src/pages/admin/settings/gallery.astro',
];
const pages = await Promise.all(pagePaths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
const sessionSecret = 'synthetic-settings-session-secret';

function createSyntheticD1Binding() {
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

test('all five settings pages require Worker bindings and use request-scoped D1 auth/settings', () => {
  for (const page of pages) {
    assert.match(page, /const runtime = Astro\.locals\.runtime;/);
    assert.match(page, /const binding = runtime\?\.env\?\.DB_PREVIEW;/);
    assert.match(page, /const sessionSecret = runtime\?\.env\?\.SESSION_SECRET;/);
    assert.match(page, /if \(runtime && \(!binding \|\| !sessionSecret\)\) return new Response\('Preview database unavailable', \{ status: 503 \}\);/);
    assert.match(page, /const adapter = binding \? await createD1Db\(binding\) : undefined;/);
    assert.match(page, /const authOptions = \{ db: adapter, sessionSecret \};/);
    assert.match(page, /hasAnyUsers\(authOptions\)/);
    assert.match(page, /getSession\(Astro\.cookies, authOptions\)/);
    if (page.includes('getSettings')) assert.match(page, /getSettings\(adapter\)/);
    assert.doesNotMatch(page, /hasAnyUsers\(\)|getSession\(Astro\.cookies\)|getSettings\(\)/);
  }
});

test('synthetic request D1 supplies admin identity and settings to auth/settings helpers', async (t) => {
  const { binding, sqlite } = createSyntheticD1Binding();
  t.after(() => binding.close());
  const db = await createD1Db(binding);
  await db.insert(schema.adminUsers).values({
    id: 'synthetic-settings-user', username: 'synthetic-settings', passwordHash: hashPassword('synthetic-password'),
    role: 'admin', permissions: 0, createdAt: new Date().toISOString(),
  });
  await db.insert(schema.siteSettings).values({ key: 'siteName', value: 'Synthetic D1 Site', updatedAt: new Date().toISOString() });

  const options = { db, sessionSecret };
  assert.equal(await hasAnyUsers(options), true);
  assert.equal((await getSettings(db)).siteName, 'Synthetic D1 Site');

  const created = await createSession('synthetic-settings', 'synthetic-password', options);
  assert.ok(created);
  const cookies = { get: (name) => name === 'car_site_admin' ? { value: created.cookieValue } : undefined };
  assert.deepEqual(await getSession(cookies, options), {
    id: 'synthetic-settings-user', username: 'synthetic-settings', role: 'admin', permissions: 0,
  });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get().count, 1);
});
