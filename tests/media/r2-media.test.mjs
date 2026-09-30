import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteMedia, getMedia, mediaKey, putMedia } from '../../src/lib/r2-media.ts';

function createBucket() {
  const objects = new Map();
  const calls = [];
  return {
    calls,
    async put(key, body, options) {
      calls.push({ method: 'put', key, options });
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      const object = {
        body: new Response(bytes).body,
        size: typeof body === 'string' ? new TextEncoder().encode(body).byteLength : body.byteLength,
        etag: `etag-${key}`,
        httpMetadata: options.httpMetadata,
        customMetadata: options.customMetadata,
      };
      objects.set(key, object);
      return object;
    },
    async get(key, options) {
      calls.push({ method: 'get', key, options });
      const object = objects.get(key);
      if (!object || !options?.range) return object ?? null;
      const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
      let offset;
      let length;
      if ('suffix' in options.range) {
        length = Math.min(options.range.suffix, bytes.length);
        offset = bytes.length - length;
      } else {
        offset = options.range.offset;
        length = Math.max(0, Math.min(options.range.length ?? bytes.length, bytes.length - offset));
      }
      return { ...object, body: new Response(bytes.slice(offset, offset + length)).body, range: { offset, length } };
    },
    async delete(key) {
      calls.push({ method: 'delete', key });
      objects.delete(key);
    },
  };
}

test('media keys have isolated category prefixes', () => {
  assert.equal(mediaKey('vehicle', 'image-1'), 'vehicle/image-1');
  assert.equal(mediaKey('sell-inquiry', 'image-1'), 'sell-inquiry/image-1');
  assert.throws(() => mediaKey('vehicle', '../image-1'), TypeError);
});

test('put and get preserve content type and metadata and return object details', async () => {
  const bucket = createBucket();
  const body = new TextEncoder().encode('synthetic image').buffer;
  const stored = await putMedia(bucket, 'vehicle', 'image-1', body, {
    contentType: 'image/webp',
    customMetadata: { source: 'fixture' },
  });

  assert.deepEqual(stored, { key: 'vehicle/image-1', size: body.byteLength, etag: 'etag-vehicle/image-1' });
  assert.deepEqual(bucket.calls[0].options, {
    httpMetadata: { contentType: 'image/webp' },
    customMetadata: { source: 'fixture' },
  });

  const media = await getMedia(bucket, 'vehicle', 'image-1');
  assert.equal(media.key, 'vehicle/image-1');
  assert.equal(media.contentType, 'image/webp');
  assert.equal(media.size, body.byteLength);
  assert.equal(media.etag, 'etag-vehicle/image-1');
  assert.deepEqual(media.customMetadata, { source: 'fixture' });
  assert.equal(await new Response(media.body).text(), 'synthetic image');
  assert.equal(await getMedia(bucket, 'sell-inquiry', 'image-1'), null);
});

test('get forwards an optional byte range and preserves R2 metadata and body', async () => {
  const bucket = createBucket();
  const body = new TextEncoder().encode('synthetic video bytes').buffer;
  await putMedia(bucket, 'vehicle', 'video-1', body, {
    contentType: 'video/mp4',
    customMetadata: { source: 'fixture' },
  });
  const range = { offset: 2, length: 5 };

  const media = await getMedia(bucket, 'vehicle', 'video-1', { range });

  assert.deepEqual(bucket.calls.find((call) => call.method === 'get'), {
    method: 'get', key: 'vehicle/video-1', options: { range },
  });
  assert.equal(media.size, body.byteLength);
  assert.equal(media.etag, 'etag-vehicle/video-1');
  assert.equal(media.contentType, 'video/mp4');
  assert.deepEqual(media.customMetadata, { source: 'fixture' });
  assert.deepEqual(media.range, { offset: 2, length: 5 });
  assert.equal(await new Response(media.body).text(), 'nthet');
});

test('delete uses the exact category-prefixed key without deleting another category', async () => {
  const bucket = createBucket();
  for (const category of ['vehicle', 'sell-inquiry']) {
    await putMedia(bucket, category, 'same-id', category, { contentType: 'image/webp' });
  }

  await deleteMedia(bucket, 'vehicle', 'same-id');

  assert.deepEqual(bucket.calls.at(-1), { method: 'delete', key: 'vehicle/same-id' });
  assert.equal(await getMedia(bucket, 'vehicle', 'same-id'), null);
  assert.equal(await new Response((await getMedia(bucket, 'sell-inquiry', 'same-id')).body).text(), 'sell-inquiry');
});

test('put rejects missing content type and missing R2 metadata result', async () => {
  const bucket = createBucket();
  await assert.rejects(putMedia(bucket, 'vehicle', 'id', 'body', { contentType: '  ' }), TypeError);
  await assert.rejects(
    putMedia({ put: async () => null, get: async () => null, delete: async () => {} }, 'vehicle', 'id', 'body', { contentType: 'image/png' }),
    /did not return stored object metadata/,
  );
});
