import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadMediaToR2 } from '../../src/pages/api/admin/media.ts';
import { deleteMedia, putMedia } from '../../src/lib/r2-media.ts';

function createSyntheticBucket({ failDelete = false } = {}) {
  const objects = new Map();
  const calls = [];
  return {
    objects,
    calls,
    async put(key, body, options) {
      calls.push({ operation: 'put', key });
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(await body.arrayBuffer());
      objects.set(key, { bytes, options });
      return { size: bytes.byteLength, etag: `synthetic-${key}` };
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        body: new Response(stored.bytes).body,
        size: stored.bytes.byteLength,
        etag: `synthetic-${key}`,
        httpMetadata: stored.options.httpMetadata,
      };
    },
    async delete(key) {
      calls.push({ operation: 'delete', key });
      if (failDelete) throw new Error('synthetic delete failure');
      objects.delete(key);
    },
  };
}

function syntheticFile(name = 'reset-fixture.jpg') {
  return new File([new Uint8Array([7, 8, 9])], name, { type: 'image/jpeg' });
}

function keyFromUrl(url) {
  const prefix = '/media/';
  assert.ok(url.startsWith(prefix), `unexpected synthetic media URL: ${url}`);
  return url.slice(prefix.length);
}

async function resetOwnedMedia(bucket, manifest) {
  const evidence = [];
  for (const entry of manifest) {
    const urlKey = keyFromUrl(entry.url);
    if (urlKey !== entry.key) {
      evidence.push({ key: entry.key, status: 'failed', error: `manifest key does not match URL key: ${urlKey}` });
      continue;
    }
    const [category, ...segments] = entry.key.split('/');
    if (category !== 'vehicle' || segments.length !== 1 || !segments[0]) {
      evidence.push({ key: entry.key, status: 'failed', error: 'unsupported synthetic manifest key' });
      continue;
    }
    try {
      await deleteMedia(bucket, 'vehicle', segments[0]);
      evidence.push({ key: entry.key, status: 'deleted' });
    } catch (error) {
      evidence.push({ key: entry.key, status: 'failed', error: error.message });
    }
  }
  return evidence;
}

test('synthetic owned reset removes only route-created media and can be repeated after the later D1 save fails', async () => {
  const bucket = createSyntheticBucket();
  const sentinel = 'vehicle/unrelated-synthetic-sentinel.jpg';
  await putMedia(bucket, 'vehicle', 'unrelated-synthetic-sentinel.jpg', 'sentinel', { contentType: 'image/jpeg' });

  // This is the independent-upload-success / later-D1-save-failure boundary: no URL reference is recorded.
  const response = await uploadMediaToR2([syntheticFile()], bucket);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  const url = result.urls[0];
  const key = keyFromUrl(url);
  const manifest = [{ url, key }];
  assert.equal(bucket.objects.has(key), true);
  assert.equal(bucket.objects.has(sentinel), true);

  assert.deepEqual(await resetOwnedMedia(bucket, manifest), [{ key, status: 'deleted' }]);
  assert.equal(bucket.objects.has(key), false);
  assert.equal(bucket.objects.has(sentinel), true);
  assert.deepEqual(await resetOwnedMedia(bucket, manifest), [{ key, status: 'deleted' }]);
  assert.equal(bucket.objects.has(sentinel), true);
});

test('retrying the route creates a new owned key; manifest URL/key mismatch never deletes either object', async () => {
  const bucket = createSyntheticBucket();
  const firstResponse = await uploadMediaToR2([syntheticFile('retry.jpg')], bucket);
  const retryResponse = await uploadMediaToR2([syntheticFile('retry.jpg')], bucket);
  const firstUrl = (await firstResponse.json()).urls[0];
  const retryUrl = (await retryResponse.json()).urls[0];
  const firstKey = keyFromUrl(firstUrl);
  const retryKey = keyFromUrl(retryUrl);
  assert.notEqual(firstKey, retryKey);

  const evidence = await resetOwnedMedia(bucket, [{ url: firstUrl, key: retryKey }]);
  assert.equal(evidence[0].status, 'failed');
  assert.match(evidence[0].error, /does not match URL key/);
  assert.equal(bucket.objects.has(firstKey), true);
  assert.equal(bucket.objects.has(retryKey), true);
  assert.deepEqual(bucket.calls.filter(({ operation }) => operation === 'delete'), []);

  assert.deepEqual(await resetOwnedMedia(bucket, [{ url: retryUrl, key: retryKey }]), [{ key: retryKey, status: 'deleted' }]);
  assert.equal(bucket.objects.has(retryKey), false);
  assert.equal(bucket.objects.has(firstKey), true);
});

test('delete failure remains explicit in reset evidence and is not reported as success', async () => {
  const bucket = createSyntheticBucket({ failDelete: true });
  const response = await uploadMediaToR2([syntheticFile('delete-failure.jpg')], bucket);
  const url = (await response.json()).urls[0];
  const key = keyFromUrl(url);

  const evidence = await resetOwnedMedia(bucket, [{ url, key }]);
  assert.deepEqual(evidence, [{ key, status: 'failed', error: 'synthetic delete failure' }]);
  assert.equal(bucket.objects.has(key), true);
});
