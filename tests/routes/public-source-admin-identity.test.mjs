import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyPublicSnapshot } from '../../src/lib/public-source-sync.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/lib/auth.ts')) return { format: 'module', source: 'export async function getPermittedOrResponse(){ return { id: "synthetic-admin", username: "synthetic-admin", role: "superadmin", permissions: 0 }; }', shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { POST: adminSave } = await import('../../src/pages/api/admin/vehicles.ts');

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
    bound.values = () => values;
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

function database() {
  const binding = new SqliteD1();
  binding.exec(readFileSync(new URL('../../migrations/d1/0001_baseline.sql', import.meta.url), 'utf8'));
  binding.exec(readFileSync(new URL('../../migrations/d1/0002_shared_rate_limits.sql', import.meta.url), 'utf8'));
  binding.exec(readFileSync(new URL('../../migrations/d1-public-source/0001_public_source_sync.sql', import.meta.url), 'utf8'));
  return binding;
}

function snapshot(day, images) {
  return {
    schema_version: 1, captured_at: `2026-09-${day}T12:00:00.000Z`,
    source: { name: 'mita-public', origin: 'https://synthetic.invalid', host: 'synthetic', container: 'synthetic', database_path: '/synthetic', readonly: true, public_snapshot_complete: true },
    visibility: { always_public_statuses: ['published','incoming','reserved','special','unknown'], show_sold_vehicles: false },
    projection: { excluded: ['local_edits_json','credentials'], feature_mask: 'public effective mask only' },
    vehicles: [{ id: 'vehicle-synthetic', slug: 'vehicle-synthetic', title: 'Admin edited title', card_title_supplement: '', brand: 'Synthetic', model: 'Car', sub_model: '', year: '2022', mileage: '', exterior_color: '', interior_color: '', condition: 'Good', status: 'published', headline: '', description: '', features_json: '[]', monthly_recommended: 0, show_sold_case: 0, source: 'sheet-to-car-prod/manual', external_id: 'external-synthetic', sold_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: `2026-09-${day}T12:00:00.000Z` }],
    vehicle_images: images, brand_aliases: [], site_settings: [], site_video_links: [],
  };
}

test('admin full-form endpoint preserves imported identity, opaque edits, media identity, and local photo deletion across source sync', async () => {
  const binding = database();
  try {
    const first = snapshot('01', [
      { id: 'source-image-a', vehicle_id: 'vehicle-synthetic', url: '/media/a.webp', alt: 'old', sort_order: 0, is_cover: 1, created_at: '2026-01-02T00:00:00.000Z' },
      { id: 'source-image-b', vehicle_id: 'vehicle-synthetic', url: '/media/b.webp', alt: 'old', sort_order: 1, is_cover: 0, created_at: '2026-01-03T00:00:00.000Z' },
      { id: 'source-image-remove', vehicle_id: 'vehicle-synthetic', url: '/media/remove.webp', alt: '', sort_order: 2, is_cover: 0, created_at: '2026-01-04T00:00:00.000Z' },
    ]);
    await applyPublicSnapshot(binding, first, first);
    const opaqueEdits = '{"private":"leave opaque","nested":[1,2]}';
    binding.prepare('UPDATE vehicles SET local_edits_json=? WHERE id=?').bind(opaqueEdits, 'vehicle-synthetic').run();

    const request = new Request('https://preview.invalid/api/admin/vehicles', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'vehicle-synthetic', title: 'Admin edited title', brand: 'Synthetic', model: 'Car', status: 'published', images: ['/media/b.webp', '/media/a.webp', '/media/new.webp'] }),
    });
    const response = await adminSave({ request, cookies: { get() { return undefined; } }, locals: { runtime: { env: { DB_PREVIEW: binding, SESSION_SECRET: 'synthetic-session-secret' } } } });
    assert.equal(response.status, 200, await response.clone().text());
    const vehicle = binding.prepare('SELECT source,external_id,local_edits_json FROM vehicles WHERE id=?').bind('vehicle-synthetic').all().results[0];
    assert.deepEqual({ ...vehicle }, { source: 'sheet-to-car-prod/manual', external_id: 'external-synthetic', local_edits_json: opaqueEdits });
    const savedImages = binding.prepare('SELECT id,url,sort_order,is_cover,created_at FROM vehicle_images WHERE vehicle_id=? ORDER BY sort_order').bind('vehicle-synthetic').all().results;
    assert.deepEqual(savedImages.slice(0, 2).map(({ id, url, sort_order, is_cover, created_at }) => ({ id, url, sort_order, is_cover, created_at })), [
      { id: 'source-image-b', url: '/media/b.webp', sort_order: 0, is_cover: 1, created_at: '2026-01-03T00:00:00.000Z' },
      { id: 'source-image-a', url: '/media/a.webp', sort_order: 1, is_cover: 0, created_at: '2026-01-02T00:00:00.000Z' },
    ]);
    assert.equal(savedImages.length, 3);
    assert.equal(savedImages[2].url, '/media/new.webp');
    assert.equal(savedImages[2].sort_order, 2);
    assert.equal(savedImages[2].is_cover, 0);
    assert.ok(savedImages[2].id && savedImages[2].created_at);
    assert.ok(!['source-image-a', 'source-image-b', 'source-image-remove'].includes(savedImages[2].id));

    const later = snapshot('02', first.vehicle_images);
    const revision = binding.prepare('SELECT revision FROM public_data_revision WHERE id=1').all().results[0].revision;
    await assert.rejects(applyPublicSnapshot(binding, later, later, revision), /deleted locally while still present in source/);
    assert.equal(binding.prepare("SELECT COUNT(*) AS n FROM vehicle_images WHERE url='/media/remove.webp'").all().results[0].n, 0);
    assert.equal(binding.prepare('SELECT source,external_id,local_edits_json FROM vehicles WHERE id=?').bind('vehicle-synthetic').all().results[0].local_edits_json, opaqueEdits);
  } finally { binding.sqlite.close(); }
});
