import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Database from 'better-sqlite3';
import { handleSellInquiry } from '../../src/pages/api/sell.ts';

function syntheticD1() {
  const sqlite = new Database(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/d1/0002_shared_rate_limits.sql', import.meta.url), 'utf8'));
  const convert = (query) => {
    const statement = { query, args: [] };
    return Object.assign(statement, {
      bind(...values) { statement.args = values; return statement; },
      async first() { return sqlite.prepare(query).get(...statement.args) ?? null; },
      async all() { return { results: sqlite.prepare(query).all(...statement.args) }; },
      async run() {
        const result = sqlite.prepare(query).run(...statement.args);
        return { success: true, meta: { changes: result.changes } };
      },
    });
  };
  return {
    sqlite,
    prepare: convert,
    async batch(statements) {
      const transaction = sqlite.transaction(() => statements.map((statement) => {
        const query = statement.query;
        const prepared = sqlite.prepare(query);
        if (query.includes('RETURNING')) {
          const results = prepared.all(...statement.args);
          return { success: true, results, meta: { changes: results.length } };
        }
        const result = prepared.run(...statement.args);
        return { success: true, meta: { changes: result.changes } };
      }));
      return transaction();
    },
  };
}

function makeBucket({ failOnPut } = {}) {
  const puts = [];
  const deletes = [];
  let calls = 0;
  return {
    puts,
    deletes,
    async put(key, body, options) {
      calls += 1;
      if (calls === failOnPut) throw new Error('synthetic R2 put failure');
      puts.push({ key, body, options });
      return { size: body.size, etag: `etag-${calls}` };
    },
    async get() { return null; },
    async delete(key) { deletes.push(key); },
  };
}

function syntheticFile(name = 'photo.jpg', type = 'image/jpeg', bytes = new Uint8Array([1, 2, 3])) {
  return new File([bytes], name, { type });
}

function makeForm({ photos = [], contactInfo = 'DEMO-contact' } = {}) {
  const form = new FormData();
  form.set('contactInfo', contactInfo);
  form.set('contactName', 'DEMO-name');
  for (const photo of photos) form.append('photos', photo);
  return form;
}

function setup({ form = makeForm(), bucket, db = syntheticD1(), featureEnabled = true, createError } = {}) {
  const inquiries = [];
  const notifications = [];
  const request = new Request('https://example.test/api/sell', {
    method: 'POST',
    headers: { 'x-forwarded-for': `synthetic-${crypto.randomUUID()}` },
    body: form,
  });
  const dependencies = {
    getSettings: async () => ({
      featureLicenseMask: featureEnabled ? 2 : 0,
      featureMask: 2,
      notificationEmail: '',
      gmailUser: '',
      gmailAppPassword: '',
    }),
    createSellInquiry: async (input) => {
      inquiries.push(input);
      if (createError) throw createError;
      return 'synthetic-id';
    },
    sendNotification: async (_settings, values) => notifications.push(values),
    now: () => 123456,
  };
  return {
    inquiries,
    notifications,
    response: handleSellInquiry({ request, locals: { runtime: { env: { DB_PREVIEW: db, ...(bucket ? { MEDIA_PREVIEW: bucket } : {}) } } } }, dependencies),
  };
}

test('request validation, rate limit, and feature guard reject before R2 writes', async () => {
  const invalidBucket = makeBucket();
  const invalid = setup({ form: makeForm({ contactInfo: '' }), bucket: invalidBucket });
  assert.equal((await invalid.response).status, 400);
  assert.deepEqual(invalidBucket.puts, []);

  const featureBucket = makeBucket();
  const disabled = setup({ bucket: featureBucket, featureEnabled: false });
  assert.equal((await disabled.response).status, 403);
  assert.deepEqual(featureBucket.puts, []);

  const limitedBucket = makeBucket();
  const ip = `rate-limit-synthetic-${crypto.randomUUID()}`;
  const dependencies = {
    getSettings: async () => ({ featureLicenseMask: 2, featureMask: 2 }),
    createSellInquiry: async () => 'synthetic-id',
    sendNotification: async () => {},
  };
  const db = syntheticD1();
  for (let index = 0; index < 6; index += 1) {
    const request = new Request('https://example.test/api/sell', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
      body: makeForm({ photos: index === 5 ? [syntheticFile()] : [] }),
    });
    const response = await handleSellInquiry({
      request,
      locals: { runtime: { env: { DB_PREVIEW: db, MEDIA_PREVIEW: limitedBucket } } },
    }, dependencies);
    assert.equal(response.status, index < 5 ? 200 : 429);
  }
  assert.deepEqual(limitedBucket.puts, []);
});

test('R2 preview accepts only image MIME allowlist and files up to 12 MiB', async () => {
  for (const [file, expectedStatus] of [
    [syntheticFile('vector.svg', 'image/svg+xml'), 400],
    [syntheticFile('large.jpg', 'image/jpeg', new Uint8Array(12 * 1024 * 1024 + 1)), 400],
    [syntheticFile('ok.gif', 'image/gif'), 200],
  ]) {
    const bucket = makeBucket();
    const result = setup({ form: makeForm({ photos: [file] }), bucket });
    const response = await result.response;
    assert.equal(response.status, expectedStatus);
    if (expectedStatus === 400) assert.deepEqual(bucket.puts, []);
    else {
      assert.equal(bucket.puts[0].key, result.inquiries[0].photoUrls[0].slice('/media/'.length));
      assert.equal(bucket.puts[0].options.httpMetadata.contentType, 'image/gif');
      assert.match(result.inquiries[0].photoUrls[0], /^\/media\/sell-inquiry\/.+\.gif$/);
    }
  }
});

test('route uploads at most ten photos and second put failure deletes only this request objects', async () => {
  const bucket = makeBucket({ failOnPut: 2 });
  const result = setup({ form: makeForm({ photos: [syntheticFile('one.jpg'), syntheticFile('two.png', 'image/png')] }), bucket });
  assert.equal((await result.response).status, 500);
  assert.equal(bucket.puts.length, 1);
  assert.deepEqual(bucket.deletes, [bucket.puts[0].key]);
  assert.deepEqual(result.inquiries, []);
  assert.deepEqual(result.notifications, []);

  const manyBucket = makeBucket();
  const many = setup({ form: makeForm({ photos: Array.from({ length: 11 }, (_, index) => syntheticFile(`${index}.jpg`)) }), bucket: manyBucket });
  assert.equal((await many.response).status, 200);
  assert.equal(manyBucket.puts.length, 10);
  assert.equal(many.inquiries[0].photoUrls.length, 10);
});

test('repository failure removes created R2 objects and never sends notification', async () => {
  const bucket = makeBucket();
  const result = setup({ form: makeForm({ photos: [syntheticFile()] }), bucket, createError: new Error('synthetic repository failure') });
  await assert.rejects(result.response, /synthetic repository failure/);
  assert.equal(bucket.puts.length, 1);
  assert.deepEqual(bucket.deletes, [bucket.puts[0].key]);
  assert.deepEqual(result.notifications, []);
});

test('without MEDIA_PREVIEW binding the Node response remains successful with its existing shape', async () => {
  const inquiries = [];
  const notifications = [];
  const request = new Request('https://example.test/api/sell', { method: 'POST', body: makeForm() });
  const response = await handleSellInquiry({ request }, {
    getSettings: async () => ({ featureLicenseMask: 2, featureMask: 2, notificationEmail: '', gmailUser: '', gmailAppPassword: '' }),
    createSellInquiry: async (input) => { inquiries.push(input); return 'synthetic-id'; },
    sendNotification: async (_settings, values) => notifications.push(values),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(inquiries[0].photoUrls, []);
  assert.equal(notifications.length, 1);
});
