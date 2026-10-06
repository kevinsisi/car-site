import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';
import { MAX_COMPARE_VEHICLES, normalizeCompareSlugs } from '../../src/lib/vehicle-comparison.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/db/connection') {
      return { url: 'data:text/javascript,export%20const%20db%20%3D%20%7B%7D', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const reads = [];
const binding = {
  prepare(query) {
    const statement = {
      bind(...args) { statement.args = args; return statement; },
      async all() { reads.push({ query, args: statement.args || [] }); return { results: [] }; },
      async raw() { reads.push({ query, args: statement.args || [] }); return []; },
      async first() { reads.push({ query, args: statement.args || [] }); return null; },
      async run() { throw new Error('The car route fixture adapter is read-only'); },
    };
    return statement;
  },
};
const adapter = await createD1Db(binding);

test('car loaders perform synthetic D1 reads and return empty results for empty tables', async () => {
  const { getVehicleBySlug, listMonthlyRecommendedVehicles, listPublicBrands, listPublicInventoryVehicles, listPublicVehicles, listPublicVehiclesByBrand, listSoldVehicles } = await import('../../src/lib/vehicles.ts');
  const { getSettings } = await import('../../src/lib/settings.ts');
  reads.length = 0;

  await getSettings(adapter);
  assert.deepEqual(await getVehicleBySlug('synthetic-car', adapter), null);
  assert.deepEqual(await listMonthlyRecommendedVehicles(adapter), []);
  assert.deepEqual(await listPublicBrands(adapter), []);
  assert.deepEqual(await listPublicInventoryVehicles(adapter), []);
  assert.deepEqual(await listPublicVehiclesByBrand('synthetic-brand', adapter), []);
  assert.deepEqual(await listPublicVehicles(adapter), []);
  assert.deepEqual(await listSoldVehicles(adapter), []);

  assert.ok(reads.length > 0, 'expected real Drizzle reads against synthetic D1');
  assert.ok(reads.every(({ query }) => /site_settings|vehicles|vehicle_images|brand_aliases/.test(query)));
});

test('all car pages require the Worker D1 binding and pass one request adapter to database loaders', () => {
  const pages = [
    {
      path: '../../src/pages/cars/index.astro',
      calls: ['getSettings(adapter)', 'listPublicInventoryVehicles(adapter)', 'listMonthlyRecommendedVehicles(adapter)', 'listSoldVehicles(adapter)', 'listPublicBrands(adapter)', 'listPublicVehiclesByBrand(activeBrand, adapter)'],
    },
    {
      path: '../../src/pages/cars/[slug].astro',
      calls: ['getVehicleBySlug(Astro.params.slug || \'\', adapter)', 'getSettings(adapter)', 'listPublicVehicles(adapter)'],
    },
    {
      path: '../../src/pages/cars/compare.astro',
      calls: ['getSettings(adapter)', 'getVehicleBySlug(slug, adapter)', 'listPublicInventoryVehicles(adapter)'],
    },
  ];

  for (const pageSpec of pages) {
    const frontmatter = readFileSync(new URL(pageSpec.path, import.meta.url), 'utf8').split('---')[1];
    assert.match(frontmatter, /runtime\?\.env\?\.DB_PREVIEW/);
    assert.match(frontmatter, /status:\s*503/);
    assert.match(frontmatter, /createD1Db\(binding\)/);
    for (const call of pageSpec.calls) assert.ok(frontmatter.includes(call), `expected ${pageSpec.path} to call ${call}`);
  }
});

test('compare ids cap per-vehicle D1 reads at the explicit four-column comparison limit', async () => {
  const frontmatter = readFileSync(new URL('../../src/pages/cars/compare.astro', import.meta.url), 'utf8').split('---')[1];
  assert.equal(MAX_COMPARE_VEHICLES, 4);
  assert.match(frontmatter, /normalizeCompareSlugs\(idsParam\.split\(','\)\)/);
  assert.match(frontmatter, /slugs\.map\(\(slug\) => getVehicleBySlug\(slug, adapter\)\)/);

  const { getVehicleBySlug } = await import('../../src/lib/vehicles.ts');
  const requestedSlugs = Array.from({ length: 100 }, (_, index) => `synthetic-${index}`);
  const boundedSlugs = normalizeCompareSlugs(requestedSlugs);
  const readsBefore = reads.length;
  await Promise.all(boundedSlugs.map((slug) => getVehicleBySlug(slug, adapter)));
  const compareReads = reads.length - readsBefore;
  assert.equal(boundedSlugs.length, 4);
  assert.equal(compareReads, 4, 'one vehicle lookup read per accepted id; excess ids trigger no reads');
});
