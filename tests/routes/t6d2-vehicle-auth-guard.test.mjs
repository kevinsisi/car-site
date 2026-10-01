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
  INSERT INTO admin_users VALUES ('DEMO-admin', 'DEMO-admin', 'unused', 'admin', 7, 'DEMO-created');
  INSERT INTO admin_sessions VALUES ('DEMO-session', 'DEMO-admin', '2999-01-01T00:00:00.000Z', 'DEMO-created');
`);

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
const cookies = { get: (name) => name === 'car_site_admin' ? { value: token } : undefined };
const context = (body, env) => ({
  request: new Request('https://preview.example/api/admin/test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }),
  cookies,
  locals: { runtime: { env } },
});

const vehicleRoute = await import('../../src/pages/api/admin/vehicles.ts');
const brandRoute = await import('../../src/pages/api/admin/brand-aliases.ts');

after(() => sqlite.close());

test('Worker vehicle APIs fail closed when SESSION_SECRET is missing', async () => {
  const env = { DB_PREVIEW: binding };
  assert.equal((await vehicleRoute.POST(context({ title: 'DEMO', brand: 'DEMO', model: 'DEMO' }, env))).status, 503);
  assert.equal((await brandRoute.POST(context({ aliases: [] }, env))).status, 503);
});

test('Worker vehicle APIs authenticate with the configured secret and request D1', async () => {
  const env = { DB_PREVIEW: binding, SESSION_SECRET: secret };
  const vehicle = await vehicleRoute.POST(context({ id: 'DEMO-vehicle', title: 'DEMO vehicle', brand: 'DEMO-brand', model: 'DEMO-model' }, env));
  assert.equal(vehicle.status, 200);
  assert.equal(sqlite.prepare('SELECT title FROM vehicles WHERE id = ?').get('DEMO-vehicle').title, 'DEMO vehicle');

  const brand = await brandRoute.POST(context({ aliases: [{ sourceBrand: 'DEMO-brand', displayName: 'DEMO display', urlSlug: 'demo-display' }] }, env));
  assert.equal(brand.status, 200);
  assert.deepEqual({ ...sqlite.prepare('SELECT source_brand, display_name, url_slug FROM brand_aliases').get() }, {
    source_brand: 'DEMO-brand', display_name: 'DEMO display', url_slug: 'demo-display',
  });
});
