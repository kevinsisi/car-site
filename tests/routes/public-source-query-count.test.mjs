import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyPublicSnapshot, PublicSyncConflict } from '../../src/lib/public-source-sync.ts';
import { MAX_IMAGES, MAX_JSON_BIND_BYTES, MAX_VEHICLES, PUBLIC_SETTING_KEYS, parsePublicSnapshot } from '../../src/lib/public-source-snapshot.ts';

const evidenceDir = mkdtempSync(path.join(tmpdir(), 'mita-public-query-evidence-'));
const OUT = path.join(evidenceDir, 'query-counts.json');
const REPORT = path.join(evidenceDir, 'report.md');
const LIMIT = MAX_JSON_BIND_BYTES;
const stamp = (n) => `2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`;
const empty = () => ({
  schema_version: 1, captured_at: stamp(1),
  source: { name: 'mita-public', origin: 'https://mita.sisihome.org', host: 'synthetic-host', container: 'synthetic-container', database_path: '/synthetic/db', readonly: true, public_snapshot_complete: true },
  visibility: { always_public_statuses: ['published', 'incoming', 'reserved', 'special', 'unknown'], show_sold_vehicles: false },
  projection: { excluded: ['admin_users','admin_sessions','sell_inquiries','import_mappings','local_edits_json','openCode.*','SMTP/auth/credentials','raw featureLicenseMask','hero conversion diagnostics'], feature_mask: 'public effective mask only', heroVideos: 'id and effective public playback/poster/label only' },
  vehicles: [], vehicle_images: [], brand_aliases: [], site_settings: [], site_video_links: [],
});

function vehicle(i) { return { id:`car-${i}`, slug:`car-${i}`, title:`Car ${i}`, card_title_supplement:'', brand:'Synthetic', model:'Model', sub_model:'', year:'2020', mileage:'1000', exterior_color:'', interior_color:'', condition:'Good', status:'published', headline:'', description:'', features_json:'[]', monthly_recommended:0, show_sold_case:0, source:'synthetic', external_id:`ext-${i}`, sold_at:null, created_at:stamp(1), updated_at:stamp(1) }; }
function image(i, vehicleId = 'car-0', pad = 0) { return { id:`image-${i}`, vehicle_id:vehicleId, url:`/media/${i}-${'x'.repeat(pad)}.webp`, alt:'synthetic', sort_order:i, is_cover:i === 0 ? 1 : 0, created_at:stamp(1) }; }
function alias(i) { return { source_brand:`brand-${i}`, display_name:`Brand ${i}`, url_slug:`brand-${i}`, icon_url:null, updated_at:stamp(1) }; }
function setting(i) { return { key:PUBLIC_SETTING_KEYS[i % PUBLIC_SETTING_KEYS.length], value:`value-${i}`, updated_at:stamp(1) }; }
function video(i) { return { id:`video-${i}`, title:`Video ${i}`, url:`https://example.invalid/${i}`, thumbnail_url:null, sort_order:i, created_at:stamp(1) }; }

class SqliteD1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.resetMetrics(); }
  resetMetrics() { this.metrics = { prepare:0, firstCalls:0, allCalls:0, runCalls:0, batchCalls:0, batchStatements:0, returnedRows:0, calls:[] }; }
  exec(sql) { this.sqlite.exec(sql); }
  prepare(sql) {
    this.metrics.prepare++;
    const stmt = this.sqlite.prepare(sql); let values = [];
    const count = (method, rows = 0) => { this.metrics[`${method}Calls`]++; this.metrics.returnedRows += rows; this.metrics.calls.push({ method, sql, returnedRows:rows }); };
    const bound = {
      bind(...args) { values = args; return bound; },
      all() { const results = stmt.all(...values); count('all', results.length); return { results }; },
      first() { const result = stmt.get(...values) ?? null; count('first', result ? 1 : 0); return result; },
      run() { count('run'); return stmt.run(...values); },
      values() { return values; },
    };
    return bound;
  }
  batch(statements) {
    this.metrics.batchCalls++; this.metrics.batchStatements = Math.max(this.metrics.batchStatements, statements.length);
    this.sqlite.exec('BEGIN');
    try { for (const statement of statements) statement.run(); this.sqlite.exec('COMMIT'); }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
    return [];
  }
}

function database() {
  const db = new SqliteD1();
  for (const file of ['0001_baseline.sql','0002_shared_rate_limits.sql']) db.exec(awaitlessRead(new URL(`../../migrations/d1/${file}`, import.meta.url)));
  for (const file of ['0001_public_source_sync.sql','0002_vehicle_image_identity_index.sql']) db.exec(awaitlessRead(new URL(`../../migrations/d1-public-source/${file}`, import.meta.url)));
  return db;
}
function awaitlessRead(url) { return readFileSync(url, 'utf8'); }

async function runSync(db, snapshot) { snapshot.captured_at = stamp(Number(snapshot.captured_at.slice(8, 10)) + 1); return applyPublicSnapshot(db, snapshot, snapshot); }
function tableCounts(db) { return Object.fromEntries(['vehicles','vehicle_images','brand_aliases','site_settings','site_video_links'].map((table) => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first().n])); }
function byteSizes(value) { return { whole:Buffer.byteLength(JSON.stringify(value)), ...Object.fromEntries(['vehicles','vehicle_images','brand_aliases','site_settings','site_video_links'].map((key) => [key, Buffer.byteLength(JSON.stringify(value[key]))])) }; }
function querySummary(metrics) { return { prepare:metrics.prepare, firstCalls:metrics.firstCalls, allCalls:metrics.allCalls, runCalls:metrics.runCalls, batchCalls:metrics.batchCalls, batchStatements:metrics.batchStatements, returnedRows:metrics.returnedRows, readReturnedRows:metrics.calls.filter((x) => x.method === 'all' || x.method === 'first').reduce((n,x) => n+x.returnedRows,0), lookupCalls:metrics.calls.filter((x) => x.sql.includes('WHERE') && x.method === 'all').length }; }

const evidence = { policy:'code-only; wholly synthetic in-memory SQLite using repository D1 migrations; no production/runtime performance claims', scenarios:[], explain:[], baselineSemantics:{}, guards:{} };
const record = (scenario, result) => evidence.scenarios.push({ scenario, ...result });

test('synthetic D1 query count is row-independent for representative shapes and batch remains capped', async () => {
  for (const [name, count] of [['small', 2], ['representative-73-vehicles-1033-images', 73]]) {
    const db = database();
    const snap = empty(); snap.vehicles = Array.from({length:count}, (_,i) => vehicle(i));
    snap.vehicle_images = Array.from({length:name === 'small' ? 4 : 1033}, (_,i) => image(i, `car-${i % count}`));
    snap.brand_aliases = [alias(0)]; snap.site_settings = [setting(0)]; snap.site_video_links = [video(0)];
    db.resetMetrics(); await applyPublicSnapshot(db, snap, snap);
    const metrics = { ...db.metrics, calls:[...db.metrics.calls] };
    assert.equal(metrics.batchCalls, 1); assert.ok(metrics.batchStatements <= 50);
    record(name, { incoming:Object.fromEntries(Object.entries(snap).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k,v.length])), queryCounts:querySummary(metrics), returnedRowsByOperation:metrics.calls.map(({method,sql,returnedRows}) => ({method,sql:sql.replace(/\s+/g,' ').trim(),returnedRows})) });
    db.sqlite.close();
  }
  const small = evidence.scenarios[0].queryCounts, representative = evidence.scenarios[1].queryCounts;
  assert.equal(small.prepare, representative.prepare); assert.equal(small.allCalls, representative.allCalls); assert.equal(small.firstCalls, representative.firstCalls);
  assert.equal(small.batchStatements, representative.batchStatements);
});

test('largest admitted fixtures honor per-table and whole-baseline byte guards; oversize fails before target lookups or writes', async () => {
  const db = database();
  const snap = empty(); snap.vehicles = [vehicle(0)]; snap.brand_aliases = [alias(0)]; snap.site_settings = [setting(0)]; snap.site_video_links = [video(0)];
  const fixedBytes = Buffer.byteLength(JSON.stringify(snap));
  const targetBytes = LIMIT - fixedBytes - 360000;
  const eachImageBytes = Buffer.byteLength(JSON.stringify(image(0)));
  const n = Math.min(MAX_IMAGES, Math.floor(targetBytes / eachImageBytes));
  snap.vehicle_images = Array.from({length:n}, (_,i) => image(i));
  while (Buffer.byteLength(JSON.stringify(snap.vehicle_images)) > LIMIT || Buffer.byteLength(JSON.stringify(snap)) > LIMIT) snap.vehicle_images.pop();
  assert.ok(byteSizes(snap).whole <= LIMIT);
  assert.ok(Object.values(byteSizes(snap)).filter((n) => typeof n === 'number').every((n) => n <= LIMIT));
  db.resetMetrics(); await applyPublicSnapshot(db, snap, snap);
  const firstMetrics = { ...db.metrics, calls:[...db.metrics.calls] };
  record('largest-admitted-image-shaped-snapshot', { incoming:Object.fromEntries(['vehicles','vehicle_images','brand_aliases','site_settings','site_video_links'].map((k) => [k,snap[k].length])), bytes:byteSizes(snap), queryCounts:querySummary(firstMetrics), returnedRowsByOperation:firstMetrics.calls.map(({method,sql,returnedRows}) => ({method,sql:sql.replace(/\s+/g,' ').trim(),returnedRows})) });
  assert.equal(firstMetrics.batchCalls, 1); assert.ok(firstMetrics.batchStatements <= 50);

  const prior = JSON.parse(db.prepare('SELECT baseline_json FROM source_sync_state').first().baseline_json);
  const before = tableCounts(db); const beforeRev = db.prepare('SELECT revision FROM public_data_revision WHERE id=1').first().revision;
  const over = structuredClone(snap); over.captured_at = stamp(3); over.vehicle_images[0].alt = 'x'.repeat(LIMIT);
  assert.throws(() => parsePublicSnapshot(new TextEncoder().encode(JSON.stringify(over))), /vehicle_images exceeds 1.5 MiB JSON bind limit/);
  db.resetMetrics(); await assert.rejects(applyPublicSnapshot(db, over, over), PublicSyncConflict);
  const rejectedMetrics = { ...db.metrics, calls:[...db.metrics.calls] };
  assert.equal(rejectedMetrics.calls.filter((x) => /FROM (vehicles|vehicle_images|brand_aliases|site_settings|site_video_links) WHERE/.test(x.sql)).length, 0);
  assert.equal(rejectedMetrics.batchCalls, 0);
  assert.deepEqual(tableCounts(db), before);
  assert.deepEqual(JSON.parse(db.prepare('SELECT baseline_json FROM source_sync_state').first().baseline_json), prior);
  assert.equal(db.prepare('SELECT revision FROM public_data_revision WHERE id=1').first().revision, beforeRev);
  evidence.guards = { admittedShapeBytes:byteSizes(snap), perTableLimit:LIMIT, wholeBaselineLimit:LIMIT, imageLimit:MAX_IMAGES, admittedImageRows:n, rejectedOversize:{ reason:'incoming image pushes mapped baseline over 1.5 MiB', measuredCalls:querySummary(rejectedMetrics), targetLookups:rejectedMetrics.calls.filter((x) => /FROM (vehicles|vehicle_images|brand_aliases|site_settings|site_video_links) WHERE/.test(x.sql)).length, batchCalls:rejectedMetrics.batchCalls, targetCountsUnchanged:true, baselineUnchanged:true, revisionUnchanged:true } };
  db.sqlite.close();
});

test('key lookup EXPLAIN plans and baseline replacement semantics are captured across repeated withdrawal/update', async () => {
  const db = database(); const initial = empty(); initial.vehicles = [vehicle(0),vehicle(1)]; initial.vehicle_images = [image(0),image(1,'car-1')]; initial.brand_aliases=[alias(0)]; initial.site_settings=[setting(0)]; initial.site_video_links=[video(0)];
  await applyPublicSnapshot(db, initial, initial);
  const next = empty(); next.captured_at=stamp(2); next.vehicles=[{...vehicle(0),title:'updated'}]; next.vehicle_images=[image(0)]; next.brand_aliases=[]; next.site_settings=[]; next.site_video_links=[];
  db.resetMetrics(); await applyPublicSnapshot(db,next,next);
  const baseline = JSON.parse(db.prepare('SELECT baseline_json FROM source_sync_state').first().baseline_json);
  assert.equal(baseline.vehicles.length,2); assert.equal(baseline.vehicles.find(x=>x.id==='car-1').status,'archived');
  assert.equal(baseline.vehicle_images.length,1);
  for (const key of ['brand_aliases','site_settings','site_video_links']) assert.equal(baseline[key].length,0,`${key} should be replaced rather than concatenated`);
  const withdrawn = empty(); withdrawn.captured_at=stamp(3); await applyPublicSnapshot(db,withdrawn,withdrawn);
  const withdrawnBaseline=JSON.parse(db.prepare('SELECT baseline_json FROM source_sync_state').first().baseline_json);
  assert.equal(withdrawnBaseline.vehicles.length,2); assert.ok(withdrawnBaseline.vehicles.every(x=>x.status==='archived'));
  for (const key of ['vehicle_images','brand_aliases','site_settings','site_video_links']) assert.equal(withdrawnBaseline[key].length,0);
  for (const [table,key] of [['vehicles','id'],['vehicle_images','id'],['brand_aliases','source_brand'],['site_settings','key'],['site_video_links','id']]) {
    const query = `EXPLAIN QUERY PLAN SELECT ${key} FROM ${table} WHERE ${key} IN (SELECT value FROM json_each(?))`;
    const plan = db.sqlite.prepare(query).all('["synthetic-key"]').map((row) => ({...row})); evidence.explain.push({table,query,plan});
  }
  evidence.baselineSemantics = { afterUpdateAndWithdrawal:{ incomingVehicleRows:1, retainedArchivedVehicleRows:1, nonVehicleArrays:{vehicle_images:0,brand_aliases:0,site_settings:0,site_video_links:0} }, rule:'mappedBaseline spreads incoming snapshot/data; only vehicles is explicitly concatenated with archived prior tombstones' };
  db.sqlite.close();
});

test('cardinality upper bound follows admitted byte and required-field constraints', () => {
  const required = { vehicles:['id','slug','title','brand','model','condition','status','headline','description','features_json','source','created_at','updated_at'], vehicle_images:['id','url','alt','created_at'], brand_aliases:['source_brand','display_name','url_slug','updated_at'], site_settings:['key','value','updated_at'], site_video_links:['id','title','url','created_at'] };
  const minimum = { vehicles:vehicle(0), vehicle_images:image(0), brand_aliases:alias(0), site_settings:setting(0), site_video_links:video(0) };
  const bounds = Object.fromEntries(Object.keys(required).map((table) => { const bytes=Buffer.byteLength(JSON.stringify([minimum[table]])); return [table,{requiredFields:required[table],minimumSyntheticOneRowJsonBytes:bytes,coarseRowsPerTableCeiling:Math.floor(LIMIT/bytes)}]; }));
  evidence.cardinality = { method:'The per-table parser rejects JSON arrays exceeding 1.5 MiB. Each row must contain the listed required string fields and all schema fields; bounding each row by its smallest valid one-row serialization gives a deliberately coarse ceiling floor(1.5 MiB / minimum valid row bytes). Vehicles also capped at MAX_VEHICLES=1000; images at MAX_IMAGES=20000. Whole mapped baseline adds a stricter 1.5 MiB cap and archived vehicle tombstones. Physical lookup returns at most distinct incoming ∪ prior IDs per table (plus bounded vehicle slug collision rows); total returned rows are bounded by these input/prior unions, while query round trips are fixed by table count.', bounds, vehicleLimit:MAX_VEHICLES, imageLimit:MAX_IMAGES };
  const report = `# Public snapshot sync query-count evidence\n\nScope: synthetic, in-memory SQLite using repository migrations and the real applyPublicSnapshot function. No production data or production performance claim.\n\nCommands:\n- \`node --import tsx --test tests/routes/public-source-query-count.test.mjs\`\n- \`git diff --check\`\n\nThe test writes this report and \`${OUT}\`.\n\n## Observed counts and returned rows\n\n${evidence.scenarios.map(s=>`### ${s.scenario}\n\nIncoming rows: \`${JSON.stringify(s.incoming)}\`.\n\nQuery counts: \`${JSON.stringify(s.queryCounts)}\`.\n\nPer-call returned rows: \`${JSON.stringify(s.returnedRowsByOperation)}\`.`).join('\n\n')}\n\n### Largest admitted fixture and byte guards\n\n\`${JSON.stringify(evidence.guards)}\`\n\n### Baseline replacement behavior\n\n\`${JSON.stringify(evidence.baselineSemantics)}\`\n\nIncoming arrays replace aliases/settings/videos/images in mappedBaseline. Only vehicles concatenate prior missing vehicles as archived tombstones.\n\n### EXPLAIN QUERY PLAN\n\n\`${JSON.stringify(evidence.explain)}\`\n\n### Coarse cardinality bound\n\n${evidence.cardinality.method}\n\n\`${JSON.stringify(evidence.cardinality.bounds)}\`\n\nFixed call topology: revision first + baseline all + at most five table identity lookups + one vehicle slug collision lookup when nonempty + a single batch + post-revision first. Each target lookup is over a deduplicated prior/incoming identity union. Query returned rows are therefore bounded by those unions and incoming slugs; no rows-per-call growth in the observed samples. Batch statement count is asserted <=50.\n`;
  writeFileSync(OUT, `${JSON.stringify(evidence,null,2)}\n`);
  writeFileSync(REPORT, report);
  console.info(`Public query-count evidence: ${REPORT}`);
});
