import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

const repo = path.resolve(new URL('../..', import.meta.url).pathname);
const cli = path.join(repo, 'scripts/sync-public-source.mjs');
const token = 'synthetic-local-import-token';
const snapshot = () => ({
  schema_version: 1, captured_at: '2026-09-30T12:00:00.000Z',
  source: { name: 'mita-public', origin: 'https://mita.sisihome.org', host: 'synthetic-host', container: 'synthetic-container', database_path: '/synthetic/db', readonly: true, public_snapshot_complete: true },
  visibility: { always_public_statuses: ['published','incoming','reserved','special','unknown'], show_sold_vehicles: false },
  projection: { excluded: ['admin_users','admin_sessions','sell_inquiries','import_mappings','local_edits_json','openCode.*','SMTP/auth/credentials','raw featureLicenseMask','hero conversion diagnostics'], feature_mask: 'public effective mask only', heroVideos: 'id and effective public playback/poster/label only' },
  vehicles: [{ id: 'synthetic-car', slug: 'synthetic-car', title: 'Synthetic', card_title_supplement: '', brand: 'Brand', model: 'Model', sub_model: '', year: '2020', mileage: '1', exterior_color: '', interior_color: '', condition: 'Good', status: 'published', headline: '', description: '', features_json: '[]', monthly_recommended: 0, show_sold_case: 0, source: 'mita-public', external_id: 'synthetic-id', sold_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-09-30T12:00:00.000Z' }],
  vehicle_images: [], brand_aliases: [], site_settings: [], site_video_links: [],
});

function run(args, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: repo, env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), 'mita-t16-'));
  const snap = path.join(dir, 'snapshot.json');
  const manifest = path.join(dir, 'assets.json');
  const assets = path.join(dir, 'assets');
  await mkdir(assets);
  await writeFile(snap, JSON.stringify(snapshot()));
  await writeFile(manifest, '[]');
  return { dir, snap, manifest, assets, journal: path.join(tmpdir(), `mita-t16-journal-${process.pid}-${Date.now()}.json`) };
}

function serve(handler) {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await handler(req, res, Buffer.concat(chunks));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

const options = f => ['--snapshot', f.snap, '--assets-manifest', f.manifest, '--assets-root', f.assets, '--base-url', f.base, '--journal', f.journal];

test('plain node CLI applies and resumes two captured snapshots using loopback only', async () => {
  const f = await setup();
  let posts = 0;
  const observed = [];
  const fixture = await serve(async (req, res, body) => {
    observed.push(`${req.method} ${req.url}`);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    if (req.url === '/api/import/public-snapshot') {
      posts++;
      const envelope = JSON.parse(body.toString());
      assert.deepEqual(Object.keys(envelope).sort(), ['media_receipts', 'snapshot']);
      assert.equal(req.headers['x-public-data-revision'], undefined);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, revision: posts }));
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  try {
    f.base = fixture.base;
    let result = await run(options(f), { MITA_LOCAL_IMPORT_TOKEN: token, NODE_OPTIONS: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).applied, true);
    const next = snapshot(); next.captured_at = '2026-10-01T12:00:00.000Z';
    await writeFile(f.snap, JSON.stringify(next));
    result = await run(options(f), { MITA_LOCAL_IMPORT_TOKEN: token, NODE_OPTIONS: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(posts, 2);
    assert.deepEqual(observed, ['POST /api/import/public-snapshot', 'POST /api/import/public-snapshot']);
  } finally { fixture.server.close(); await rm(f.dir, { recursive: true, force: true }); await rm(f.journal, { force: true }); }
});

test('validates local assets before network, rejects remote targets and private token modes', async () => {
  const f = await setup();
  try {
    let result = await run(['--help'], { NODE_OPTIONS: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--verify-media/);
    result = await run([...options({ ...f, base: 'https://example.com' })], { MITA_LOCAL_IMPORT_TOKEN: token, NODE_OPTIONS: '' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /loopback/);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    await writeFile(path.join(f.assets, 'image.jpg'), bytes);
    const source = 'https://mita.sisihome.org/media/synthetic.jpg';
    const row = { source_url: source, relative_path: 'image.jpg', roles: ['vehicle-image'], content_type: 'image/jpeg', content_length: bytes.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), file: 'image.jpg', downloaded_at: '2026-10-01T00:00:00.000Z', status: 200 };
    const snap = snapshot(); snap.vehicle_images.push({ id: 'synthetic-image', vehicle_id: 'synthetic-car', url: source, alt: '', sort_order: 0, is_cover: 1, created_at: '2026-01-01T00:00:00Z' });
    await writeFile(f.snap, JSON.stringify(snap)); await writeFile(f.manifest, JSON.stringify([row]));
    await writeFile(path.join(f.assets, 'image.jpg'), Buffer.from('tampered'));
    result = await run(options({ ...f, base: 'http://127.0.0.1:9' }), { MITA_LOCAL_IMPORT_TOKEN: token, NODE_OPTIONS: '' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /mismatch/);
    const tokenFile = path.join(f.dir, 'token'); await writeFile(tokenFile, token); await chmod(tokenFile, 0o644);
    result = await run(options({ ...f, base: 'http://127.0.0.1:9' }), { MITA_LOCAL_IMPORT_TOKEN: '', MITA_LOCAL_IMPORT_TOKEN_FILE: tokenFile, NODE_OPTIONS: '' });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(token));
  } finally { await rm(f.dir, { recursive: true, force: true }); await rm(f.journal, { force: true }); }
});

test('uploads captured asset once, resumes by local HEAD, and never contacts public source origin', async () => {
  const f = await setup();
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const source = 'https://mita.sisihome.org/media/synthetic.jpg';
  const target = `https://mita.sisihome.org/media/vehicle/${hash}.jpg`;
  const targetPath = new URL(target).pathname;
  const signature = createHmac('sha256', token).update(JSON.stringify([source, target, hash, bytes.length, 'image/jpeg'])).digest('hex');
  const receipt = { source_url: source, target_url: target, sha256: hash, bytes: bytes.length, content_type: 'image/jpeg', signature };
  const requests = [];
  const fixture = await serve(async (req, res, body) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.url === '/api/import/public-media') {
      assert.equal(req.method, 'POST'); assert.equal(req.headers['x-source-url'], source); assert.deepEqual(body, bytes);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(receipt)); return;
    }
    if (req.url === targetPath && req.method === 'HEAD') { res.writeHead(200, { 'content-length': bytes.length, 'content-type': 'image/jpeg' }); res.end(); return; }
    if (req.url === targetPath && req.method === 'GET') { res.writeHead(200, { 'content-length': bytes.length, 'content-type': 'image/jpeg' }); res.end(bytes); return; }
    if (req.url === '/api/import/public-snapshot') {
      const envelope = JSON.parse(body.toString());
      assert.deepEqual(envelope.media_receipts, [receipt]);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, revision: 1 })); return;
    }
    res.writeHead(404); res.end();
  });
  try {
    f.base = fixture.base;
    await writeFile(path.join(f.assets, 'car.jpg'), bytes);
    const snap = snapshot(); snap.vehicle_images.push({ id: 'synthetic-image', vehicle_id: 'synthetic-car', url: source, alt: '', sort_order: 0, is_cover: 1, created_at: '2026-01-01T00:00:00Z' });
    await writeFile(f.snap, JSON.stringify(snap));
    await writeFile(f.manifest, JSON.stringify([{ source_url: source, relative_path: 'car.jpg', roles: ['vehicle-image'], content_type: 'image/jpeg', content_length: bytes.length, bytes: bytes.length, sha256: hash, file: 'car.jpg', downloaded_at: '2026-10-01T00:00:00.000Z', status: 200 }]));
    let result = await run(options(f), { MITA_LOCAL_IMPORT_TOKEN: token, NODE_OPTIONS: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"uploaded":\["https:\/\/mita\.sisihome\.org\/media\/synthetic\.jpg"\]/);
    const saved = JSON.parse(await readFile(f.journal, 'utf8'));
    assert.deepEqual(saved.receipts, [receipt]);
    const newer = snapshot(); newer.captured_at = '2026-10-02T00:00:00Z'; newer.vehicle_images = snap.vehicle_images;
    await writeFile(f.snap, JSON.stringify(newer));
    result = await run([...options(f), '--verify-media'], { MITA_LOCAL_IMPORT_TOKEN: token, NODE_OPTIONS: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"reused":\["https:\/\/mita\.sisihome\.org\/media\/synthetic\.jpg"\]/);
    assert.equal(requests.filter(x => x === 'POST /api/import/public-media').length, 1);
    assert.equal(requests.some(x => x.includes('mita.sisihome.org')), false);
    assert.equal(requests.filter(x => x === `HEAD ${targetPath}`).length, 1);
    assert.equal(requests.filter(x => x === `GET ${targetPath}`).length, 1);
  } finally { fixture.server.close(); await rm(f.dir, { recursive: true, force: true }); await rm(f.journal, { force: true }); }
});

test('preserves successful receipts and exits nonzero on target conflict', async () => {
  const f = await setup();
  const fixture = await serve(async (req, res) => { res.writeHead(409, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'synthetic conflict' })); });
  try {
    f.base = fixture.base;
    const result = await run(options(f), { MITA_LOCAL_IMPORT_TOKEN: token, NODE_OPTIONS: '' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /"targetHTTP":409/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(token));
  } finally { fixture.server.close(); await rm(f.dir, { recursive: true, force: true }); await rm(f.journal, { force: true }); }
});
