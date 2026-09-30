import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      return { format: 'module', source: 'export const db = {};', shortCircuit: true };
    }
    if (url.endsWith('/src/lib/media.ts')) {
      throw new Error('Worker vehicle reads must not load media.ts');
    }
    return nextLoad(url, context);
  },
});

const repo = await import('../../src/lib/vehicles.ts');

function makeBinding() {
  const vehicle = {
    id: 'vehicle-1', slug: 'vehicle-1', title: 'Vehicle', card_title_supplement: '', brand: 'Maker', model: 'Model',
    sub_model: '', year: '2025', mileage: '100', exterior_color: '', interior_color: '', condition: 'Good', status: 'published',
    headline: '', description: '', features_json: '[]', monthly_recommended: 0, show_sold_case: 0, source: 'test', external_id: null,
    local_edits_json: '[]', sold_at: null, created_at: '2025-01-01', updated_at: '2025-01-01',
  };
  const image = {
    id: 'image-1', vehicle_id: 'vehicle-1', url: '/media/vehicle/photo.jpg', alt: 'Photo', sort_order: 0, is_cover: 1, created_at: '2025-01-01',
  };
  return {
    prepare(query) {
      const table = query.toLowerCase().match(/from "([^"]+)"/)?.[1];
      const results = table === 'vehicles' ? [vehicle] : table === 'vehicle_images' ? [image] : [];
      return {
        bind() { return this; },
        async all() { return { results }; },
        async raw() { return results.map((row) => Object.values(row)); },
        async run() { throw new Error('Unexpected D1 write'); },
      };
    },
  };
}

test('D1 vehicle reads return original image URLs without loading media resolver', async () => {
  const db = await createD1Db(makeBinding());
  const [vehicle] = await repo.listPublicInventoryVehicles(db);

  assert.equal(vehicle.images[0].url, '/media/vehicle/photo.jpg');
  assert.equal(vehicle.images[0].thumbUrl, '/media/vehicle/photo.jpg');
});
