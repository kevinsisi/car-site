import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const state = { auth: [], imports: [], adapters: [], fetches: 0, authResult: {} };
globalThis.__productionCarsmeet = state;
const modules = {
  '@/db/d1': `export async function createD1Db(binding) { const adapter = { binding }; globalThis.__productionCarsmeet.adapters.push(adapter); return adapter; }`,
  '@/lib/auth': `export async function getPermittedOrResponse(cookies, permission, options) { globalThis.__productionCarsmeet.auth.push({ permission, options }); return globalThis.__productionCarsmeet.authResult; }`,
  '@/lib/permissions': `export const PERMISSIONS = { VEHICLES_EDIT: 2 };`,
  '@/lib/vehicles': `export async function importVehicle(input, adapter) { globalThis.__productionCarsmeet.imports.push({ input, adapter }); return { vehicleId: 'synthetic-vehicle', status: 'draft' }; }`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { POST } = await import('../../src/pages/api/admin/vehicles/import-carsmeet.ts');
const { createD1Db } = await import('../../src/db/d1.ts');
const vehicleRepo = await import('../../src/lib/vehicles.ts');
const html = `<!doctype html><html><head><meta property="og:title" content="2022 BMW M3 Competition"><meta name="description" content="Synthetic description"></head><body><h1>2022 BMW M3 Competition</h1><div id="acf_spec"><div class="custom-grid-content"><item>年式</item><item>2022</item><item>里程</item><item>12,000 km</item></div></div><img src="https://carsmeet.tw/wp-content/uploads/2026/01/synthetic-car.jpg"></body></html>`;
const db = { marker: 'synthetic-d1' };
const env = { MITA_ENV: 'production', MITA_PUBLIC_SYNC_ENABLED: 'true', DB_PREVIEW: db, SESSION_SECRET: 'synthetic-session-secret' };

function context(url, overrides = {}) {
  return {
    request: new Request('https://mita.example/api/admin/vehicles/import-carsmeet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) }),
    cookies: {},
    locals: { runtime: { env: { ...env, ...overrides } } },
  };
}

class SqliteD1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); }
  exec(sql) { this.sqlite.exec(sql); }
  prepare(sql) {
    let values = [];
    const statement = this.sqlite.prepare(sql);
    const bound = {
      bind(...args) { values = args; return bound; },
      all() { return { results: statement.all(...values) }; },
      first() { return statement.get(...values) ?? null; },
      raw() { return statement.all(...values).map((row) => Object.values(row)); },
      run() { return statement.run(...values); },
    };
    return bound;
  }
  batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

function sqliteD1() {
  const binding = new SqliteD1();
  binding.exec(`
    CREATE TABLE vehicles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, card_title_supplement TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL, model TEXT NOT NULL, sub_model TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '', mileage TEXT NOT NULL DEFAULT '', exterior_color TEXT NOT NULL DEFAULT '', interior_color TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', headline TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', features_json TEXT NOT NULL DEFAULT '[]', monthly_recommended INTEGER NOT NULL DEFAULT 0, show_sold_case INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', external_id TEXT, local_edits_json TEXT NOT NULL DEFAULT '[]', sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX vehicles_source_external_idx ON vehicles(source, external_id);
    CREATE TABLE vehicle_images (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_cover INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE import_mappings (id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, last_imported_at TEXT NOT NULL);
    CREATE UNIQUE INDEX import_mappings_source_external_idx ON import_mappings(source, external_id);
    CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);
  return binding;
}

test('production Worker imports Carsmeet HTML as draft through D1 and preserves response and mapping identity', async () => {
  const previousFetch = globalThis.fetch;
  state.authResult = {};
  state.imports.length = 0;
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests += 1;
    assert.equal(String(url), 'https://carsmeet.tw/12345/');
    assert.equal(options.redirect, 'manual');
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  try {
    const response = await POST(context('https://carsmeet.tw/12345/'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, vehicleId: 'synthetic-vehicle', status: 'draft', source: 'carsmeet', externalId: '12345', title: '2022 BMW M3 Competition', imageCount: 1 });
    const first = state.imports.at(-1);
    assert.equal(first.adapter.binding, db);
    assert.deepEqual({ source: first.input.source, externalId: first.input.externalId, slug: first.input.slug, status: first.input.publishMode }, { source: 'carsmeet', externalId: '12345', slug: '12345', status: 'draft' });
    assert.deepEqual(first.input.photos, ['https://carsmeet.tw/wp-content/uploads/2026/01/synthetic-car.jpg']);
    await POST(context('https://carsmeet.tw/12345/'));
    assert.equal(state.imports.at(-1).input.externalId, first.input.externalId);
    assert.equal(requests, 2);
  } finally { globalThis.fetch = previousFetch; }
});

test('real Carsmeet importVehicle D1 adapter persists draft and reuses its external mapping on repeat', async () => {
  const binding = sqliteD1();
  try {
    const adapter = await createD1Db(binding);
    const input = { source: 'carsmeet', externalId: '12345', slug: '12345', title: 'Synthetic BMW', brand: 'BMW', model: 'M3', photos: ['https://carsmeet.tw/wp-content/uploads/synthetic.jpg'], publishMode: 'draft' };
    const first = await vehicleRepo.importVehicle(input, adapter);
    const second = await vehicleRepo.importVehicle(input, adapter);
    const vehicle = binding.prepare('SELECT id,status,source,external_id FROM vehicles WHERE id=?').bind(first.vehicleId).first();
    const mapping = binding.prepare('SELECT id,vehicle_id FROM import_mappings WHERE source=? AND external_id=?').bind('carsmeet', '12345').first();
    const photos = binding.prepare('SELECT url FROM vehicle_images WHERE vehicle_id=?').bind(first.vehicleId).all().results;
    assert.equal(first.vehicleId, second.vehicleId);
    assert.equal(vehicle.status, 'draft');
    assert.equal(vehicle.source, 'carsmeet');
    assert.equal(vehicle.external_id, '12345');
    assert.equal(mapping.vehicle_id, first.vehicleId);
    assert.equal(photos.length, 1);
    assert.equal(photos[0].url, input.photos[0]);
  } finally { binding.sqlite.close(); }
});

test('production does not fetch for invalid URL, denied permission, or disabled production gate', async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('unexpected fetch'); };
  try {
    assert.equal((await POST(context('https://example.invalid/12345/'))).status, 400);
    state.authResult = new Response('Forbidden', { status: 403 });
    assert.equal((await POST(context('https://carsmeet.tw/12345/'))).status, 403);
    state.authResult = {};
    assert.equal((await POST(context('https://carsmeet.tw/12345/', { MITA_PUBLIC_SYNC_ENABLED: 'false' }))).status, 501);
    assert.equal(fetchCalls, 0);
  } finally { globalThis.fetch = previousFetch; state.authResult = {}; }
});

test('production fetch rejects bad content, oversized response, timeout and unsafe or excessive redirects', async (t) => {
  const { importableCarsmeetData, CarsmeetImportError } = await import('../../src/lib/carsmeet-import.ts');
  await t.test('non HTML and malformed page', async () => {
    for (const response of [new Response('x', { headers: { 'content-type': 'text/plain' } }), new Response('<html><h1>no photos</h1></html>', { headers: { 'content-type': 'text/html' } })]) {
    await assert.rejects(importableCarsmeetData('https://carsmeet.tw/12345/', { workerSafe: true }, async () => response), CarsmeetImportError);
    }
  });
  await t.test('oversize and timeout', async () => {
    await assert.rejects(importableCarsmeetData('https://carsmeet.tw/12345/', { workerSafe: true }, async () => new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } })), (error) => error.status === 502);
    await assert.rejects(importableCarsmeetData('https://carsmeet.tw/12345/', { workerSafe: true }, async (_url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))), (error) => error.status === 502);
  });
  await t.test('redirect policy is bounded and restricted to approved host', async () => {
    await assert.rejects(importableCarsmeetData('https://carsmeet.tw/12345/', { workerSafe: true }, async () => new Response(null, { status: 302, headers: { location: 'https://example.invalid/redirect' } })), (error) => error.status === 502);
    let hops = 0;
    await assert.rejects(importableCarsmeetData('https://carsmeet.tw/12345/', { workerSafe: true }, async (url) => { hops += 1; return new Response(null, { status: 302, headers: { location: new URL(`/${12345 + hops}/`, url).toString() } }); }), (error) => error.status === 502);
    assert.equal(hops, 4);
  });
});

test('preview Worker remains a no-fetch 501', async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('unexpected fetch'); };
  try {
    const response = await POST(context('https://carsmeet.tw/12345/', { MITA_ENV: 'preview', MITA_PUBLIC_SYNC_ENABLED: 'false' }));
    assert.equal(response.status, 501);
    assert.equal((await response.json()).previewOnly, true);
    assert.equal(fetchCalls, 0);
  } finally { globalThis.fetch = previousFetch; }
});
