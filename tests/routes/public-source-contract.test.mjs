import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicSnapshot, publicAssetReferences } from '../../src/lib/public-source-snapshot.ts';

const contract = () => ({
  schema_version: 1,
  captured_at: '2026-09-30T12:00:00.000Z',
  source: { name: 'mita-public', origin: 'https://mita.sisihome.org', host: 'synthetic-host', container: 'synthetic-container', database_path: '/synthetic/db', readonly: true, public_snapshot_complete: true },
  visibility: { always_public_statuses: ['published', 'incoming', 'reserved', 'special', 'unknown'], show_sold_vehicles: false },
  projection: { excluded: ['admin_users','admin_sessions','sell_inquiries','import_mappings','local_edits_json','openCode.*','SMTP/auth/credentials','raw featureLicenseMask','hero conversion diagnostics'], feature_mask: 'public effective mask only', heroVideos: 'id and effective public playback/poster/label only' },
  vehicles: [{ id: 'vehicle-1', slug: 'vehicle-1', title: 'Synthetic car', card_title_supplement: '', brand: 'Maker', model: 'Model', sub_model: '', year: '2020', mileage: '12000', exterior_color: '', interior_color: '', condition: 'Good', status: 'published', headline: '', description: '', features_json: '[]', monthly_recommended: 0, show_sold_case: 0, source: 'sheet-to-car-prod/manual', external_id: null, sold_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-09-30T12:00:00.000Z' }],
  vehicle_images: [{ id: 'photo-1', vehicle_id: 'vehicle-1', url: '/media/vehicle/photo.webp', alt: '', sort_order: 0, is_cover: 1, created_at: '2026-09-30T12:00:00.000Z' }],
  brand_aliases: [{ source_brand: 'Maker', display_name: 'Maker', url_slug: 'maker', icon_url: '/brand-icons/maker.svg', updated_at: '2026-09-30T12:00:00.000Z' }],
  site_settings: [{ key: 'heroVideos', value: JSON.stringify([{ id: 'hero-1', url: 'https://youtube.com/embed/synthetic', thumbnailUrl: '/media/hero/poster.webp', label: 'Synthetic video' }]), updated_at: '2026-09-30T12:00:00.000Z' }],
  site_video_links: [{ id: 'link-1', title: 'Synthetic Instagram', url: 'https://www.instagram.com/reel/synthetic/', thumbnail_url: '/media/video/poster.webp', sort_order: 0, created_at: '2026-09-30T12:00:00.000Z' }],
});
const parse = (snapshot) => parsePublicSnapshot(new TextEncoder().encode(JSON.stringify(snapshot)));

test('accepts caller metadata, preserves vehicle source, and normalizes relative public media references', () => {
  const snapshot = parse(contract());
  assert.equal(snapshot.vehicles[0].source, 'sheet-to-car-prod/manual');
  assert.deepEqual(new Set(publicAssetReferences(snapshot)), new Set([
    'https://mita.sisihome.org/media/vehicle/photo.webp',
    'https://mita.sisihome.org/brand-icons/maker.svg',
    'https://mita.sisihome.org/media/hero/poster.webp',
    'https://mita.sisihome.org/media/video/poster.webp',
  ]));
});

test('rejects unknown/private fields, invalid image references, and malformed row types', () => {
  const unknown = contract(); unknown.vehicles[0].password_hash = 'synthetic-secret';
  assert.throws(() => parse(unknown), /unknown fields/);
  const invalidImage = contract(); invalidImage.vehicle_images[0].url = '/media/..%2fprivate/file.webp';
  assert.throws(() => publicAssetReferences(parse(invalidImage)), /vehicle image URL/);
  const malformed = contract(); malformed.vehicles[0].mileage = 12000;
  assert.throws(() => parse(malformed), /mileage must be a string or null/);
  const badVisibility = contract(); badVisibility.visibility.always_public_statuses.pop();
  assert.throws(() => parse(badVisibility), /always_public_statuses/);
});
