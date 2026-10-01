import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { signSession } from '../../src/lib/crypto.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/db/connection') {
      return { url: 'data:text/javascript,export%20const%20db%20%3D%20%7B%7D', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, permissions INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE vehicles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, card_title_supplement TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL, model TEXT NOT NULL, sub_model TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '', mileage TEXT NOT NULL DEFAULT '', exterior_color TEXT NOT NULL DEFAULT '', interior_color TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', headline TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', features_json TEXT NOT NULL DEFAULT '[]', monthly_recommended INTEGER NOT NULL DEFAULT 0, show_sold_case INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', external_id TEXT, local_edits_json TEXT NOT NULL DEFAULT '[]', sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE vehicle_images (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_cover INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE brand_aliases (source_brand TEXT PRIMARY KEY, display_name TEXT NOT NULL, url_slug TEXT NOT NULL DEFAULT '', icon_url TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  INSERT INTO vehicles (id, slug, title, brand, model, status, created_at, updated_at) VALUES ('sentinel-vehicle', 'sentinel', 'Sentinel vehicle', 'DEMO-brand', 'DEMO-model', 'published', 'DEMO-created', 'DEMO-updated');
  INSERT INTO admin_users VALUES ('DEMO-admin', 'DEMO-admin', 'unused', 'admin', 7, 'DEMO-created');
  INSERT INTO admin_sessions VALUES ('DEMO-session', 'DEMO-admin', '2999-01-01T00:00:00.000Z', 'DEMO-created');
`);
const calls = [];
const binding = {
  prepare(query) {
    let values = [];
    const statement = {
      query,
      bind(...args) { values = args; return statement; },
      values: () => values,
      async all() { return { results: sqlite.prepare(query).all(...values) }; },
      async raw() { return sqlite.prepare(query).all(...values).map((row) => Object.values(row)); },
      async first() { return sqlite.prepare(query).get(...values) ?? null; },
      async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
    };
    return statement;
  },
  async batch(statements) {
    calls.push(...statements);
    sqlite.exec('BEGIN');
    try {
      const results = statements.map(({ query, values }) => sqlite.prepare(query).run(...values()));
      sqlite.exec('COMMIT');
      return results.map((result) => ({ success: true, meta: { changes: result.changes } }));
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};
const secret = 'DEMO-worker-session-secret';
const token = signSession('DEMO-session', secret);
const cookies = (value = token) => ({ get: (name) => name === 'car_site_admin' && value ? { value } : undefined });
const context = (body, { id, token: cookie = token, runtime = true } = {}) => ({
  request: new Request('https://preview.example/api/admin/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  params: id ? { id } : {}, cookies: cookies(cookie), locals: runtime ? { runtime: { env: { DB_PREVIEW: binding, SESSION_SECRET: secret } } } : { runtime: undefined },
});

const vehicleRoute = await import('../../src/pages/api/admin/vehicles.ts');
const statusRoute = await import('../../src/pages/api/admin/vehicles/[id]/status.ts');
const brandRoute = await import('../../src/pages/api/admin/brand-aliases.ts');

after(() => sqlite.close());

test('Worker admin vehicle routes use request D1, preserve permissions, and leave non-fixture sentinel untouched', async () => {
  const unauthorized = await vehicleRoute.POST(context({ title: 'DEMO-denied', brand: 'DEMO-brand', model: 'DEMO-model' }, { token: null }));
  assert.equal(unauthorized.status, 401);

  const created = await vehicleRoute.POST(context({ id: 'DEMO-created', title: 'DEMO vehicle', brand: 'DEMO-brand', model: 'DEMO-model', status: 'draft' }));
  assert.equal(created.status, 200);
  const createdId = (await created.json()).vehicleId;
  assert.equal(createdId, 'DEMO-created');

  const updated = await vehicleRoute.POST(context({ id: createdId, title: 'DEMO updated', brand: 'DEMO-brand', model: 'DEMO-model' }));
  assert.equal(updated.status, 200);
  assert.equal(sqlite.prepare('SELECT title FROM vehicles WHERE id = ?').get(createdId).title, 'DEMO updated');

  const changedStatus = await statusRoute.POST(context({ status: 'sold' }, { id: createdId }));
  assert.equal(changedStatus.status, 200);
  assert.equal(sqlite.prepare('SELECT status FROM vehicles WHERE id = ?').get(createdId).status, 'sold');
  assert.deepEqual({ ...sqlite.prepare('SELECT id, title, status, updated_at FROM vehicles WHERE id = ?').get('sentinel-vehicle') }, {
    id: 'sentinel-vehicle', title: 'Sentinel vehicle', status: 'published', updated_at: 'DEMO-updated',
  });
  assert.ok(calls.length >= 3, 'vehicle create/update and status submitted through D1 batches');
});

test('Worker brand aliases use request D1 and reject unauthenticated writes', async () => {
  const unauthorized = await brandRoute.POST(context({ aliases: [] }, { token: null }));
  assert.equal(unauthorized.status, 401);

  const response = await brandRoute.POST(context({ aliases: [{ sourceBrand: 'DEMO-brand', displayName: 'DEMO display', urlSlug: 'demo-display' }] }));
  assert.equal(response.status, 200);
  assert.deepEqual({ ...sqlite.prepare('SELECT source_brand, display_name, url_slug FROM brand_aliases').get() }, {
    source_brand: 'DEMO-brand', display_name: 'DEMO display', url_slug: 'demo-display',
  });
  assert.ok(calls.length > 0, 'brand aliases submitted through the request D1 batch');
});

test('Worker admin vehicle write keeps the existing permission denial contract', async () => {
  sqlite.prepare('UPDATE admin_users SET permissions = 0 WHERE id = ?').run('DEMO-admin');
  const response = await vehicleRoute.POST(context({ title: 'DEMO-forbidden', brand: 'DEMO-brand', model: 'DEMO-model' }));
  assert.equal(response.status, 403);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM vehicles WHERE id = ?').get('DEMO-forbidden').count, 0);
  sqlite.prepare('UPDATE admin_users SET permissions = 7 WHERE id = ?').run('DEMO-admin');
});

test('Worker admin routes fail closed if request D1 binding is missing', async () => {
  const noBinding = (body) => ({ ...context(body), locals: { runtime: { env: {} } } });
  assert.equal((await vehicleRoute.POST(noBinding({ title: 'DEMO', brand: 'DEMO', model: 'DEMO' }))).status, 503);
  assert.equal((await brandRoute.POST(noBinding({ aliases: [] }))).status, 503);
  assert.equal((await statusRoute.POST({ ...noBinding({ status: 'draft' }), params: { id: 'DEMO-created' } })).status, 503);
});
