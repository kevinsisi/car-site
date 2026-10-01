import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { POST } from '../../src/pages/api/import/public-snapshot.ts';
import { signPublicMediaReceipt } from '../../src/lib/public-source-media.ts';

const token = 'synthetic-public-snapshot-token';
const baseSnapshot = () => ({
  schema_version: 1,
  captured_at: '2026-09-30T12:00:00.000Z',
  source: { name: 'mita-public', origin: 'https://mita.sisihome.org', host: 'synthetic-host', container: 'synthetic-container', database_path: '/synthetic/db', readonly: true, public_snapshot_complete: true },
  visibility: { always_public_statuses: ['published','incoming','reserved','special','unknown'], show_sold_vehicles: false },
  projection: { excluded: ['admin_users','admin_sessions','sell_inquiries','import_mappings','local_edits_json','openCode.*','SMTP/auth/credentials','raw featureLicenseMask','hero conversion diagnostics'], feature_mask: 'public effective mask only', heroVideos: 'id and effective public playback/poster/label only' },
  vehicles: [{ id: 'public-car-1', slug: 'public-car-1', title: 'Synthetic vehicle', card_title_supplement: '', brand: 'Brand', model: 'Model', sub_model: '', year: '2020', mileage: '1', exterior_color: '', interior_color: '', condition: 'Good', status: 'published', headline: '', description: '', features_json: '[]', monthly_recommended: 0, show_sold_case: 0, source: 'mita-public', external_id: 'legacy-1', sold_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-09-30T12:00:00.000Z' }],
  vehicle_images: [], brand_aliases: [], site_settings: [], site_video_links: [],
});

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/d1/0001_baseline.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../migrations/d1/0002_shared_rate_limits.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../migrations/d1-public-source/0001_public_source_sync.sql', import.meta.url), 'utf8'));
  const binding = {
    prepare(query) {
      let params = [];
      const stmt = {
        query,
        bind(...values) { params = values; return this; },
        values() { return params; },
        async all() { return { results: sqlite.prepare(query).all(...params) }; },
        async first() { return sqlite.prepare(query).get(...params) ?? null; },
        async run() { const result = sqlite.prepare(query).run(...params); return { success: true, meta: { changes: result.changes } }; },
      };
      return stmt;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(({ query, values = () => [] }) => sqlite.prepare(query).run(...values()));
        sqlite.exec('COMMIT');
        return results.map((r) => ({ success: true, meta: { changes: r.changes } }));
      } catch (error) { sqlite.exec('ROLLBACK'); console.error(error); throw error; }
    },
  };
  const env = { DB_PREVIEW: binding, IMPORT_PREVIEW_TOKEN: token, MITA_PUBLIC_SYNC_ENABLED: 'true' };
  const request = (body, { auth = `Bearer ${token}`, enabled = 'true', receipts = [] } = {}) => new Request('https://preview.example/api/import/public-snapshot', {
    method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify({ snapshot: body, media_receipts: receipts }),
  });
  const post = (body, options) => POST({ request: request(body, options), locals: { runtime: { env: { ...env, MITA_PUBLIC_SYNC_ENABLED: options?.enabled ?? 'true' } } } });
  return { sqlite, binding, post, request };
}

test('public snapshot import applies allowlisted rows and exact replay is idempotent', async () => {
  const f = fixture();
  try {
    const first = await f.post(baseSnapshot());
    assert.equal(first.status, 200, await first.clone().text());
    const firstBody = await first.json();
    assert.equal(firstBody.revision, 1);
    const before = f.sqlite.prepare('SELECT id, created_at, updated_at FROM vehicles').get();
    const replay = await f.post(baseSnapshot());
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replay, true);
    assert.deepEqual(f.sqlite.prepare('SELECT id, created_at, updated_at FROM vehicles').get(), before);
  } finally { f.sqlite.close(); }
});

test('route rejects auth, disabled flag, private fields, and non-public vehicle status', async () => {
  const f = fixture();
  try {
    assert.equal((await f.post(baseSnapshot(), { auth: 'Bearer wrong' })).status, 401);
    assert.equal((await f.post(baseSnapshot(), { enabled: 'false' })).status, 503);
    const privateSnapshot = baseSnapshot(); privateSnapshot.vehicles[0].local_edits_json = '[]';
    assert.equal((await f.post(privateSnapshot)).status, 400);
    const hidden = baseSnapshot(); hidden.vehicles[0].status = 'draft';
    assert.equal((await f.post(hidden)).status, 400);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM vehicles').get().n, 0);
  } finally { f.sqlite.close(); }
});

test('signed receipt remaps referenced source media and missing receipt is rejected', async () => {
  const f = fixture();
  try {
    const snapshot = baseSnapshot(); snapshot.vehicle_images.push({ id: 'image-1', vehicle_id: 'public-car-1', url: 'https://mita.sisihome.org/media/vehicle/a.png', alt: '', sort_order: 0, is_cover: 1, created_at: '2026-01-01T00:00:00.000Z' });
    assert.equal((await f.post(snapshot)).status, 400);
    const receipt = { source_url: snapshot.vehicle_images[0].url, target_url: 'https://mita.sisihome.org/media/vehicle/' + 'a'.repeat(64) + '.png', sha256: 'a'.repeat(64), bytes: 10, content_type: 'image/png' };
    const signature = await signPublicMediaReceipt(token, receipt);
    const response = await f.post(snapshot, { receipts: [{ ...receipt, signature }] });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(f.sqlite.prepare('SELECT url FROM vehicle_images').get().url, '/media/vehicle/' + 'a'.repeat(64) + '.png');
  } finally { f.sqlite.close(); }
});

test('large 1042-receipt envelope stays in the bounded body and inserts through D1', async () => {
  const f = fixture();
  try {
    const snapshot = baseSnapshot();
    for (let i = 0; i < 1042; i++) snapshot.vehicle_images.push({ id: `image-${i}`, vehicle_id: 'public-car-1', url: `/media/vehicle/${i}.webp`, alt: '', sort_order: i, is_cover: i === 0 ? 1 : 0, created_at: '2026-01-01T00:00:00.000Z' });
    const receipts = await Promise.all(snapshot.vehicle_images.map(async (image, i) => {
      const sha256 = i.toString(16).padStart(64, '0');
      const receipt = { source_url: image.url, target_url: `https://mita.sisihome.org/media/vehicle/${sha256}.webp`, sha256, bytes: 10, content_type: 'image/webp' };
      return { ...receipt, signature: await signPublicMediaReceipt(token, receipt) };
    }));
    const request = f.request(snapshot, { receipts });
    assert.equal(request.headers.has('x-public-media-receipts'), false);
    assert.equal(request.headers.has('x-public-data-revision'), false);
    const response = await POST({ request, locals: { runtime: { env: { DB_PREVIEW: f.binding, IMPORT_PREVIEW_TOKEN: token, MITA_PUBLIC_SYNC_ENABLED: 'true' } } } });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM vehicle_images').get().n, 1042);
    assert.equal(f.sqlite.prepare('SELECT url FROM vehicle_images WHERE id=?').get('image-1041').url, `/media/vehicle/${(1041).toString(16).padStart(64, '0')}.webp`);
  } finally { f.sqlite.close(); }
});

test('rejects malformed envelope, duplicate and invalid receipts before mutation', async () => {
  const f = fixture();
  try {
    assert.equal((await f.post('{')).status, 400);
    const snapshot = baseSnapshot(); snapshot.vehicle_images.push({ id: 'image-1', vehicle_id: 'public-car-1', url: '/media/vehicle/a.webp', alt: '', sort_order: 0, is_cover: 1, created_at: 't' });
    const receipt = { source_url: '/media/vehicle/a.webp', target_url: `https://mita.sisihome.org/media/vehicle/${'a'.repeat(64)}.webp`, sha256: 'a'.repeat(64), bytes: 10, content_type: 'image/webp' };
    const signed = { ...receipt, signature: await signPublicMediaReceipt(token, receipt) };
    assert.equal((await f.post(snapshot, { receipts: [signed, signed] })).status, 400);
    assert.equal((await f.post(snapshot, { receipts: [{ ...signed, signature: '0'.repeat(64) }] })).status, 400);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM vehicles').get().n, 0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM vehicle_images').get().n, 0);
  } finally { f.sqlite.close(); }
});

test('rejects an oversized or malformed streamed body', async () => {
  const f = fixture();
  try {
    const malformedStream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); controller.error(new Error('synthetic stream failure')); } });
    const request = new Request('https://preview.example/api/import/public-snapshot', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: malformedStream, duplex: 'half' });
    assert.equal((await POST({ request, locals: { runtime: { env: { DB_PREVIEW: f.binding, IMPORT_PREVIEW_TOKEN: token, MITA_PUBLIC_SYNC_ENABLED: 'true' } } } })).status, 413);
    const large = new Request('https://preview.example/api/import/public-snapshot', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: new Uint8Array(5 * 1024 * 1024 + 1) });
    assert.equal((await POST({ request: large, locals: { runtime: { env: { DB_PREVIEW: f.binding, IMPORT_PREVIEW_TOKEN: token, MITA_PUBLIC_SYNC_ENABLED: 'true' } } } })).status, 413);
  } finally { f.sqlite.close(); }
});

test('server observes the current revision after an external public edit', async () => {
  const f = fixture();
  try {
    f.sqlite.prepare("INSERT INTO vehicles (id,slug,title,brand,model,created_at,updated_at) VALUES ('manual-1','manual-1','Manual','B','M','t','t')").run();
    assert.equal(f.sqlite.prepare('SELECT revision FROM public_data_revision').get().revision, 1);
    const response = await f.post(baseSnapshot());
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM vehicles WHERE id='public-car-1'").get().n, 1);
  } finally { f.sqlite.close(); }
});
