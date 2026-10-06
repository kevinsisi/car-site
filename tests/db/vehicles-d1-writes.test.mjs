import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      return { format: 'module', source: 'export const db = globalThis.__vehiclesWriteNodeDbStub;', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const emptyState = () => ({ vehicles: [], vehicle_images: [], import_mappings: [], site_settings: [] });
const vehicle = (id, changes = {}) => ({
  id, slug: id, title: id, card_title_supplement: '', brand: 'DEMO-brand', model: 'DEMO-model', sub_model: '', year: '', mileage: '',
  exterior_color: '', interior_color: '', condition: '嚴選車況', status: 'draft', headline: '', description: '', features_json: '[]',
  monthly_recommended: 0, show_sold_case: 0, source: 'DEMO-source', external_id: null, local_edits_json: '[]', sold_at: null,
  created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', ...changes,
});

function makeD1(seed = emptyState(), failAt = -1) {
  const state = structuredClone(seed);
  const batchCalls = [];
  const binding = {
    prepare(query) {
      let values = [];
      const statement = {
        query,
        bind(...args) { values = args; return this; },
        async run() { throw new Error('Statements must be executed through batch'); },
        async all() { return { results: select(state, query, values).map((row) => Object.fromEntries(Object.entries(row))) }; },
        async raw() { return select(state, query, values).map((r) => Object.values(r)); },
      };
      statement.values = () => values;
      return statement;
    },
    async batch(statements) {
      batchCalls.push(statements.map((s) => s.query));
      const snapshot = structuredClone(state);
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (index === failAt) throw new Error('DEMO injected later-statement failure');
          const changes = apply(state, statement.query, statement.values());
          results.push({ success: true, results: [], meta: { changes } });
        }
        return results;
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  };
  return { db: createD1Db(binding), state, batchCalls };
}

function importInput(overrides = {}) {
  return {
    source: 'DEMO-feed', externalId: 'DEMO-external', title: 'DEMO-car', brand: 'DEMO-brand', model: 'DEMO-model',
    photos: ['DEMO-photo'], ...overrides,
  };
}

function setting(key, value) { return { key, value, updatedAt: 'DEMO-setting-time' }; }

function select(state, query, values) {
  const table = /from "([^"]+)"/i.exec(query)?.[1];
  if (!table) return [];
  let rows = state[table] ?? [];
  if (table === 'import_mappings') {
    const source = values[0]?.toLowerCase(); const external = values[1]?.toLowerCase();
    rows = rows.filter((r) => r.source.toLowerCase() === source && r.external_id.toLowerCase() === external);
  } else if (table === 'vehicles' && /"id" = \?/i.test(query)) rows = rows.filter((r) => r.id === values[0]);
  else if (table === 'vehicles' && /lower\("slug"\)/i.test(query)) rows = rows.filter((r) => r.slug.toLowerCase() === String(values[0]).toLowerCase());
  return rows.map((r) => ({ ...r }));
}

function apply(state, query, values) {
  const table = /(?:into|update|from|delete from) "([^"]+)"/i.exec(query)?.[1];
  if (!table) return 0;
  if (/^insert/i.test(query)) {
    const insertColumns = /^insert into "[^"]+" \(([^)]+)\) values/i.exec(query)?.[1] ?? '';
    const columns = [...insertColumns.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    const conflictIndex = state[table].findIndex((entry) => entry.id === row.id || (table === 'import_mappings' && entry.source.toLowerCase() === row.source.toLowerCase() && entry.external_id.toLowerCase() === row.external_id.toLowerCase()));
    if (conflictIndex >= 0) state[table][conflictIndex] = { ...state[table][conflictIndex], ...row };
    else state[table].push(row);
    return 1;
  } else if (/^delete/i.test(query)) {
    const previousLength = state[table].length;
    state[table] = state[table].filter((row) => row.vehicle_id !== values[0]);
    return previousLength - state[table].length;
  } else if (/^update/i.test(query)) {
    const row = state[table].find((entry) => entry.id === values.at(-1));
    if (row) {
      const columns = [...query.matchAll(/"([a-z_]+)" = \?/g)].map((m) => m[1]);
      columns.slice(0, -1).forEach((column, i) => { row[column] = values[i]; });
      return 1;
    }
  }
  return 0;
}

const repo = await import('../../src/lib/vehicles.ts');

test('D1 upsert and status operations batch their writes; omitted images stay untouched and empty list clears', async () => {
  globalThis.__vehiclesWriteNodeDbStub = { select() { throw new Error('unexpected Node DB'); } };
  const seed = emptyState(); seed.vehicles.push(vehicle('DEMO-vehicle'));
  seed.vehicle_images.push({ id: 'DEMO-image', vehicle_id: 'DEMO-vehicle', url: 'DEMO-old', alt: '', sort_order: 0, is_cover: 1, created_at: 'old' });
  const { db, state, batchCalls } = await makeD1(seed);
  await repo.upsertVehicle({ id: 'DEMO-vehicle', title: 'DEMO-title', brand: 'DEMO-brand', model: 'DEMO-model' }, await db);
  assert.equal(state.vehicle_images.length, 1);
  assert.equal(batchCalls.length, 1);
  await repo.upsertVehicle({ id: 'DEMO-vehicle', title: 'DEMO-title', brand: 'DEMO-brand', model: 'DEMO-model', images: [] }, await db);
  assert.equal(state.vehicle_images.length, 0);
  assert.equal(await repo.updateVehicleStatus('DEMO-vehicle', 'sold', await db), true);
  assert.equal(state.vehicles[0].status, 'sold');
  assert.ok(state.vehicles[0].sold_at, 'setting sold writes a fresh soldAt');
  assert.notEqual(state.vehicles[0].sold_at, '2025-01-01T00:00:00.000Z');
  assert.notEqual(state.vehicles[0].updated_at, '2025-01-01T00:00:00.000Z', 'setting sold refreshes updatedAt');
  assert.equal(state.vehicles[0].sold_at, state.vehicles[0].updated_at, 'status timestamps share the operation time');
  assert.equal(batchCalls.length, 3);
  assert.deepEqual(batchCalls.map((call) => call.length), [1, 2, 1]);

  assert.equal(await repo.updateVehicleStatus('DEMO-vehicle', 'draft', await db), true);
  assert.equal(state.vehicles[0].status, 'draft');
  assert.equal(state.vehicles[0].sold_at, null, 'changing to a non-sold status clears soldAt');
  assert.notEqual(state.vehicles[0].updated_at, '2025-01-01T00:00:00.000Z', 'changing to a non-sold status refreshes updatedAt');
  assert.equal(batchCalls.length, 4);
  assert.equal(batchCalls[3].length, 1, 'each status operation submits exactly one statement in one batch');
});

test('D1 upsert explicitly preserves defaults, optional values, timestamps, and image replacement semantics', async () => {
  globalThis.__vehiclesWriteNodeDbStub = { select() { throw new Error('unexpected Node DB'); } };
  const seed = emptyState();
  seed.vehicles.push(vehicle('DEMO-upsert', {
    slug: 'DEMO-upsert', title: 'DEMO-before', monthly_recommended: 1, show_sold_case: 1,
    status: 'sold', sold_at: 'DEMO-old-sold-at', created_at: 'DEMO-created-at', updated_at: 'DEMO-old-updated-at',
  }));
  seed.vehicle_images.push({ id: 'DEMO-original-image', vehicle_id: 'DEMO-upsert', url: 'DEMO-original', alt: 'original', sort_order: 0, is_cover: 1, created_at: 'DEMO-image-created' });
  const { db, state, batchCalls } = makeD1(seed);

  await repo.upsertVehicle({ id: 'DEMO-upsert', title: 'DEMO-updated', brand: 'DEMO-brand', model: 'DEMO-model' }, await db);
  let saved = state.vehicles[0];
  assert.equal(saved.sub_model, '');
  assert.equal(saved.year, '');
  assert.equal(saved.mileage, '');
  assert.equal(saved.exterior_color, '');
  assert.equal(saved.interior_color, '');
  assert.equal(saved.condition, '嚴選車況');
  assert.equal(saved.status, 'draft');
  assert.equal(saved.headline, '');
  assert.equal(saved.description, '');
  assert.equal(saved.features_json, '[]');
  assert.equal(saved.local_edits_json, '[]');
  assert.equal(saved.source, 'manual');
  assert.equal(saved.external_id, null);
  assert.equal(saved.monthly_recommended, 1, 'omitted recommendation is preserved');
  assert.equal(saved.show_sold_case, 1, 'omitted sold-case flag is preserved');
  assert.equal(saved.created_at, 'DEMO-created-at');
  assert.equal(saved.sold_at, null, 'non-sold upsert clears soldAt');
  assert.notEqual(saved.updated_at, 'DEMO-old-updated-at');
  assert.deepEqual(state.vehicle_images.map((image) => image.id), ['DEMO-original-image'], 'omitted images preserve existing rows');

  await repo.upsertVehicle({
    id: 'DEMO-upsert', title: 'DEMO-updated', brand: 'DEMO-brand', model: 'DEMO-model',
    cardTitleSupplement: 'DEMO-supplement', subModel: '', year: '', mileage: '', exteriorColor: '', interiorColor: '',
    condition: 'DEMO-condition', status: 'sold', headline: '', description: '', features: [], source: '', externalId: '',
    monthlyRecommended: false, showSoldCase: false, images: ['', 'DEMO-photo-a', null, 'DEMO-photo-b'],
  }, await db);
  saved = state.vehicles[0];
  assert.equal(saved.card_title_supplement, 'DEMO-supplement');
  assert.equal(saved.monthly_recommended, 0, 'explicit false overrides preserved recommendation');
  assert.equal(saved.show_sold_case, 0, 'explicit false overrides preserved sold-case flag');
  assert.equal(saved.created_at, 'DEMO-created-at');
  assert.equal(saved.status, 'sold');
  assert.ok(saved.sold_at, 'sold upsert sets soldAt');
  assert.notEqual(saved.updated_at, 'DEMO-old-updated-at');
  assert.equal(saved.updated_at, saved.sold_at, 'soldAt and updatedAt use the same upsert operation time');
  const replacements = state.vehicle_images;
  assert.equal(replacements.length, 2, 'falsey image entries are filtered');
  assert.deepEqual(replacements.map((image) => image.url), ['DEMO-photo-a', 'DEMO-photo-b']);
  assert.deepEqual(replacements.map((image) => image.sort_order), [0, 1]);
  assert.deepEqual(replacements.map((image) => image.is_cover), [1, 0]);
  assert.deepEqual(replacements.map((image) => image.alt), ['DEMO-updated', 'DEMO-updated']);
  assert.ok(replacements.every((image) => image.id && image.id !== 'DEMO-original-image'));
  assert.ok(replacements.every((image) => image.created_at === saved.updated_at));

  const soldAt = saved.sold_at;
  await repo.upsertVehicle({ id: 'DEMO-upsert', title: 'DEMO-updated', brand: 'DEMO-brand', model: 'DEMO-model', status: 'draft', images: [] }, await db);
  saved = state.vehicles[0];
  assert.equal(saved.sold_at, null, 'upsert to non-sold clears soldAt');
  assert.notEqual(saved.updated_at, 'DEMO-old-updated-at');
  assert.equal(saved.created_at, 'DEMO-created-at');
  assert.ok(soldAt);
  assert.equal(state.vehicle_images.length, 0, 'explicit empty image list clears rows');
  assert.deepEqual(batchCalls.map((call) => call.length), [1, 4, 2]);
});

test('import create/update submit complete vehicle-image-mapping groups once and modeled later failure rolls all state back', async (t) => {
  globalThis.__vehiclesWriteNodeDbStub = { select() { throw new Error('unexpected Node DB'); } };
  for (const scenario of ['create', 'update']) {
    await t.test(scenario, async () => {
      const seed = emptyState();
      if (scenario === 'update') {
        seed.vehicles.push(vehicle('DEMO-existing', { slug: 'DEMO-external' }));
        seed.vehicle_images.push({ id: 'DEMO-existing-image', vehicle_id: 'DEMO-existing', url: 'DEMO-before', alt: 'before', sort_order: 0, is_cover: 1, created_at: 'before' });
        seed.import_mappings.push({ id: 'DEMO-mapping', source: 'DEMO-feed', external_id: 'DEMO-external', vehicle_id: 'DEMO-existing', last_imported_at: 'before' });
      }
      const { db, state, batchCalls } = makeD1(seed, 4);
      const before = structuredClone(state);
      await assert.rejects(repo.importVehicle({ source: 'DEMO-feed', externalId: 'DEMO-external', title: 'DEMO-car', brand: 'DEMO-brand', model: 'DEMO-model', photos: ['DEMO-photo-a', 'DEMO-photo-b'], publishMode: 'publish' }, await db));
      assert.equal(batchCalls.length, 1);
      assert.equal(batchCalls[0].length, 5);
      assert.match(batchCalls[0][0], /insert into "vehicles"/i);
      assert.match(batchCalls[0][1], /delete from "vehicle_images"/i);
      assert.match(batchCalls[0][2], /insert into "vehicle_images"/i);
      assert.match(batchCalls[0][3], /insert into "vehicle_images"/i);
      assert.match(batchCalls[0][4], /(?:insert into|update) "import_mappings"/i);
      assert.deepEqual(state, before);
    });
  }
});

test('D1 import status precedence and exact success result respect public-field eligibility', async () => {
  globalThis.__vehiclesWriteNodeDbStub = { select() { throw new Error('unexpected Node DB'); } };
  const cases = [
    { name: 'explicit status overrides all', input: { status: 'reserved', sourceStatus: 'sold', publishMode: 'publish' }, behavior: 'auto_publish', expected: 'reserved', publicFields: true },
    { name: 'mapped sourceStatus overrides publishMode', input: { sourceStatus: '售出', publishMode: 'publish' }, behavior: 'auto_publish', expected: 'sold', publicFields: true },
    { name: 'publishMode publish publishes eligible vehicle', input: { publishMode: 'publish' }, behavior: 'import_only', expected: 'published', publicFields: true },
    { name: 'publishMode publish without public fields stays draft', input: { publishMode: 'publish', photos: [] }, behavior: 'auto_publish', expected: 'draft', publicFields: false },
    { name: 'publishMode draft overrides configured behavior', input: { publishMode: 'draft' }, behavior: 'auto_publish', expected: 'draft', publicFields: true },
    { name: 'configured auto-publish publishes eligible vehicle', input: {}, behavior: 'auto_publish', expected: 'published', publicFields: true },
    { name: 'configured auto-publish without public fields stays draft', input: { photos: [] }, behavior: 'auto_publish', expected: 'draft', publicFields: false },
    { name: 'configured import-only is unpublished', input: {}, behavior: 'import_only', expected: 'unpublished', publicFields: true },
    { name: 'configured draft-first is draft', input: {}, behavior: 'draft_first', expected: 'draft', publicFields: true },
  ];
  for (const scenario of cases) {
    const seed = emptyState(); seed.site_settings.push(setting('importBehavior', scenario.behavior));
    const { db, state, batchCalls } = makeD1(seed);
    const input = importInput(scenario.input);
    const result = await repo.importVehicle(input, await db);
    assert.deepEqual(result, {
      vehicleId: state.vehicles[0].id,
      status: scenario.expected,
      published: scenario.expected === 'published',
      validation: { hasPublicFields: scenario.publicFields },
    }, scenario.name);
    assert.equal(state.vehicles[0].status, scenario.expected, scenario.name);
    assert.equal(batchCalls.length, 1, scenario.name);
    assert.equal(batchCalls[0].at(-1).includes('import_mappings'), true, scenario.name);
  }
});

test('D1 import case-insensitively reuses mapping and vehicle, preserving mapping identity while refreshing last import', async () => {
  globalThis.__vehiclesWriteNodeDbStub = { select() { throw new Error('unexpected Node DB'); } };
  const seed = emptyState();
  seed.site_settings.push(setting('importBehavior', 'draft_first'));
  seed.vehicles.push(vehicle('DEMO-mapped-vehicle', { slug: 'DEMO-old-slug', title: 'DEMO-before', created_at: 'DEMO-created-before' }));
  seed.import_mappings.push({ id: 'DEMO-stable-mapping', source: 'demo-FEED', external_id: 'demo-EXTERNAL', vehicle_id: 'DEMO-mapped-vehicle', last_imported_at: 'DEMO-old-import' });
  const { db, state, batchCalls } = makeD1(seed);
  const result = await repo.importVehicle(importInput({ source: 'DEMO-feed', externalId: 'DEMO-external', slug: 'DEMO-new-slug', photos: ['DEMO-new-photo'] }), await db);

  assert.deepEqual(result, {
    vehicleId: 'DEMO-mapped-vehicle', status: 'draft', published: false, validation: { hasPublicFields: true },
  });
  assert.equal(state.vehicles.length, 1);
  assert.equal(state.vehicles[0].id, 'DEMO-mapped-vehicle');
  assert.equal(state.vehicles[0].slug, 'DEMO-new-slug', 'mapping match wins vehicle reuse even with changed slug');
  assert.equal(state.vehicles[0].created_at, 'DEMO-created-before');
  assert.equal(state.import_mappings.length, 1);
  assert.equal(state.import_mappings[0].id, 'DEMO-stable-mapping');
  assert.equal(state.import_mappings[0].vehicle_id, 'DEMO-mapped-vehicle');
  assert.notEqual(state.import_mappings[0].last_imported_at, 'DEMO-old-import');
  assert.deepEqual(state.vehicle_images.map((image) => image.url), ['DEMO-new-photo']);
  assert.equal(batchCalls.length, 1);
  assert.deepEqual(batchCalls[0].map((query) => /(?:insert into|update) "(?:vehicles|vehicle_images|import_mappings)"/i.test(query)), [true, false, true, true]);
});

test('D1 import reuses a case-insensitive slug vehicle ahead of mapped vehicle and updates the mapping target', async () => {
  globalThis.__vehiclesWriteNodeDbStub = { select() { throw new Error('unexpected Node DB'); } };
  const seed = emptyState();
  seed.vehicles.push(vehicle('DEMO-slug-vehicle', { slug: 'DEMO-EXTERNAL' }), vehicle('DEMO-mapped-vehicle', { slug: 'DEMO-other' }));
  seed.import_mappings.push({ id: 'DEMO-mapping', source: 'DEMO-FEED', external_id: 'DEMO-EXTERNAL', vehicle_id: 'DEMO-mapped-vehicle', last_imported_at: 'DEMO-before' });
  const { db, state, batchCalls } = makeD1(seed);
  const result = await repo.importVehicle(importInput({ slug: 'demo-external', photos: undefined }), await db);
  assert.equal(result.vehicleId, 'DEMO-slug-vehicle');
  assert.equal(state.vehicles.length, 2);
  assert.equal(state.import_mappings[0].id, 'DEMO-mapping');
  assert.equal(state.import_mappings[0].vehicle_id, 'DEMO-slug-vehicle');
  assert.notEqual(state.import_mappings[0].last_imported_at, 'DEMO-before');
  assert.equal(batchCalls.length, 1);
  assert.equal(batchCalls[0].length, 2, 'vehicle update and mapping update share one batch without image replacement');
});

test('D1 import successfully creates vehicle and mapping when no match exists', async () => {
  globalThis.__vehiclesWriteNodeDbStub = { select() { throw new Error('unexpected Node DB'); } };
  const { db, state, batchCalls } = makeD1();
  const result = await repo.importVehicle(importInput({ photos: [] }), await db);
  assert.deepEqual(result, {
    vehicleId: state.vehicles[0].id, status: 'draft', published: false, validation: { hasPublicFields: false },
  });
  assert.equal(state.vehicles.length, 1);
  assert.equal(state.import_mappings.length, 1);
  assert.equal(state.import_mappings[0].vehicle_id, result.vehicleId);
  assert.equal(state.vehicle_images.length, 0);
  assert.equal(batchCalls.length, 1);
  assert.equal(batchCalls[0].length, 3, 'vehicle, explicit image clear, and mapping writes share one batch');
  assert.match(batchCalls[0][0], /insert into "vehicles"/i);
  assert.match(batchCalls[0][1], /delete from "vehicle_images"/i);
  assert.match(batchCalls[0][2], /insert into "import_mappings"/i);
});

// Evidence boundary: this double proves repository grouping and models rollback
// for the injected failure. It does not prove deployed or remote D1 behavior.
// Engine atomicity relies on Cloudflare's documented batch transaction guarantee:
// https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
