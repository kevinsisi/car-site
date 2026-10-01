import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { POST } from '../../src/pages/api/import/public-media.ts';

const token = 'synthetic-preview-import-token';
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture({ enabled = 'true' } = {}) {
  const objects = new Map();
  const calls = [];
  const bucket = {
    async put(key, body, options) {
      calls.push({ key, options });
      if (objects.has(key)) return null;
      const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice();
      objects.set(key, { bytes, size: bytes.byteLength, httpMetadata: options.httpMetadata, customMetadata: options.customMetadata, etag: hash(bytes) });
      return { size: bytes.byteLength, etag: hash(bytes) };
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return { ...stored, body: new Response(stored.bytes).body };
    },
    async delete() {},
  };
  const env = { DB_PREVIEW: {}, MEDIA_PREVIEW: bucket, IMPORT_PREVIEW_TOKEN: token, MITA_PUBLIC_SYNC_ENABLED: enabled };
  const request = (bytes = png, overrides = {}) => new Request('https://preview.example/api/import/public-media', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'image/png',
      'x-source-url': 'https://mita.sisihome.org/media/vehicle/source.png',
      'x-content-sha256': hash(bytes),
      'content-length': String(bytes.byteLength),
      ...overrides,
    },
    body: bytes,
  });
  const post = (req = request(), runtimeEnv = env) => POST({ request: req, locals: { runtime: { env: runtimeEnv } } });
  return { objects, calls, bucket, env, request, post };
}

test('POST uploads immutable public media and reuses the same bytes without a second put', async () => {
  const f = fixture();
  const first = await f.post();
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.source_url, 'https://mita.sisihome.org/media/vehicle/source.png');
  assert.equal(body.target_url, `https://mita.sisihome.org/media/vehicle/${hash(png)}.png`);
  assert.equal(body.sha256, hash(png));
  assert.equal(body.bytes, png.byteLength);
  assert.equal(body.content_type, 'image/png');
  assert.match(body.signature, /^[a-f0-9]{64}$/);
  const second = await f.post();
  assert.equal(second.status, 200);
  assert.equal((await second.json()).target_url, body.target_url);
  assert.equal(f.calls.length, 2);
  assert.equal(f.objects.size, 1);
  assert.deepEqual(f.calls[0].options.httpMetadata, { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' });
  assert.deepEqual(f.calls[0].options.customMetadata, { sha256: hash(png) });
});

test('POST rejects auth and disabled sync before storing', async () => {
  const f = fixture();
  assert.equal((await f.post(f.request(png, { authorization: 'Bearer wrong' }))).status, 401);
  assert.equal((await f.post(f.request(), { ...f.env, MITA_PUBLIC_SYNC_ENABLED: 'false' })).status, 503);
  assert.equal(f.calls.length, 0);
});

test('POST rejects disallowed sources, media types, body signatures, and hashes before put', async () => {
  const f = fixture();
  const invalidSources = [
    'http://mita.sisihome.org/media/a.png',
    'https://user:pass@mita.sisihome.org/media/a.png',
    'https://mita.sisihome.org/media/a.png?token=secret',
    'https://mita.sisihome.org/media/../sell-inquiry/a.png',
    'https://mita.sisihome.org/media/../brand-icons/a.png',
    'https://mita.sisihome.org/media/%2e%2e/brand-icons/a.png',
    'https://mita.sisihome.org/media/sell-inquiry/a.png',
    'https://example.com/media/a.png',
  ];
  for (const source of invalidSources) {
    assert.equal((await f.post(f.request(png, { 'x-source-url': source }))).status, 400);
  }
  assert.equal((await f.post(f.request(png, { 'content-type': 'image/gif' }))).status, 415);
  assert.equal((await f.post(f.request(png, { 'x-content-sha256': '0'.repeat(64) }))).status, 400);
  const wrongMagic = new TextEncoder().encode('not image bytes');
  assert.equal((await f.post(f.request(wrongMagic))).status, 400);
  assert.equal((await f.post(f.request(new Uint8Array()))).status, 400);
  assert.equal(f.calls.length, 0);
});

test('POST rejects over-limit and mismatched declared lengths without writing', async () => {
  const f = fixture();
  assert.equal((await f.post(f.request(png, { 'content-length': String(40 * 1024 * 1024 + 1) }))).status, 413);
  assert.equal((await f.post(f.request(png, { 'content-length': '999' }))).status, 400);
  const oversized = new Uint8Array(40 * 1024 * 1024 + 1);
  assert.equal((await f.post(f.request(oversized))).status, 413);
  assert.equal(f.calls.length, 0);
});

test('POST requires Workers bindings and rejects an incompatible incumbent immutable key', async () => {
  const f = fixture();
  assert.equal((await f.post(f.request(), { MEDIA_PREVIEW: f.env.MEDIA_PREVIEW, IMPORT_PREVIEW_TOKEN: token, MITA_PUBLIC_SYNC_ENABLED: 'true' })).status, 503);
  const collisionKey = `vehicle/${hash(png)}.png`;
  f.objects.set(collisionKey, { bytes: new Uint8Array([1]), size: 1, httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { sha256: 'bad' }, etag: 'bad' });
  assert.equal((await f.post()).status, 409);
  assert.equal(f.objects.get(collisionKey).size, 1);
});
