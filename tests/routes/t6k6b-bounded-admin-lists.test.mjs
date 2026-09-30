import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createD1Db } from '../../src/db/d1.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      return { format: 'module', source: 'export const db = globalThis.__t6k6bNodeDb;', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE vehicles (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, card_title_supplement TEXT NOT NULL,
    brand TEXT NOT NULL, model TEXT NOT NULL, sub_model TEXT NOT NULL, year TEXT NOT NULL,
    mileage TEXT NOT NULL, exterior_color TEXT NOT NULL, interior_color TEXT NOT NULL, condition TEXT NOT NULL,
    status TEXT NOT NULL, headline TEXT NOT NULL, description TEXT NOT NULL, features_json TEXT NOT NULL,
    monthly_recommended INTEGER NOT NULL, show_sold_case INTEGER NOT NULL, source TEXT NOT NULL,
    external_id TEXT, local_edits_json TEXT NOT NULL, sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE vehicle_images (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, url TEXT NOT NULL, alt TEXT NOT NULL, sort_order INTEGER NOT NULL, is_cover INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE brand_aliases (source_brand TEXT PRIMARY KEY, display_name TEXT NOT NULL, url_slug TEXT NOT NULL, icon_url TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
`);

const queries = [];
const binding = {
  prepare(query) {
    let values = [];
    const statement = {
      bind(...nextValues) { values = nextValues; return statement; },
      async all() { queries.push(query); return { results: sqlite.prepare(query).all(...values) }; },
      async raw() { queries.push(query); return sqlite.prepare(query).raw().all(...values); },
      async first() { queries.push(query); return sqlite.prepare(query).get(...values) ?? null; },
      async run() { const result = sqlite.prepare(query).run(...values); return { success: true, meta: { changes: result.changes } }; },
    };
    return statement;
  },
};

const nodeDb = await createD1Db(binding);
globalThis.__t6k6bNodeDb = nodeDb;
const vehiclesRepo = await import('../../src/lib/vehicles.ts');
const aliasesRepo = await import('../../src/lib/brand-aliases.ts');

for (let index = 0; index < 105; index += 1) {
  const id = `vehicle-${String(index).padStart(3, '0')}`;
  sqlite.prepare(`INSERT INTO vehicles VALUES (?, ?, ?, '', 'Maker', 'Model', '', '2025', '100', '', '', 'Good', 'published', '', '', '[]', 0, 0, 'test', NULL, '[]', NULL, 'now', ?)`)
    .run(id, id, id, `2025-01-${String((index % 28) + 1).padStart(2, '0')}`);
  sqlite.prepare('INSERT INTO brand_aliases VALUES (?, ?, ?, NULL, ?)').run(`Brand ${String(index).padStart(3, '0')}`, `Brand ${index}`, '', 'now');
}

test('admin list helpers cap rows in SQL and retain unlimited Node defaults', async () => {
  queries.length = 0;
  const cappedVehicles = await vehiclesRepo.listAdminVehicles(nodeDb, 100);
  const vehicleQuery = queries.find((query) => /FROM "vehicles"/i.test(query));
  assert.equal(cappedVehicles.length, 100);
  assert.match(vehicleQuery, /ORDER BY "vehicles"\."updated_at" DESC, "vehicles"\."id" ASC LIMIT \?/i);

  queries.length = 0;
  const cappedAliases = await aliasesRepo.listBrandAliases(nodeDb, 100);
  const aliasQuery = queries.find((query) => /FROM "brand_aliases"/i.test(query));
  assert.equal(cappedAliases.length, 100);
  assert.match(aliasQuery, /ORDER BY "brand_aliases"\."source_brand" ASC LIMIT \?/i);

  queries.length = 0;
  assert.equal((await vehiclesRepo.listAdminVehicles()).length, 105);
  assert.equal((await aliasesRepo.listBrandAliases()).length, 105);
  const unboundedListQueries = queries.filter((query) => /FROM "(?:vehicles|brand_aliases)"/i.test(query));
  assert.ok(unboundedListQueries.some((query) => /FROM "vehicles"/i.test(query)));
  assert.ok(unboundedListQueries.some((query) => /FROM "brand_aliases"/i.test(query)));
  assert.ok(unboundedListQueries.every((query) => !/\bLIMIT\b/i.test(query)));
  sqlite.close();
});

test('all Worker admin dashboard routes request a SQL cap while preserving existing Node calls', async () => {
  const root = new URL('../../src/pages/admin/', import.meta.url);
  for (const file of ['vehicles.astro', 'brands.astro', 'index.astro', 'contact.astro']) {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.match(source, /listAdminVehicles\((?:adapter|db), (?:adapter|db) \? 100 : undefined\)/, `${file} bounds vehicle rows`);
    assert.match(source, /listBrandAliases\((?:adapter|db), (?:adapter|db) \? 100 : undefined\)/, `${file} bounds alias rows`);
    assert.doesNotMatch(source, /\.slice\(0,\s*100\)|\.sort\(/, `${file} does not sort or slice fetched rows`);
  }
});
