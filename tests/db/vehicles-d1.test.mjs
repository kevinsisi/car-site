import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      return { format: 'module', source: 'export const db = globalThis.__vehiclesNodeDbStub;', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const tableRows = {
  vehicles: [], vehicle_images: [], brand_aliases: [], site_settings: [],
};
function makeVehicle(id, options = {}) {
  return {
    id, slug: options.slug ?? id, title: options.title ?? id, card_title_supplement: '', brand: options.brand ?? 'Maker', model: 'Model', sub_model: '', year: '2025', mileage: '100', exterior_color: '', interior_color: '', condition: 'Good', status: options.status ?? 'published', headline: '', description: '', features_json: '[]', monthly_recommended: options.monthlyRecommended ? 1 : 0, show_sold_case: options.showSoldCase ? 1 : 0, source: 'test', external_id: null, local_edits_json: '[]', sold_at: options.soldAt ?? null, created_at: '2025-01-01', updated_at: options.updatedAt ?? '2025-01-01',
  };
}

function makeBinding(seed = {}) {
  const calls = [];
  const rows = Object.fromEntries(Object.keys(tableRows).map((table) => [table, [...(seed[table] ?? [])]]));
  const binding = {
    calls,
    prepare(query) {
      const normalized = query.toLowerCase();
      let params = [];
      const run = () => {
        calls.push({ query, params: [...params] });
        const table = Object.keys(rows).find((name) => normalized.includes(`from "${name}"`));
        if (!table) throw new Error(`Unexpected SQL: ${query}`);
        let selected = [...rows[table]];
        if (table === 'vehicles') {
          if (normalized.includes('"slug" =')) selected = selected.filter((row) => row.slug === params[0]);
          if (normalized.includes('"status" in')) selected = selected.filter((row) => params.includes(row.status));
          if (normalized.includes('"status" =')) selected = selected.filter((row) => row.status === params[0]);
          if (normalized.includes('"status" <>')) selected = selected.filter((row) => row.status !== params[0]);
          if (normalized.includes('"monthly_recommended" =')) selected = selected.filter((row) => Boolean(row.monthly_recommended) === Boolean(params.at(-1)));
          if (normalized.includes('"show_sold_case" =')) selected = selected.filter((row) => Boolean(row.show_sold_case) === Boolean(params.at(-1)));
          if (normalized.includes('order by')) {
            const order = normalized.includes('"sold_at"') ? ['sold_at', 'updated_at'] : ['updated_at'];
            selected.sort((a, b) => {
              for (const key of order) {
                const cmp = String(b[key] ?? '').localeCompare(String(a[key] ?? ''));
                if (cmp) return cmp;
              }
              return 0;
            });
          }
          const limit = normalized.match(/limit (\?)/);
          if (limit) selected = selected.slice(0, Number(params.at(-1)));
        }
        if (table === 'vehicle_images') {
          selected = selected.filter((row) => params.includes(row.vehicle_id));
          selected.sort((a, b) => a.sort_order - b.sort_order);
        }
        if (table === 'site_settings' && normalized.includes('"key" =')) selected = selected.filter((row) => row.key === params[0]);
        if (table === 'brand_aliases') selected.sort((a, b) => a.source_brand.localeCompare(b.source_brand));
        const projected = table === 'vehicles' && /^select\s+"brand"/.test(normalized);
        return { results: selected.map((row) => projected ? { brand: row.brand } : { ...row }) };
      };
      return {
        bind(...values) { params = values; return this; },
        async all() { return run(); },
        async raw() { return run().results.map((row) => Object.values(row)); },
        async run() { throw new Error('D1 write attempted'); },
      };
    },
  };
  return binding;
}

async function adapterFor(seed) {
  const binding = makeBinding(seed);
  return { binding, db: await createD1Db(binding) };
}

const repo = await import('../../src/lib/vehicles.ts');

test('injected D1 handles are isolated and reads never touch Node connection or write', async () => {
  const first = await adapterFor({ vehicles: [makeVehicle('first')] });
  const second = await adapterFor({ vehicles: [makeVehicle('second')] });
  const forbidden = { select() { throw new Error('Node singleton read'); } };
  globalThis.__vehiclesNodeDbStub = forbidden;
  assert.deepEqual((await repo.listPublicInventoryVehicles(first.db)).map((v) => v.id), ['first']);
  assert.deepEqual((await repo.listPublicInventoryVehicles(second.db)).map((v) => v.id), ['second']);
  assert.ok(first.binding.calls.length > 0 && second.binding.calls.length > 0);
  assert.ok([...first.binding.calls, ...second.binding.calls].every(({ query }) => /^\s*select/i.test(query)));
});

test('public, inventory, monthly, admin, slug, and sold-case filters preserve order and limits', async () => {
  const entries = [
    makeVehicle('pub-old', { updatedAt: '2025-01-01', monthlyRecommended: true }),
    makeVehicle('pub-new', { updatedAt: '2025-03-01', monthlyRecommended: true }),
    makeVehicle('draft', { status: 'draft', updatedAt: '2025-04-01' }),
    makeVehicle('archived', { status: 'archived' }),
    makeVehicle('sold-old', { status: 'sold', showSoldCase: true, soldAt: '2025-01-01' }),
    makeVehicle('sold-new', { status: 'sold', showSoldCase: true, soldAt: '2025-03-01' }),
  ];
  const { db } = await adapterFor({ vehicles: entries, site_settings: [{ key: 'showSoldVehicles', value: 'true', updated_at: 'now' }] });
  assert.deepEqual((await repo.listPublicVehicles(db)).map((v) => v.id), ['sold-new', 'sold-old', 'pub-new', 'pub-old']);
  assert.deepEqual((await repo.listPublicInventoryVehicles(db)).map((v) => v.id), ['pub-new', 'pub-old']);
  assert.deepEqual(await repo.listPublicBrands(db), [
    { displayName: 'Maker', urlSlug: 'maker', count: 2, iconUrl: null },
  ]);
  assert.deepEqual((await repo.listMonthlyRecommendedVehicles(db)).map((v) => v.id), ['pub-new', 'pub-old']);
  assert.deepEqual((await repo.listAdminVehicles(db)).map((v) => v.id), ['sold-new', 'sold-old', 'draft', 'pub-new', 'pub-old']);
  assert.deepEqual((await repo.listSoldVehicles(db)).map((v) => v.id), ['sold-new', 'sold-old']);
  assert.deepEqual((await repo.listSoldCaseVehicles(1, db)).map((v) => v.id), ['sold-new']);
  assert.equal((await repo.getVehicleBySlug('pub-new', db))?.id, 'pub-new');
});

test('images map in sort order, retain URL/thumb mapping, and choose cover then first fallback', async () => {
  const { db } = await adapterFor({
    vehicles: [makeVehicle('with-cover'), makeVehicle('without-cover')],
    vehicle_images: [
      { id: 'later', vehicle_id: 'with-cover', url: 'https://example.test/later.jpg', alt: 'later', sort_order: 2, is_cover: 0, created_at: 'now' },
      { id: 'cover', vehicle_id: 'with-cover', url: 'https://example.test/cover.jpg', alt: 'cover', sort_order: 1, is_cover: 1, created_at: 'now' },
      { id: 'fallback', vehicle_id: 'without-cover', url: '/media/fallback.jpg', alt: '', sort_order: 1, is_cover: 0, created_at: 'now' },
    ],
  });
  const [cover, fallback] = await repo.listPublicInventoryVehicles(db);
  assert.deepEqual(cover.images.map((image) => image.id), ['cover', 'later']);
  assert.equal(cover.coverImage.id, 'cover');
  assert.equal(cover.images[0].thumbUrl, 'https://example.test/cover.jpg');
  assert.equal(fallback.coverImage.id, 'fallback');
  assert.deepEqual((await repo.getVehicleBySlug('missing', db)), null);
});

test('brand aliases map display fields and fallback, while settings hide or show sold reads', async () => {
  const seed = {
    vehicles: [makeVehicle('alias', { brand: 'Maker', status: 'sold', showSoldCase: true }), makeVehicle('fallback', { brand: 'Fallback' })],
    brand_aliases: [{ source_brand: 'Maker', display_name: 'Display Maker', url_slug: 'display-maker', icon_url: '/icon.svg', updated_at: 'now' }, { source_brand: 'Fallback', display_name: 'Simple Brand', url_slug: '', icon_url: null, updated_at: 'now' }],
  };
  const hidden = await adapterFor(seed);
  const visible = await adapterFor({ ...seed, site_settings: [{ key: 'showSoldVehicles', value: 'true', updated_at: 'now' }] });
  const { db } = visible;
  assert.deepEqual(await repo.listSoldVehicles(hidden.db), []);
  assert.deepEqual(await repo.listSoldCaseVehicles(undefined, hidden.db), []);
  const sold = await repo.listSoldVehicles(db);
  assert.equal(sold[0].brandDisplayName, 'Display Maker');
  assert.equal(sold[0].brandUrlSlug, 'display-maker');
  assert.equal(sold[0].brandIconUrl, '/icon.svg');
  const publicVehicles = await repo.listPublicVehicles(db);
  assert.equal(publicVehicles.find((v) => v.id === 'fallback').brandUrlSlug, 'simple-brand');
  assert.equal(publicVehicles.find((v) => v.id === 'fallback').brandIconUrl, null);
  assert.equal(publicVehicles.find((v) => v.id === 'alias').images.length, 0);
  assert.ok([...visible.binding.calls, ...hidden.binding.calls].every(({ query }) => /^\s*select/i.test(query)));
});
