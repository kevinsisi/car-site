import assert from 'node:assert/strict';
import test from 'node:test';
import { handleSellInquiry } from '../../src/pages/api/sell.ts';

function request({ contactInfo = 'synthetic-contact@example.invalid', contactName = 'Synthetic Seller' } = {}) {
  const form = new FormData();
  form.set('contactInfo', contactInfo);
  form.set('contactName', contactName);
  form.set('brand', 'Synthetic Brand');
  form.set('model', 'Synthetic Model');
  return new Request('https://synthetic.test/api/sell', { method: 'POST', body: form });
}

function dependencies(overrides = {}) {
  return {
    async getSettings() {
      return { featureLicenseMask: 2, featureMask: 2, notificationEmail: '', gmailUser: '', gmailAppPassword: '' };
    },
    async createSellInquiry() {},
    async sendNotification() {},
    now: () => 1_000,
    ...overrides,
  };
}

function worker(enabled, { allowAttempt = true } = {}) {
  return {
    env: {
      DB_PREVIEW: {
        prepare() {
          return {
            bind() { return this; },
            async first() { return null; },
            async all() { return { results: [] }; },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
        async batch() { return [{}, { results: allowAttempt ? [{ limiter_key: 'synthetic-ip' }] : [] }]; },
      },
      ...(enabled ? { MITA_PUBLIC_SYNC_ENABLED: 'true' } : {}),
    },
  };
}

test('enabled Worker accepts an ordinary synthetic seller inquiry and persists it', async () => {
  const inserts = [];
  const deps = dependencies({ async createSellInquiry(input, adapter) { inserts.push({ input, adapter }); return 'synthetic-inquiry-id'; } });
  const response = await handleSellInquiry({ request: request(), locals: { runtime: worker(true) } }, deps);

  assert.equal(response.status, 200);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].input.contactInfo, 'synthetic-contact@example.invalid');
  assert.equal(inserts[0].input.contactName, 'Synthetic Seller');
  assert.ok(inserts[0].adapter);
  assert.equal(deps.notifications, undefined);
});

test('default preview still rejects non-DEMO contacts before persistence', async () => {
  let writes = 0;
  const response = await handleSellInquiry({ request: request(), locals: { runtime: worker(false) } }, dependencies({ async createSellInquiry() { writes += 1; } }));
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
});

test('enabled Worker still rejects invalid contact data', async () => {
  let writes = 0;
  const response = await handleSellInquiry(
    { request: request({ contactInfo: ' ', contactName: 'Synthetic Seller' }), locals: { runtime: worker(true) } },
    dependencies({ async createSellInquiry() { writes += 1; } }),
  );
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
});

test('enabled Worker still rate limits before inquiry persistence', async () => {
  let writes = 0;
  const response = await handleSellInquiry(
    { request: request(), locals: { runtime: worker(true, { allowAttempt: false }) } },
    dependencies({ async createSellInquiry() { writes += 1; } }),
  );
  assert.equal(response.status, 429);
  assert.equal(writes, 0);
});
