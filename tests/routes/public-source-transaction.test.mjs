import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyPublicSnapshot, PublicSyncConflict } from '../../src/lib/public-source-sync.ts';
import { MAX_VEHICLES } from '../../src/lib/public-source-snapshot.ts';

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
      run() { return statement.run(...values); },
    };
    return bound;
  }
  batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      for (const statement of statements) statement.run();
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
    return [];
  }
}

const stamp = (n) => `2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`;
function snapshot(day, overrides = {}) {
  const vehicle = {
    id: 'source-car', slug: 'source-car', title: 'Source title', card_title_supplement: '', brand: 'Maker', model: 'Model',
    sub_model: '', year: '2020', mileage: '12000', exterior_color: '', interior_color: '', condition: 'Good', status: 'published',
    headline: '', description: '', features_json: '[]', monthly_recommended: 0, show_sold_case: 0,
    source: 'sheet-to-car-prod/manual', external_id: 'Ext-Case-A', sold_at: null, created_at: stamp(1), updated_at: stamp(day),
    ...overrides,
  };
  return {
    schema_version: 1, captured_at: stamp(day),
    source: { name: 'mita-public', origin: 'https://mita.sisihome.org', host: 'synthetic-host', container: 'synthetic-container', database_path: '/synthetic/db', readonly: true, public_snapshot_complete: true },
    visibility: { always_public_statuses: ['published', 'incoming', 'reserved', 'special', 'unknown'], show_sold_vehicles: false },
    projection: { excluded: ['admin_users','admin_sessions','sell_inquiries','import_mappings','local_edits_json','openCode.*','SMTP/auth/credentials','raw featureLicenseMask','hero conversion diagnostics'], feature_mask: 'public effective mask only', heroVideos: 'id and effective public playback/poster/label only' },
    vehicles: [vehicle], vehicle_images: [], brand_aliases: [], site_settings: [], site_video_links: [],
  };
}

function database() {
  const db = new SqliteD1();
  for (const migration of ['0001_baseline.sql', '0002_shared_rate_limits.sql']) {
    db.exec(readFileSync(new URL(`../../migrations/d1/${migration}`, import.meta.url), 'utf8'));
  }
  db.exec(readFileSync(new URL('../../migrations/d1-public-source/0001_public_source_sync.sql', import.meta.url), 'utf8'));
  return db;
}

test('first import preserves original source identity and unrelated manual vehicle', async () => {
  const db = database();
  db.prepare(`INSERT INTO vehicles (id,slug,title,brand,model,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind('manual-car', 'manual-car', 'Manual car', 'Other', 'Manual', 'manual', stamp(1), stamp(1)).run();
  await applyPublicSnapshot(db, snapshot(2), snapshot(2), db.prepare('SELECT revision FROM public_data_revision').first().revision);
  assert.deepEqual(db.prepare('SELECT id,source,external_id FROM vehicles ORDER BY id').all().results.map((row) => ({ ...row })), [
    { id: 'manual-car', source: 'manual', external_id: null },
    { id: 'source-car', source: 'sheet-to-car-prod/manual', external_id: 'Ext-Case-A' },
  ]);
});

test('later source addition cannot overwrite a manual vehicle with the same id', async () => {
  const db = database();
  const first = snapshot(2);
  await applyPublicSnapshot(db, first, first);
  db.prepare(`INSERT INTO vehicles (id,slug,title,brand,model,source,external_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind('manual-b', 'manual-b', 'Manual B', 'Other', 'Manual', 'manual', 'manual-ext-b', stamp(1), stamp(1)).run();

  const added = snapshot(3);
  added.vehicles.push({ ...first.vehicles[0], id: 'manual-b', slug: 'new-source-car', title: 'Incoming B', external_id: 'Ext-Case-B' });
  await assert.rejects(applyPublicSnapshot(db, added, added), PublicSyncConflict);
  assert.deepEqual(db.prepare("SELECT id,slug,title,source,external_id FROM vehicles WHERE id IN ('source-car','manual-b') ORDER BY id").all().results.map((row) => ({ ...row })), [
    { id: 'manual-b', slug: 'manual-b', title: 'Manual B', source: 'manual', external_id: 'manual-ext-b' },
    { id: 'source-car', slug: 'source-car', title: 'Source title', source: 'sheet-to-car-prod/manual', external_id: 'Ext-Case-A' },
  ]);
});

test('local edit survives source change, while same-field divergence conflicts without partial writes', async () => {
  const db = database();
  const first = snapshot(2);
  await applyPublicSnapshot(db, first, first);
  db.prepare("UPDATE vehicles SET title = 'Local title' WHERE id = 'source-car'").run();
  const second = snapshot(3);
  await applyPublicSnapshot(db, second, second);
  assert.equal(db.prepare("SELECT title FROM vehicles WHERE id='source-car'").first().title, 'Local title');
  const before = db.prepare('SELECT baseline_json, captured_at FROM source_sync_state').first();
  const revisionBeforeConflict = db.prepare('SELECT revision FROM public_data_revision').first().revision;
  db.prepare("UPDATE vehicles SET title = 'Conflicting local title' WHERE id = 'source-car'").run();
  const conflict = snapshot(4, { title: 'Conflicting source title' });
  await assert.rejects(applyPublicSnapshot(db, conflict, conflict, revisionBeforeConflict), PublicSyncConflict);
  assert.deepEqual(db.prepare('SELECT baseline_json, captured_at FROM source_sync_state').first(), before);
});

test('image removal preserves incoming order and vehicle withdrawal archives the owned row', async () => {
  const db = database();
  const first = snapshot(2);
  first.vehicle_images = [
    { id: 'image-b', vehicle_id: 'source-car', url: '/media/b.webp', alt: '', sort_order: 1, is_cover: 0, created_at: stamp(2) },
    { id: 'image-a', vehicle_id: 'source-car', url: '/media/a.webp', alt: '', sort_order: 0, is_cover: 1, created_at: stamp(2) },
  ];
  await applyPublicSnapshot(db, first, first);
  const next = snapshot(3);
  next.vehicle_images = [first.vehicle_images[1]];
  await applyPublicSnapshot(db, next, next);
  assert.deepEqual(db.prepare('SELECT id,sort_order FROM vehicle_images ORDER BY sort_order').all().results.map((row) => ({ ...row })), [{ id: 'image-a', sort_order: 0 }]);
  const withdrawn = snapshot(4);
  withdrawn.vehicles = [];
  await applyPublicSnapshot(db, withdrawn, withdrawn);
  assert.equal(db.prepare("SELECT status FROM vehicles WHERE id='source-car'").first().status, 'archived');
});

test('withdrawn source vehicle retains ownership and can reappear with its identity', async () => {
  const db = database();
  const first = snapshot(2);
  await applyPublicSnapshot(db, first, first);
  const withdrawn = snapshot(3);
  withdrawn.vehicles = [];
  await applyPublicSnapshot(db, withdrawn, withdrawn);
  assert.deepEqual({ ...db.prepare("SELECT id,slug,status,source,external_id FROM vehicles WHERE id='source-car'").first() }, {
    id: 'source-car', slug: 'source-car', status: 'archived', source: 'sheet-to-car-prod/manual', external_id: 'Ext-Case-A',
  });
  const returned = snapshot(4, { title: 'Returned title' });
  await applyPublicSnapshot(db, returned, returned);
  assert.deepEqual({ ...db.prepare("SELECT id,slug,title,status,source,external_id FROM vehicles WHERE id='source-car'").first() }, {
    id: 'source-car', slug: 'source-car', title: 'Returned title', status: 'published', source: 'sheet-to-car-prod/manual', external_id: 'Ext-Case-A',
  });
});

test('local vehicle slug collision rejects with complete rollback', async () => {
  const db = database();
  const first = snapshot(2);
  await applyPublicSnapshot(db, first, first);
  db.prepare(`INSERT INTO vehicles (id,slug,title,brand,model,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind('manual-car', 'new-source-car', 'Manual car', 'Other', 'Manual', 'manual', stamp(1), stamp(1)).run();
  const beforeRows = db.prepare('SELECT id,slug,title,source FROM vehicles ORDER BY id').all().results.map((row) => ({ ...row }));
  const beforeBaseline = db.prepare('SELECT baseline_json,captured_at,source_body_hash FROM source_sync_state').first();
  const beforeRevision = db.prepare('SELECT revision FROM public_data_revision').first().revision;
  const added = snapshot(3);
  added.vehicles.push({ ...first.vehicles[0], id: 'source-car-2', slug: 'new-source-car', title: 'Incoming second', external_id: 'Ext-Case-2' });

  await assert.rejects(applyPublicSnapshot(db, added, added), PublicSyncConflict);
  assert.deepEqual(db.prepare('SELECT id,slug,title,source FROM vehicles ORDER BY id').all().results.map((row) => ({ ...row })), beforeRows);
  assert.deepEqual(db.prepare('SELECT baseline_json,captured_at,source_body_hash FROM source_sync_state').first(), beforeBaseline);
  assert.equal(db.prepare('SELECT revision FROM public_data_revision').first().revision, beforeRevision);
});

test('equal replay is a no-op and older snapshots are rejected', async () => {
  const db = database();
  const input = snapshot(2);
  await applyPublicSnapshot(db, input, input);
  const revision = db.prepare('SELECT revision FROM public_data_revision').first().revision;
  assert.deepEqual(await applyPublicSnapshot(db, input, input), { revision, replay: true });
  await assert.rejects(applyPublicSnapshot(db, snapshot(1), snapshot(1)), /stale/);
  assert.equal(db.prepare('SELECT revision FROM public_data_revision').first().revision, revision);
});

test('late batch failure rolls back public rows and baseline together', async () => {
  const db = database();
  const input = snapshot(2);
  const batch = db.batch.bind(db);
  db.batch = (statements) => {
    const failing = [...statements];
    failing.splice(-2, 0, db.prepare("INSERT INTO site_settings (key,value,updated_at) VALUES ('bad','x','x')"));
    failing.splice(-1, 1, db.prepare("INSERT INTO source_sync_state (source,baseline_json,captured_at,source_body_hash) VALUES ('mita-public','bad','bad','bad')"));
    return batch(failing);
  };
  await assert.rejects(applyPublicSnapshot(db, input, input));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM vehicles WHERE id='source-car'").first().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM source_sync_state').first().count, 0);
});

test('revision race is rejected before any batch mutation', async () => {
  const db = database();
  const input = snapshot(2);
  const batch = db.batch.bind(db);
  db.batch = (statements) => {
    db.prepare('UPDATE public_data_revision SET revision=revision+1 WHERE id=1').run();
    return batch(statements);
  };
  await assert.rejects(applyPublicSnapshot(db, input, input), /revision changed concurrently/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM vehicles WHERE id='source-car'").first().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM source_sync_state').first().count, 0);
});

test('archived ownership accumulation beyond vehicle capacity fails closed', async () => {
  const db = database();
  const initial = snapshot(2);
  initial.vehicles = Array.from({ length: MAX_VEHICLES }, (_, index) => ({
    ...initial.vehicles[0], id: `source-${index}`, slug: `source-${index}`, external_id: `Ext-${index}`,
  }));
  await applyPublicSnapshot(db, initial, initial);
  const withdraw = snapshot(3);
  withdraw.vehicles = [];
  await applyPublicSnapshot(db, withdraw, withdraw);

  const beforeBaseline = db.prepare('SELECT baseline_json,captured_at,source_body_hash FROM source_sync_state').first();
  const beforeRevision = db.prepare('SELECT revision FROM public_data_revision').first().revision;
  const beforeRows = db.prepare('SELECT id,slug,status FROM vehicles ORDER BY id').all().results.map((row) => ({ ...row }));
  const next = snapshot(4);
  await assert.rejects(applyPublicSnapshot(db, next, next), PublicSyncConflict);
  assert.deepEqual(db.prepare('SELECT id,slug,status FROM vehicles ORDER BY id').all().results.map((row) => ({ ...row })), beforeRows);
  assert.deepEqual(db.prepare('SELECT baseline_json,captured_at,source_body_hash FROM source_sync_state').first(), beforeBaseline);
  assert.equal(db.prepare('SELECT revision FROM public_data_revision').first().revision, beforeRevision);
});

test('oversize prior baseline fails closed without writes', async () => {
  const db = database();
  const first = snapshot(2);
  await applyPublicSnapshot(db, first, first);
  const prior = JSON.parse(db.prepare('SELECT baseline_json FROM source_sync_state').first().baseline_json);
  prior.vehicles[0].slug = 'x'.repeat(1_600_000);
  db.prepare('UPDATE source_sync_state SET baseline_json=?').bind(JSON.stringify(prior)).run();
  const beforeBaseline = db.prepare('SELECT baseline_json,captured_at,source_body_hash FROM source_sync_state').first();
  const beforeRevision = db.prepare('SELECT revision FROM public_data_revision').first().revision;
  const beforeRows = db.prepare('SELECT id,slug,status FROM vehicles ORDER BY id').all().results.map((row) => ({ ...row }));

  await assert.rejects(applyPublicSnapshot(db, snapshot(3), snapshot(3)), PublicSyncConflict);
  assert.deepEqual(db.prepare('SELECT id,slug,status FROM vehicles ORDER BY id').all().results.map((row) => ({ ...row })), beforeRows);
  assert.deepEqual(db.prepare('SELECT baseline_json,captured_at,source_body_hash FROM source_sync_state').first(), beforeBaseline);
  assert.equal(db.prepare('SELECT revision FROM public_data_revision').first().revision, beforeRevision);
});
