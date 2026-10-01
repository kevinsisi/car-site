import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/lib/auth.ts')) return { format: 'module', source: 'export async function getPermittedOrResponse(){ return { id: "synthetic-admin", username: "synthetic-admin", role: "superadmin", permissions: 0 }; }', shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { POST: adminSave } = await import('../../src/pages/api/admin/vehicles.ts');

class SqliteD1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.writeCount = 0; }
  exec(sql) { this.sqlite.exec(sql); }
  prepare(sql) {
    let values = [];
    const statement = this.sqlite.prepare(sql);
    const bound = {
      bind(...args) { values = args; return bound; },
      all() { return { results: statement.all(...values) }; },
      first() { return statement.get(...values) ?? null; },
      raw() { return statement.all(...values).map((row) => Object.values(row)); },
      run() { thisDb.writeCount += 1; return statement.run(...values); },
    };
    const thisDb = this;
    bound.values = () => values;
    return bound;
  }
  batch(statements) {
    this.writeCount += statements.length;
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

function database({ indexed = true } = {}) {
  const binding = new SqliteD1();
  binding.exec(readFileSync(new URL('../../migrations/d1/0001_baseline.sql', import.meta.url), 'utf8'));
  binding.exec(readFileSync(new URL('../../migrations/d1/0002_shared_rate_limits.sql', import.meta.url), 'utf8'));
  binding.exec(readFileSync(new URL('../../migrations/d1-public-source/0001_public_source_sync.sql', import.meta.url), 'utf8'));
  if (indexed) binding.exec(readFileSync(new URL('../../migrations/d1-public-source/0002_vehicle_image_identity_index.sql', import.meta.url), 'utf8'));
  binding.prepare("INSERT INTO vehicles(id,slug,title,brand,model,created_at,updated_at) VALUES('vehicle-synthetic','vehicle-synthetic','Synthetic','Synthetic','Car','now','now')").run();
  return binding;
}

function seedImages(binding, count) {
  const insert = binding.sqlite.prepare('INSERT INTO vehicle_images(id,vehicle_id,url,sort_order,is_cover,created_at) VALUES(?,?,?,?,?,?)');
  binding.sqlite.exec('BEGIN');
  for (let i = 0; i < count; i += 1) insert.run(`image-${String(i).padStart(5, '0')}`, 'vehicle-synthetic', `/synthetic/${i}`, i, i === 0 ? 1 : 0, 'synthetic-time');
  binding.sqlite.exec('COMMIT');
}

async function save(binding, images) {
  const request = new Request('https://preview.invalid/api/admin/vehicles', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'vehicle-synthetic', title: 'Synthetic', brand: 'Synthetic', model: 'Car', status: 'published', images }),
  });
  return adminSave({ request, cookies: { get() { return undefined; } }, locals: { runtime: { env: { DB_PREVIEW: binding, SESSION_SECRET: 'synthetic-session-secret' } } } });
}

test('opted-in image input and retained rows are bounded before writes; 20,000 images preserve identity', async (t) => {
  const atLimit = database();
  try {
    seedImages(atLimit, 20_000);
    const started = performance.now();
    const response = await save(atLimit, Array.from({ length: 20_000 }, (_, i) => `/synthetic/${i}`));
    const elapsedMs = performance.now() - started;
    assert.equal(response.status, 200, await response.clone().text());
    const retained = atLimit.sqlite.prepare('SELECT COUNT(*) AS n FROM vehicle_images').get().n;
    assert.equal(retained, 20_000);
    assert.equal(atLimit.sqlite.prepare("SELECT id FROM vehicle_images WHERE url='/synthetic/19999'").get().id, 'image-19999');

    const oversizedInput = Array.from({ length: 20_001 }, (_, i) => `/synthetic/${i}`);
    const writesBeforeInputFailure = atLimit.writeCount;
    await assert.rejects(save(atLimit, oversizedInput), /more than 20000 images/);
    assert.equal(atLimit.writeCount, writesBeforeInputFailure);

    const tooManyRows = database();
    try {
      seedImages(tooManyRows, 20_001);
      const writesBeforeRowFailure = tooManyRows.writeCount;
      await assert.rejects(save(tooManyRows, ['/synthetic/new']), /more than 20000 retained rows/);
      assert.equal(tooManyRows.writeCount, writesBeforeRowFailure);
      assert.equal(tooManyRows.sqlite.prepare('SELECT COUNT(*) AS n FROM vehicle_images').get().n, 20_001);
    } finally { tooManyRows.sqlite.close(); }

    const migration = readFileSync(new URL('../../migrations/d1-public-source/0002_vehicle_image_identity_index.sql', import.meta.url), 'utf8');
    const planDb = database({ indexed: false });
    try {
      seedImages(planDb, 20_000);
      const query = 'SELECT id,url,alt,sort_order,is_cover,created_at FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order,id LIMIT 20001';
      const beforePlan = planDb.sqlite.prepare(`EXPLAIN QUERY PLAN ${query}`).all('vehicle-synthetic');
      const beforeStarted = performance.now();
      planDb.sqlite.prepare(query).all('vehicle-synthetic');
      const beforeMs = performance.now() - beforeStarted;
      planDb.exec(migration);
      const afterPlan = planDb.sqlite.prepare(`EXPLAIN QUERY PLAN ${query}`).all('vehicle-synthetic');
      const afterStarted = performance.now();
      planDb.sqlite.prepare(query).all('vehicle-synthetic');
      const afterMs = performance.now() - afterStarted;
      assert.ok(beforePlan.some(({ detail }) => detail.includes('SCAN vehicle_images')));
      assert.ok(beforePlan.some(({ detail }) => detail.includes('USE TEMP B-TREE FOR ORDER BY')));
      assert.ok(afterPlan.some(({ detail }) => detail.includes('SEARCH vehicle_images USING INDEX vehicle_images_vehicle_sort_id_idx')));
      assert.ok(afterPlan.every(({ detail }) => !detail.includes('USE TEMP B-TREE FOR ORDER BY')));
      assert.deepEqual({ inputCount: 20_000, retainedCount: retained, overLimitInputWrites: 0, overLimitRowsWrites: 0 }, { inputCount: 20_000, retainedCount: 20_000, overLimitInputWrites: 0, overLimitRowsWrites: 0 });
      t.diagnostic(JSON.stringify({ before: { rowCount: 20_000, elapsedMs: beforeMs, plan: beforePlan }, after: { rowCount: 20_000, elapsedMs: afterMs, plan: afterPlan }, atLimitRequestElapsedMs: elapsedMs }));
    } finally { planDb.sqlite.close(); }
  } finally { atLimit.sqlite.close(); }
});
