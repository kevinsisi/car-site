import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const state = { imports: [], authResult: {} };
globalThis.__boundedCarsmeet = state;
const modules = {
  '@/db/d1': `export async function createD1Db(binding) { return globalThis.__boundedCarsmeet.createAdapter(binding); }`,
  '@/lib/auth': `export async function getPermittedOrResponse() { return globalThis.__boundedCarsmeet.authResult; }`,
  '@/lib/permissions': `export const PERMISSIONS = { VEHICLES_EDIT: 2 };`,
  '@/lib/vehicles': `export async function importVehicle(input, adapter) {
    globalThis.__boundedCarsmeet.imports.push({ input, adapter });
    return globalThis.__boundedCarsmeet.importImplementation(input, adapter);
  }`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) return { format: 'module', source: 'export const db = globalThis.__boundedCarsmeet.nodeDb;', shortCircuit: true };
    return nextLoad(url, context);
  },
});

const { POST } = await import('../../src/pages/api/admin/vehicles/import-carsmeet.ts');
const repo = await import('../../src/lib/vehicles.ts');
const imageUrl = (index) => `https://carsmeet.tw/wp-content/uploads/2026/01/photo-${index}.jpg`;

function page(photoCount) {
  return `<!doctype html><html><head><meta property="og:title" content="2022 BMW M3 Competition"></head><body><h1>2022 BMW M3 Competition</h1>${Array.from({ length: photoCount }, (_, index) => `<img src="${imageUrl(index)}">`).join('')}</body></html>`;
}

function request(url, runtime = true, envOverrides = {}) {
  return {
    request: new Request('https://mita.example/api/admin/vehicles/import-carsmeet', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
    }),
    cookies: {},
    locals: { runtime: runtime ? { env: { MITA_ENV: 'production', MITA_PUBLIC_SYNC_ENABLED: 'true', DB_PREVIEW: {}, SESSION_SECRET: 'fixture-secret', ...envOverrides } } : undefined },
  };
}

class SqliteD1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.queries = []; this.batches = []; }
  exec(sql) { this.sqlite.exec(sql); }
  prepare(sql) {
    this.queries.push(sql);
    let values = [];
    const statement = this.sqlite.prepare(sql);
    const bound = {
      sql,
      bind(...args) { values = args; return bound; },
      all() { return { results: statement.all(...values) }; },
      first() { return statement.get(...values) ?? null; },
      raw() { return statement.all(...values).map((row) => Object.values(row)); },
      run() { return statement.run(...values); },
    };
    return bound;
  }
  batch(statements) {
    this.batches.push(statements.map((statement) => statement.sql));
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
}

function database() {
  const binding = new SqliteD1();
  binding.exec(`
    CREATE TABLE vehicles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, card_title_supplement TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL, model TEXT NOT NULL, sub_model TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '', mileage TEXT NOT NULL DEFAULT '', exterior_color TEXT NOT NULL DEFAULT '', interior_color TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', headline TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', features_json TEXT NOT NULL DEFAULT '[]', monthly_recommended INTEGER NOT NULL DEFAULT 0, show_sold_case INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', external_id TEXT, local_edits_json TEXT NOT NULL DEFAULT '[]', sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX vehicles_source_external_idx ON vehicles(source, external_id);
    CREATE TABLE vehicle_images (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_cover INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE import_mappings (id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, last_imported_at TEXT NOT NULL);
    CREATE UNIQUE INDEX import_mappings_source_external_idx ON import_mappings(source, external_id);
    CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE brand_aliases (source_brand TEXT PRIMARY KEY, display_name TEXT NOT NULL, url_slug TEXT NOT NULL DEFAULT '', icon_url TEXT, updated_at TEXT NOT NULL);
  `);
  return binding;
}

function install(binding) {
  globalThis.__boundedCarsmeet.activeBinding = binding;
  globalThis.__boundedCarsmeet.createAdapter = () => createD1Db(globalThis.__boundedCarsmeet.activeBinding);
  globalThis.__boundedCarsmeet.importImplementation = (input, adapter) => adapter
    ? repo.importVehicle(input, adapter)
    : Promise.resolve({ vehicleId: 'node-spy-vehicle', status: 'draft' });
  return binding;
}

const { createD1Db } = await import('../../src/db/d1.ts');

test('production Worker rejects 33 eligible photos before import or any D1 write', async () => {
  const binding = install(database());
  const originalFetch = globalThis.fetch;
  globalThis.__boundedCarsmeet.imports.length = 0;
  globalThis.fetch = async () => new Response(page(33), { headers: { 'content-type': 'text/html' } });
  try {
    const response = await POST(request('https://carsmeet.tw/12345/'));
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /照片.*32/);
    assert.equal(state.imports.length, 0);
    assert.equal(binding.queries.filter((sql) => /^(insert|update|delete)/i.test(sql.trim())).length, 0);
    assert.equal(binding.batches.length, 0);
  } finally { globalThis.fetch = originalFetch; binding.close(); }
});

test('32 Worker photos persist intact as draft and repeat import reuses case-insensitive identity', async () => {
  const binding = install(database());
  const adapter = await createD1Db(binding);
  const originalFetch = globalThis.fetch;
  globalThis.__boundedCarsmeet.imports.length = 0;
  globalThis.fetch = async () => new Response(page(32), { headers: { 'content-type': 'text/html' } });
  try {
    const firstResponse = await POST(request('https://carsmeet.tw/12345/'));
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(first.imageCount, 32);
    assert.ok(state.imports.at(-1).adapter);
    const vehicle = binding.prepare('SELECT id,status,source,external_id FROM vehicles WHERE id=?').bind(first.vehicleId).first();
    const mapping = binding.prepare('SELECT id,vehicle_id FROM import_mappings WHERE source=? AND external_id=?').bind('carsmeet', '12345').first();
    assert.deepEqual({ status: vehicle.status, source: vehicle.source, externalId: vehicle.external_id }, { status: 'draft', source: 'carsmeet', externalId: '12345' });
    assert.equal(mapping.vehicle_id, first.vehicleId);
    assert.deepEqual(binding.prepare('SELECT url FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order').bind(first.vehicleId).all().results.map(({ url }) => url), Array.from({ length: 32 }, (_, index) => imageUrl(index)));
    const stableMapping = mapping.id;
    const repeat = await repo.importVehicle({ source: 'CARSMEET', externalId: '12345', slug: '12345', title: 'Repeat BMW', brand: 'BMW', model: 'M3', photos: Array.from({ length: 32 }, (_, index) => imageUrl(index)), publishMode: 'draft' }, adapter);
    assert.equal(repeat.vehicleId, first.vehicleId);
    assert.equal(binding.prepare('SELECT id FROM import_mappings WHERE source=? AND external_id=?').bind('carsmeet', '12345').first().id, stableMapping);
    assert.equal(binding.prepare('SELECT COUNT(*) AS count FROM vehicle_images WHERE vehicle_id=?').bind(first.vehicleId).first().count, 32);
  } finally { globalThis.fetch = originalFetch; binding.close(); }
});

test('preview remains 501 and Node import still accepts 33 photos', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; return new Response(page(33), { headers: { 'content-type': 'text/html' } }); };
  const binding = install(database());
  try {
    const preview = await POST(request('https://carsmeet.tw/12345/', true, { MITA_ENV: 'preview', MITA_PUBLIC_SYNC_ENABLED: 'false' }));
    assert.equal(preview.status, 501);
    const node = await POST(request('https://carsmeet.tw/12345/', false));
    assert.equal(node.status, 200);
    assert.equal(state.imports.at(-1).input.photos.length, 33);
    assert.equal(state.imports.at(-1).adapter, undefined);
    assert.equal(fetchCalls, 1);
  } finally { globalThis.fetch = originalFetch; binding.close(); }
});

test('32-photo D1 fixture records bounded query and batch metrics with realistic unrelated rows', async () => {
  const binding = install(database());
  const adapter = await createD1Db(binding);
  const metrics = [];
  try {
    for (let index = 0; index < 73; index += 1) {
      await repo.importVehicle({ source: 'fixture', externalId: `unrelated-${index}`, slug: `unrelated-${index}`, title: `Fixture ${index}`, brand: 'BMW', model: 'M3', photos: Array.from({ length: 14 }, (_, photo) => imageUrl(1000 + index * 14 + photo)), publishMode: 'draft' }, adapter);
    }
    const input = { source: 'Carsmeet', externalId: 'Metrics-Case', slug: 'Metrics-Case', title: 'Metrics BMW', brand: 'BMW', model: 'M3', photos: Array.from({ length: 32 }, (_, index) => imageUrl(index)), publishMode: 'draft' };
    for (const phase of ['new', 'repeat']) {
      binding.queries.length = 0;
      binding.batches.length = 0;
      const phaseInput = phase === 'repeat' ? { ...input, source: 'CARSMEET', externalId: 'metrics-case', slug: 'metrics-case' } : input;
      await repo.importVehicle(phaseInput, adapter);
      const selects = binding.queries.filter((sql) => /^select/i.test(sql.trim()));
      const explain = selects.map((sql) => binding.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all());
      const statementBinds = binding.batches.flat().map((sql) => (sql.match(/\?/g) || []).length);
      metrics.push({ phase, selectQueryCount: selects.length, batchCount: binding.batches.length, batchStatementCount: binding.batches.reduce((sum, batch) => sum + batch.length, 0), maxParameterCount: Math.max(0, ...statementBinds), plans: explain });
    }
    assert.deepEqual(metrics.map(({ phase, selectQueryCount, batchCount, batchStatementCount, maxParameterCount }) => ({ phase, selectQueryCount, batchCount, batchStatementCount, maxParameterCount })), [
      { phase: 'new', selectQueryCount: 3, batchCount: 1, batchStatementCount: 35, maxParameterCount: 48 },
      { phase: 'repeat', selectQueryCount: 4, batchCount: 1, batchStatementCount: 35, maxParameterCount: 48 },
    ]);
    assert.ok(metrics.every(({ maxParameterCount }) => maxParameterCount <= 100));
    assert.ok(metrics.every(({ batchStatementCount }) => batchStatementCount + 15 <= 50), 'include documented 15-statement route/auth/settings budget');
    assert.ok(metrics.every(({ plans }) => plans.length > 0));
    console.log('Carsmeet D1 bounded fixture metrics:', JSON.stringify(metrics));
  } finally { binding.close(); }
});
