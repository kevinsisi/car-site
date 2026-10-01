import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      return { format: 'module', source: 'export const db = globalThis.__publicBoundNodeDb;', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const tables = ['vehicles', 'vehicle_images', 'brand_aliases', 'site_settings'];

function vehicle(id, index) {
  return {
    id, slug: id, title: id, card_title_supplement: '', brand: index < 101 ? 'Sample' : 'Outside', model: 'Model', sub_model: '', year: '2025', mileage: '1', exterior_color: '', interior_color: '', condition: 'Good', status: 'published', headline: '', description: '', features_json: '[]', monthly_recommended: 1, show_sold_case: 0, source: 'test', external_id: null, local_edits_json: '[]', sold_at: null, created_at: '2025-01-01', updated_at: '2025-01-01',
  };
}

function makeBinding(seed) {
  const calls = [];
  const rows = Object.fromEntries(tables.map((name) => [name, [...(seed[name] || [])]]));
  const binding = {
    calls,
    prepare(query) {
      let params = [];
      const normalized = query.toLowerCase();
      const run = () => {
        calls.push({ query, params: [...params] });
        const table = tables.find((name) => normalized.includes(`from "${name}"`));
        if (!table) throw new Error(`Unexpected SQL: ${query}`);
        let selected = [...rows[table]];
        if (table === 'vehicles' && normalized.includes('"status" in')) selected = selected.filter((row) => params.includes(row.status));
        else if (table === 'vehicles' && normalized.includes('"status" =')) selected = selected.filter((row) => row.status === params[0]);
        if (table === 'vehicles' && normalized.includes('"monthly_recommended" =')) selected = selected.filter((row) => Boolean(row.monthly_recommended) === Boolean(params.at(-1)));
        if (table === 'brand_aliases') selected = [];
        if (table === 'vehicle_images') selected = selected.filter((row) => params.includes(row.vehicle_id));
        if (normalized.includes('order by') && table === 'vehicles') {
          selected.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
        }
        if (table === 'vehicles') {
          const limit = normalized.match(/limit \?/);
          if (limit) selected = selected.slice(0, Number(params.at(-1)));
        }
        if (table === 'vehicles' && /^select\s+"brand"/.test(normalized)) selected = selected.map(({ brand }) => ({ brand }));
        return { results: selected };
      };
      return {
        bind(...values) { params = values; return this; },
        async all() { return run(); },
        async raw() { return run().results.map((row) => Object.values(row)); },
        async run() { throw new Error('Unexpected write'); },
      };
    },
  };
  return binding;
}

const seededVehicles = Array.from({ length: 105 }, (_, index) => vehicle(`vehicle-${String(index).padStart(3, '0')}`, index));
const { listPublicVehicles, listMonthlyRecommendedVehicles, listPublicInventoryVehicles, listSoldVehicles, listPublicBrands } = await import('../../src/lib/vehicles.ts');

test('Worker public list queries are bounded before the single batched image read; brand counts describe that sample', async () => {
  const binding = makeBinding({ vehicles: seededVehicles, site_settings: [{ key: 'showSoldVehicles', value: 'true', updated_at: 'now' }] });
  const db = await createD1Db(binding);
  for (const list of [listPublicVehicles, listMonthlyRecommendedVehicles, listPublicInventoryVehicles]) {
    const before = binding.calls.length;
    const result = await list(db);
    assert.equal(result.length, 100);
    const calls = binding.calls.slice(before);
    const vehicleRead = calls.find(({ query }) => /from "vehicles"/.test(query));
    const imageRead = calls.find(({ query }) => /from "vehicle_images"/.test(query));
    assert.match(vehicleRead.query, /limit \?/i);
    assert.ok(calls.indexOf(vehicleRead) < calls.indexOf(imageRead));
    assert.match(vehicleRead.query, /"id" asc/i);
    assert.equal(calls.filter(({ query }) => /from "vehicle_images"/.test(query)).length, 1);
  }

  const brands = await listPublicBrands(db);
  assert.deepEqual(brands, [{ displayName: 'Sample', urlSlug: 'sample', count: 100, iconUrl: null }]);
  const brandQuery = binding.calls.findLast(({ query }) => /^select\s+"brand"/i.test(query));
  assert.match(brandQuery.query, /limit \?/i);
  assert.equal(brandQuery.params.at(-1), 100);
});

test('Node public list remains unlimited', async () => {
  const binding = makeBinding({ vehicles: seededVehicles });
  globalThis.__publicBoundNodeDb = await createD1Db(binding);
  const result = await listPublicInventoryVehicles();
  assert.equal(result.length, 105);
  const vehicleRead = binding.calls.find(({ query }) => /from "vehicles"/.test(query));
  assert.doesNotMatch(vehicleRead.query, /limit/i);
});

test('Worker sold and sold-case reads are capped at 100 even when sold-case caller requests more', async () => {
  const sold = seededVehicles.map((row) => ({ ...row, status: 'sold', sold_at: '2025-02-01', show_sold_case: 1 }));
  const binding = makeBinding({ vehicles: sold, site_settings: [{ key: 'showSoldVehicles', value: 'true', updated_at: 'now' }] });
  const db = await createD1Db(binding);
  assert.equal((await listSoldVehicles(db)).length, 100);
  assert.equal((await (await import('../../src/lib/vehicles.ts')).listSoldCaseVehicles(200, db)).length, 100);
  const soldCaseQuery = binding.calls.filter(({ query }) => /from "vehicles"/.test(query)).at(-1);
  assert.equal(soldCaseQuery.params.at(-1), 100);
});
