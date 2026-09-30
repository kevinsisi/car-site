import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '../../src/pages/media/[...path].ts';

function makeBucket(fixtures, { errorForRange } = {}) {
  const calls = [];
  return {
    calls,
    async get(key, options) {
      calls.push({ key, options });
      if (options?.range && errorForRange) throw errorForRange;
      const fixture = fixtures.get(key);
      if (!fixture) return null;
      let bytes = fixture.bytes;
      let range;
      if (options?.range) {
        let offset;
        let length;
        if ('suffix' in options.range) {
          length = Math.min(options.range.suffix, bytes.byteLength);
          offset = bytes.byteLength - length;
        } else {
          offset = options.range.offset;
          length = Math.max(0, Math.min(options.range.length ?? bytes.byteLength, bytes.byteLength - offset));
        }
        range = { offset, length };
        bytes = bytes.slice(offset, offset + length);
      }
      return {
        body: new Response(bytes).body,
        size: fixture.bytes.byteLength,
        range,
        etag: fixture.etag,
        httpMetadata: { contentType: fixture.contentType },
      };
    },
  };
}

async function get(path, bucket, headers = {}) {
  return GET({
    params: { path },
    request: new Request(`https://example.test/media/${path}`, { headers }),
    locals: { runtime: { env: { MEDIA_PREVIEW: bucket } } },
  });
}

test('public GET returns synthetic media with immutable cache and MIME metadata', async () => {
  const bytes = new TextEncoder().encode('synthetic image');
  const bucket = makeBucket(new Map([['vehicle/photo.webp', { bytes, etag: 'image-etag', contentType: 'image/webp' }]]));

  const response = await get('vehicle/photo.webp', bucket);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('etag'), '"image-etag"');
  assert.equal(await response.text(), 'synthetic image');
  assert.deepEqual(bucket.calls, [{ key: 'vehicle/photo.webp', options: undefined }]);
});

test('public video GET serves closed, open-ended, and suffix single byte ranges', async () => {
  const bytes = new TextEncoder().encode('0123456789');
  const fixture = { bytes, etag: 'video-etag', contentType: 'video/mp4' };
  const cases = [
    { header: 'bytes=2-5', range: { offset: 2, length: 4 }, length: 4, contentRange: 'bytes 2-5/10', expected: bytes.slice(2, 6) },
    { header: 'bytes=2-', range: { offset: 2 }, length: 8, contentRange: 'bytes 2-9/10', expected: bytes.slice(2) },
    { header: 'bytes=-4', range: { suffix: 4 }, length: 4, contentRange: 'bytes 6-9/10', expected: bytes.slice(6) },
  ];

  for (const rangeCase of cases) {
    const bucket = makeBucket(new Map([['sell-inquiry/clip.mp4', fixture]]));
    const response = await get('sell-inquiry/clip.mp4', bucket, { range: rangeCase.header });

    assert.equal(response.status, 206, rangeCase.header);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('content-range'), rangeCase.contentRange);
    assert.equal(response.headers.get('content-length'), String(rangeCase.length));
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), rangeCase.expected);
    assert.deepEqual(bucket.calls, [
      { key: 'sell-inquiry/clip.mp4', options: { range: rangeCase.range } },
    ]);
  }
});

test('unsatisfiable video range falls back to one full-object GET', async () => {
  const bytes = new TextEncoder().encode('complete video');
  const bucket = makeBucket(
    new Map([['sell-inquiry/clip.mp4', { bytes, etag: 'video-etag', contentType: 'video/mp4' }]]),
    { errorForRange: new Error('InvalidRange: the requested range is not satisfiable (10039)') },
  );

  const response = await get('sell-inquiry/clip.mp4', bucket, { range: 'bytes=999-' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('content-length'), String(bytes.byteLength));
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(response.headers.get('etag'), '"video-etag"');
  assert.equal(response.headers.get('content-range'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.deepEqual(bucket.calls, [
    { key: 'sell-inquiry/clip.mp4', options: { range: { offset: 999 } } },
    { key: 'sell-inquiry/clip.mp4', options: undefined },
  ]);
});

test('unrelated ranged storage errors propagate without fallback', async () => {
  const error = new Error('InvalidRange: the requested range is not satisfiable (10040)');
  const bucket = makeBucket(new Map(), { errorForRange: error });

  await assert.rejects(get('sell-inquiry/clip.mp4', bucket, { range: 'bytes=2-' }), (caught) => caught === error);
  assert.deepEqual(bucket.calls, [
    { key: 'sell-inquiry/clip.mp4', options: { range: { offset: 2 } } },
  ]);
});

test('malformed and multi-range video requests each use one un-ranged GET', async () => {
  const bytes = new TextEncoder().encode('0123456789');
  for (const range of ['bytes=invalid', 'bytes=0-1,4-5']) {
    const bucket = makeBucket(new Map([['sell-inquiry/clip.mp4', { bytes, etag: 'video-etag', contentType: 'video/mp4' }]]));
    const response = await get('sell-inquiry/clip.mp4', bucket, { range });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-length'), String(bytes.byteLength));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    assert.deepEqual(bucket.calls, [{ key: 'sell-inquiry/clip.mp4', options: undefined }]);
  }
});

test('traversal and non-allowlisted extensions are rejected before bucket access', async () => {
  const bucket = makeBucket(new Map());

  assert.equal((await get('../secret.webp', bucket)).status, 404);
  assert.equal((await get('vehicle/file.svg', bucket)).status, 404);
  assert.equal(bucket.calls.length, 0);
});

test('missing media remains a public 404', async () => {
  assert.equal((await get('vehicle/missing.jpg', makeBucket(new Map()))).status, 404);
});
