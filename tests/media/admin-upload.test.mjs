import assert from 'node:assert/strict';
import test from 'node:test';
import { POST, uploadMediaToR2 } from '../../src/pages/api/admin/media.ts';

function makeBucket({ failOnPut } = {}) {
  const puts = [];
  const deletes = [];
  let count = 0;
  return {
    puts,
    deletes,
    async put(key, body, options) {
      count += 1;
      if (count === failOnPut) throw new Error('synthetic R2 put failure');
      puts.push({ key, body, options });
      return { size: body.size, etag: `etag-${count}` };
    },
    async get() { return null; },
    async delete(key) { deletes.push(key); },
  };
}

function syntheticFile(name = 'car.jpg', type = 'image/jpeg', bytes = new Uint8Array([1, 2, 3])) {
  return new File([bytes], name, { type });
}

test('admin route rejects unauthenticated synthetic requests without accessing R2', async () => {
  const bucket = makeBucket();
  const form = new FormData();
  form.append('files', syntheticFile());
  const response = await POST({
    request: new Request('https://example.test/api/admin/media', { method: 'POST', body: form }),
    cookies: { get: () => undefined },
    locals: { runtime: { env: { MEDIA_PREVIEW: bucket } } },
  });

  assert.notEqual(response.status, 200);
  assert.deepEqual(bucket.puts, []);
  assert.deepEqual(bucket.deletes, []);
});

test('R2 upload preserves MIME and returns vehicle media URLs', async () => {
  const bucket = makeBucket();
  const response = await uploadMediaToR2([syntheticFile('side-view.webp', 'image/webp')], bucket);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['ok', 'urls']);
  assert.equal(body.ok, true);
  assert.equal(body.urls.length, 1);
  assert.match(body.urls[0], /^\/media\/vehicle\/.+\.webp$/);
  assert.equal(bucket.puts[0].key, body.urls[0].replace('/media/', ''));
  assert.equal(bucket.puts[0].options.httpMetadata.contentType, 'image/webp');
  assert.equal(bucket.puts[0].body.type, 'image/webp');
  assert.deepEqual(bucket.deletes, []);
});

test('unsupported MIME and files over 12 MiB return 400 without writing those files', async () => {
  const unsupportedBucket = makeBucket();
  const unsupported = await uploadMediaToR2([syntheticFile('image.svg', 'image/svg+xml')], unsupportedBucket);
  assert.equal(unsupported.status, 400);
  assert.deepEqual(unsupportedBucket.puts, []);

  const largeBucket = makeBucket();
  const tooLarge = syntheticFile('large.jpg', 'image/jpeg', new Uint8Array(12 * 1024 * 1024 + 1));
  const largeResponse = await uploadMediaToR2([tooLarge], largeBucket);
  assert.equal(largeResponse.status, 400);
  assert.deepEqual(largeBucket.puts, []);
});

test('a later put failure deletes only objects created by this request', async () => {
  const bucket = makeBucket({ failOnPut: 2 });
  const response = await uploadMediaToR2([syntheticFile('first.jpg'), syntheticFile('second.png', 'image/png')], bucket);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { error: '圖片上傳失敗，請稍後再試' });
  assert.equal(bucket.puts.length, 1);
  assert.deepEqual(bucket.deletes, [bucket.puts[0].key]);
  assert.equal(bucket.deletes.includes('vehicle/pre-existing.jpg'), false);
});

test('Node request without an R2 binding retains the existing auth error shape', async () => {
  const form = new FormData();
  form.append('files', syntheticFile('unsupported.svg', 'image/svg+xml'));
  const response = await POST({
    request: new Request('https://example.test/api/admin/media', { method: 'POST', body: form }),
    cookies: { get: () => undefined },
    locals: { runtime: { env: {} } },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(Object.keys(await response.json()), ['error']);
});
