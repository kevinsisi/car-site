#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MAX_ASSET = 40 * 1024 * 1024;
const MAX_TOTAL = 4 * 1024 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
const HELP = `Usage: node scripts/sync-public-source.mjs --snapshot FILE --assets-manifest FILE --assets-root DIR --base-url URL --journal FILE [--verify-media]\n\nSync a caller-captured public snapshot and local assets to a loopback T14/T15 Worker.\nOptions:\n  --snapshot FILE          Caller-captured public snapshot JSON\n  --assets-manifest FILE   Caller-produced asset manifest JSON array\n  --assets-root DIR        Root containing the manifest asset files\n  --base-url URL           http://127.0.0.1, localhost, or [::1] Worker origin\n  --journal FILE           Atomic signed-receipt journal outside the repository\n  --verify-media           GET and hash each target media object before applying\n  --help                   Show this help\n`;

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help') return { help: true };
    if (!['--snapshot', '--assets-manifest', '--assets-root', '--base-url', '--journal'].includes(key) && key !== '--verify-media') throw Error(`unknown option: ${key}`);
    if (key === '--verify-media') { args.verifyMedia = true; continue; }
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error(`missing value for ${key}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[name] = argv[++i];
  }
  for (const name of ['snapshot', 'assetsManifest', 'assetsRoot', 'baseUrl', 'journal']) if (!args[name]) throw Error(`required option missing: --${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`);
  return args;
}

function loopbackBase(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw Error('base-url must be an http loopback URL');
  return url;
}

function allowedSource(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|%2f|$)/i.test(raw)) return false;
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { return false; }
  if (p.split('/').some(x => x === '.' || x === '..' || x.includes('\\'))) return false;
  if (u.hostname === 'mita.sisihome.org') return /^\/(?:media|brand-icons)\/[^/]+(?:\/[^/]+)*$/.test(p) && !p.startsWith('/media/sell-inquiry/');
  return u.hostname === 'i.ytimg.com' && /^\/vi(?:_webp)?\/[^/]+\/[^/]+\.(?:jpg|jpeg|png|webp)$/.test(p);
}

function parseManifest(bytes) {
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!Array.isArray(data)) throw Error('assets manifest must be an array');
  return data;
}

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function matchingSignature(bytes, type) {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return type === 'video/mp4' && bytes.length >= 8 && bytes.toString('ascii', 4, 8) === 'ftyp';
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, options = {}) {
  let last;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) return response;
      last = Error(`transient HTTP ${response.status}`);
    } catch (error) { last = error; }
    finally { clearTimeout(timer); }
    if (attempt + 1 < MAX_ATTEMPTS) await sleep(150 * (2 ** attempt));
  }
  throw last ?? Error('request failed');
}

async function validateInputs(args, snapshotBytes, manifestRows) {
  const { register } = await import('tsx/esm/api');
  register();
  const { parsePublicSnapshot, publicAssetReferences } = await import('../src/lib/public-source-snapshot.ts');
  const snapshot = parsePublicSnapshot(snapshotBytes);
  const expected = new Set(publicAssetReferences(snapshot));
  const root = await realpath(args.assetsRoot);
  const assets = new Map();
  let total = 0;
  for (const row of manifestRows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'bytes,content_length,content_type,downloaded_at,file,relative_path,roles,sha256,source_url,status') throw Error('asset manifest row has invalid fields');
    if (!allowedSource(row.source_url) || !expected.has(row.source_url)) throw Error(`asset source is not referenced by public snapshot: ${row.source_url}`);
    if (typeof row.relative_path !== 'string' || !row.relative_path || path.isAbsolute(row.relative_path)) throw Error('asset relative_path must be a relative path');
    if (typeof row.file !== 'string' || path.isAbsolute(row.file) || row.file !== row.relative_path) throw Error('asset file must equal relative_path');
    if (!Array.isArray(row.roles) || row.roles.some(x => typeof x !== 'string') || !MIME.has(row.content_type) || row.status !== 200 || row.error !== undefined) throw Error('asset row has invalid role, MIME, status, or error');
    if (!Number.isSafeInteger(row.content_length) || row.content_length <= 0 || row.content_length > MAX_ASSET || row.bytes !== row.content_length || !/^[a-f0-9]{64}$/.test(row.sha256) || typeof row.downloaded_at !== 'string' || !Number.isFinite(Date.parse(row.downloaded_at))) throw Error('asset row has invalid metadata or bounds');
    const lexical = path.resolve(root, row.relative_path);
    if (lexical !== root && !lexical.startsWith(root + path.sep)) throw Error('asset path escapes assets root');
    let cursor = root;
    for (const part of row.relative_path.split(/[\\/]/)) {
      if (!part || part === '.' || part === '..') throw Error('asset path contains traversal');
      cursor = path.join(cursor, part);
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) throw Error('asset path may not contain symlinks');
    }
    const actual = await realpath(lexical);
    if (!actual.startsWith(root + path.sep)) throw Error('asset path resolves outside assets root');
    const bytes = await readFile(actual);
    if (bytes.byteLength !== row.content_length || digest(bytes) !== row.sha256 || !matchingSignature(bytes, row.content_type)) throw Error(`asset bytes/hash/type mismatch: ${row.relative_path}`);
    total += bytes.byteLength;
    if (total > MAX_TOTAL) throw Error('assets exceed 4 GiB total');
    if (assets.has(row.source_url)) throw Error(`duplicate asset source: ${row.source_url}`);
    assets.set(row.source_url, { row, bytes });
  }
  const missing = [...expected].filter(url => !assets.has(url));
  if (missing.length) throw Error(`asset manifest does not cover ${missing.length} public media reference(s)`);
  return { snapshot, assets };
}

async function atomicJournal(file, data) {
  const dir = path.dirname(path.resolve(file));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(tmp, file);
}

async function run(args) {
  const base = loopbackBase(args.baseUrl);
  let token = process.env.MITA_LOCAL_IMPORT_TOKEN;
  if (!token && process.env.MITA_LOCAL_IMPORT_TOKEN_FILE) {
    const tokenFile = process.env.MITA_LOCAL_IMPORT_TOKEN_FILE;
    const st = await lstat(tokenFile);
    if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0) throw Error('token file must be a regular private file with mode 0600');
    token = (await readFile(tokenFile, 'utf8')).trim();
  }
  if (!token) throw Error('MITA_LOCAL_IMPORT_TOKEN environment variable is required');
  const [snapshotBytes, manifestBytes] = await Promise.all([readFile(args.snapshot), readFile(args.assetsManifest)]);
  const { snapshot, assets } = await validateInputs(args, snapshotBytes, parseManifest(manifestBytes));
  const journalPath = path.resolve(args.journal);
  if (journalPath.startsWith(`${process.cwd()}${path.sep}`)) throw Error('journal must be outside the repository');
  let journal = { base_url: base.origin, receipts: [] };
  try {
    const st = await lstat(journalPath);
    if (st.isSymbolicLink() || (st.mode & 0o077) !== 0) throw Error('journal must be a regular private file with mode 0600');
    journal = JSON.parse(await readFile(journalPath, 'utf8'));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (journal.base_url !== base.origin || !Array.isArray(journal.receipts)) throw Error('journal target profile does not match loopback base-url');
  const bySource = new Map(journal.receipts.map(receipt => [receipt.source_url, receipt]));
  const receipts = [];
  const reused = [];
  const uploaded = [];
  const queue = [...assets.entries()];
  let cursor = 0;
  let journalWrite = Promise.resolve();
  const worker = async () => {
    while (cursor < queue.length) {
      const [sourceUrl, { row, bytes }] = queue[cursor++];
      const prior = bySource.get(sourceUrl);
      if (prior && prior.sha256 === row.sha256 && prior.bytes === row.bytes && prior.content_type === row.content_type) {
        const signedTarget = new URL(prior.target_url);
        if (signedTarget.pathname !== `/media/vehicle/${row.sha256}.${({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4' })[row.content_type]}`) throw Error('journal receipt target path does not match immutable media identity');
        const localTarget = new URL(signedTarget.pathname, base.origin);
        const head = await request(localTarget, { method: 'HEAD' });
        if (!head.ok || Number(head.headers.get('content-length')) !== row.bytes || (head.headers.get('content-type') || '').split(';')[0] !== row.content_type) throw Error(`journal target object is missing or mismatched: ${sourceUrl}`);
        if (args.verifyMedia) {
          const get = await request(localTarget);
          const stored = new Uint8Array(await get.arrayBuffer());
          if (!get.ok || stored.byteLength !== row.bytes || digest(stored) !== row.sha256) throw Error(`journal target content verification failed: ${sourceUrl}`);
        }
        receipts.push(prior); reused.push(sourceUrl); continue;
      }
      if (prior) throw Error(`journal asset differs from current source capture: ${sourceUrl}`);
      const response = await request(new URL('/api/import/public-media', base), { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': row.content_type, 'content-length': String(row.bytes), 'x-source-url': sourceUrl, 'x-content-sha256': row.sha256 }, body: bytes });
      if (response.status === 401 || response.status === 409) throw Error(`media import rejected with HTTP ${response.status}`);
      if (!response.ok) throw Error(`media import failed with HTTP ${response.status}`);
      const receipt = await response.json();
      if (receipt.source_url !== sourceUrl || receipt.bytes !== row.bytes || receipt.sha256 !== row.sha256 || receipt.content_type !== row.content_type || typeof receipt.target_url !== 'string' || typeof receipt.signature !== 'string') throw Error('media endpoint returned invalid signed receipt');
      receipts.push(receipt); uploaded.push(sourceUrl);
      bySource.set(sourceUrl, receipt);
      journalWrite = journalWrite.then(() => atomicJournal(journalPath, { base_url: base.origin, receipts: [...bySource.values()] }));
      await journalWrite;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length || 1) }, worker));
  await journalWrite;
  const covered = new Set(receipts.map(receipt => receipt.source_url));
  if (covered.size !== assets.size || [...assets.keys()].some(source => !covered.has(source))) throw Error('media receipt coverage does not match validated public references');
  if (args.verifyMedia) for (const [sourceUrl, { row }] of assets) if (!bySource.has(sourceUrl)) throw Error(`media verification lacks receipt: ${sourceUrl}`);
  const snapshotResponse = await request(new URL('/api/import/public-snapshot', base), {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot, media_receipts: receipts }),
  });
  let targetResult = {};
  try { targetResult = await snapshotResponse.json(); } catch { /* summarized below */ }
  const conflicts = snapshotResponse.status === 409 ? [targetResult.error ?? 'public snapshot conflict'] : [];
  const summary = { uploaded, reused, applied: snapshotResponse.ok ? Boolean(targetResult.ok) : false, conflicts, targetHTTP: snapshotResponse.status };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (!snapshotResponse.ok || targetResult.ok !== true) throw Error(`snapshot import failed with HTTP ${snapshotResponse.status}`);
}

async function main() {
  let options;
  try { options = argsOf(process.argv.slice(2)); if (options.help) { process.stdout.write(HELP); return; } await run(options); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }
}
await main();
