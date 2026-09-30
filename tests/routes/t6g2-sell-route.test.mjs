import assert from 'node:assert/strict';
import test from 'node:test';
import { handleSellInquiry } from '../../src/pages/api/sell.ts';

function d1Binding() {
  const statements = [];
  const binding = {
    statements,
    prepare(query) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { statements.push({ query, values }); return null; },
        async all() { statements.push({ query, values }); return { results: [] }; },
        async run() { statements.push({ query, values }); return { success: true, meta: { changes: 1 } }; },
      };
    },
    async batch(items) {
      for (const item of items) await item.run();
      return [{}, { results: [{}] }];
    },
  };
  return binding;
}

function request({ photos = [], contactInfo = 'DEMO-contact', contactName = 'DEMO-name' } = {}) {
  const form = new FormData();
  form.set('contactInfo', contactInfo);
  form.set('contactName', contactName);
  for (const photo of photos) form.append('photos', photo);
  return new Request('https://synthetic.test/api/sell', { method: 'POST', body: form });
}

function settings() {
  return { featureLicenseMask: 2, featureMask: 2, notificationEmail: 'synthetic@example.invalid', gmailUser: 'synthetic@example.invalid', gmailAppPassword: 'synthetic-password' };
}

function bucket({ failOnPut = 0 } = {}) {
  let puts = 0;
  const objects = new Set();
  const removed = [];
  return {
    objects,
    removed,
    async put(key, body) { puts += 1; if (puts === failOnPut) throw new Error('put failed'); objects.add(key); return { size: body.size, etag: `synthetic-${puts}` }; },
    async delete(key) { removed.push(key); objects.delete(key); },
  };
}

function image() {
  return new File([new Uint8Array([1, 2, 3])], 'synthetic.jpg', { type: 'image/jpeg' });
}

function dependencies(overrides = {}) {
  const state = { inserts: [], notifications: 0, settings: 0 };
  return {
    state,
    async getSettings() { state.settings += 1; return settings(); },
    async createSellInquiry(input, adapter) { state.inserts.push({ input, adapter }); return 'synthetic-id'; },
    async sendNotification() { state.notifications += 1; },
    now: () => 1000,
    ...overrides,
  };
}

function worker(binding, media) {
  return { env: { ...(binding ? { DB_PREVIEW: binding } : {}), ...(media ? { MEDIA_PREVIEW: media } : {}) } };
}

test('Worker persists with D1 adapter, stores synthetic R2 media, and never sends notification', async () => {
  const db = d1Binding();
  const media = bucket();
  const deps = dependencies();
  const response = await handleSellInquiry({ request: request({ photos: [image()] }), locals: { runtime: worker(db, media) } }, deps);

  assert.equal(response.status, 200);
  assert.equal(deps.state.inserts.length, 1);
  assert.ok(deps.state.inserts[0].adapter);
  assert.match(deps.state.inserts[0].input.contactInfo, /^DEMO-/);
  assert.equal(media.objects.size, 1);
  assert.equal(deps.state.notifications, 0);
});

test('Worker fails closed without DB_PREVIEW and without MEDIA_PREVIEW for photos', async () => {
  const noDb = dependencies();
  assert.equal((await handleSellInquiry({ request: request(), locals: { runtime: worker() } }, noDb)).status, 429);
  assert.equal(noDb.state.inserts.length, 0);

  const noMedia = dependencies();
  assert.equal((await handleSellInquiry({ request: request({ photos: [image()] }), locals: { runtime: worker(d1Binding()) } }, noMedia)).status, 503);
  assert.equal(noMedia.state.inserts.length, 0);
});

test('Worker rejects non-DEMO contact data before any R2 or inquiry write', async () => {
  const media = bucket();
  const deps = dependencies();
  const response = await handleSellInquiry({ request: request({ photos: [image()], contactInfo: 'real-contact' }), locals: { runtime: worker(d1Binding(), media) } }, deps);
  assert.equal(response.status, 400);
  assert.equal(media.objects.size, 0);
  assert.equal(deps.state.inserts.length, 0);
  assert.equal(deps.state.notifications, 0);
});

test('Worker removes R2 objects after a D1 inquiry failure', async () => {
  const media = bucket();
  const deps = dependencies({ async createSellInquiry() { throw new Error('D1 failure'); } });
  await assert.rejects(handleSellInquiry({ request: request({ photos: [image()] }), locals: { runtime: worker(d1Binding(), media) } }, deps), /D1 failure/);
  assert.equal(media.objects.size, 0);
  assert.equal(media.removed.length, 1);
  assert.equal(deps.state.notifications, 0);
});

test('Node path preserves injected persistence and notification behavior', async () => {
  const deps = dependencies();
  const response = await handleSellInquiry({ request: request(), locals: undefined }, deps);
  assert.equal(response.status, 200);
  assert.equal(deps.state.inserts.length, 1);
  assert.equal(deps.state.inserts[0].adapter, undefined);
  assert.equal(deps.state.notifications, 1);
});
