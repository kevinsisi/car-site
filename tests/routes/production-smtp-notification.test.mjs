import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { handleSellInquiry } from '../../src/pages/api/sell.ts';
import { createWorkerNotification } from '../../src/lib/worker-notification.ts';

function binding() {
  return {
    prepare() {
      return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true }; } };
    },
    async batch() { return [{}, { results: [{ limiter_key: 'synthetic-ip' }] }]; },
  };
}

function request() {
  const form = new FormData();
  form.set('contactInfo', 'Synthetic contact');
  form.set('contactName', 'Synthetic seller');
  form.set('brand', 'Synthetic brand');
  form.set('model', 'Synthetic model');
  form.set('year', '2020');
  form.set('mileage', '12345');
  form.set('exteriorColor', 'Synthetic color');
  form.set('notes', 'Synthetic condition');
  return new Request('https://synthetic.test/api/sell', { method: 'POST', body: form });
}

const smtpSettings = {
  featureLicenseMask: 2,
  featureMask: 2,
  notificationEmail: 'synthetic-recipient@example.invalid',
  gmailUser: 'synthetic-sender@example.invalid',
  gmailAppPassword: 'SYNTHETIC-SECRET',
};

function deps(overrides = {}) {
  const calls = { inserted: [], sent: [] };
  return {
    calls,
    getSettings: async () => smtpSettings,
    async createSellInquiry(input, adapter) { calls.inserted.push({ input, adapter }); return 'synthetic-id'; },
    async sendNotification(settings, values) { calls.sent.push({ settings, values }); },
    ...overrides,
  };
}

function worker({ enabled = true } = {}) {
  return { env: { MITA_ENV: enabled ? 'production' : 'preview', MITA_PUBLIC_SYNC_ENABLED: enabled ? 'true' : undefined, DB_PREVIEW: binding() } };
}

test('production Worker persists to D1 then invokes notification using private settings and exact inquiry fields', async () => {
  const dependencies = deps();
  const response = await handleSellInquiry({ request: request(), locals: { runtime: worker() } }, dependencies);
  assert.equal(response.status, 200);
  const responseText = await response.text();
  assert.deepEqual(JSON.parse(responseText), { success: true });
  assert.equal(responseText.includes('SYNTHETIC-SECRET'), false);
  assert.equal(dependencies.calls.inserted.length, 1);
  assert.ok(dependencies.calls.inserted[0].adapter);
  assert.equal(dependencies.calls.sent.length, 1);
  assert.equal(dependencies.calls.sent[0].settings.gmailAppPassword, 'SYNTHETIC-SECRET');
  assert.deepEqual(dependencies.calls.sent[0].values, {
    brand: 'Synthetic brand', model: 'Synthetic model', year: 2020, mileage: 12345,
    exteriorColor: 'Synthetic color', notes: 'Synthetic condition', contactInfo: 'Synthetic contact',
    contactName: 'Synthetic seller', photoCount: 0,
  });
});

test('production accepts authenticated private SMTP setting writes while preview rejects them', async () => {
  const writes = [];
  globalThis.__smtpSettingsWrites = writes;
  const modules = {
    '@/db/d1': `export async function createD1Db(binding) { return { binding }; }`,
    '@/lib/auth': `export async function getAdminOrResponse() { return { id: 'synthetic-admin', username: 'synthetic', role: 'superadmin', permissions: 0 }; }`,
    '@/lib/permissions': `export const PERMISSIONS = { SETTINGS_BASIC: 128, SETTINGS_LAYOUT: 256, SETTINGS_GALLERY: 512, SETTINGS_AI_CHATBOT: 1024 }; export function hasPermission() { return false; }`,
    '@/lib/detail-spec-fields': `export const detailSpecFieldOptions = [];`,
    '@/lib/features': `export const FEATURE_DIRECT_CONTACT = 32; export const FEATURE_SELL_INQUIRY = 2; export const FEATURE_SOCIAL_ICONS = 16; export const FEATURE_AI_CHATBOT = 512; export function effectiveFeatureMask(a, b) { return a & b; } export function hasFeature(mask, bit) { return (mask & bit) !== 0; }`,
    '@/lib/safe-url': `export function sanitizeImageUrl(value) { return value; } export function sanitizePublicHref(value) { return value; }`,
    '@/lib/settings': `export async function getSettings() { return { featureMask: 1023, featureLicenseMask: 1023 }; } export function parseSocialIcons(value) { return value; } export async function setSettings(updates, adapter) { globalThis.__smtpSettingsWrites.push({ updates, adapter }); }`,
    '@/lib/theme': `export function resolveTemplate(value) { return value; } export function resolveStyle(value) { return value; }`,
    '@/lib/analytics': `export function hashIp(value) { return value; } export async function logAdminActivity() {}`, 
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
  const { POST } = await import('../../src/pages/api/admin/settings.ts');
  const post = (env) => POST({
    request: new Request('https://synthetic.test/api/admin/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notificationEmail: 'synthetic-recipient@example.invalid', gmailUser: 'synthetic-sender@example.invalid', gmailAppPassword: 'SYNTHETIC-SECRET' }) }),
    cookies: { get: () => undefined },
    locals: { runtime: { env: { DB_PREVIEW: binding(), SESSION_SECRET: 'synthetic-session', ...env } } },
  });
  const preview = await post({ MITA_ENV: 'preview' });
  assert.equal(preview.status, 400);
  assert.equal(writes.length, 0);
  const production = await post({ MITA_ENV: 'production', MITA_PUBLIC_SYNC_ENABLED: 'true' });
  assert.equal(production.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].updates.gmailAppPassword, 'SYNTHETIC-SECRET');
  assert.ok(writes[0].adapter);
});

test('production Worker notification missing configuration and transport failure remain best-effort', async () => {
  const missing = await createWorkerNotification({ ...smtpSettings, gmailAppPassword: '' }, { brand: 'B', model: 'M', year: null, mileage: null, exteriorColor: '', notes: '', contactInfo: 'C', contactName: 'N', photoCount: 0 }, async () => { throw new Error('must not send'); });
  assert.deepEqual(missing, { outcome: 'unconfigured' });

  const failed = await createWorkerNotification(smtpSettings, { brand: 'B', model: 'M', year: null, mileage: null, exteriorColor: '', notes: '', contactInfo: 'C', contactName: 'N', photoCount: 0 }, async () => { throw new Error('synthetic transport failure'); });
  assert.deepEqual(failed, { outcome: 'failed' });
});

test('preview Worker continues to skip notification', async () => {
  const dependencies = deps();
  const response = await handleSellInquiry({ request: request(), locals: { runtime: worker({ enabled: false }) } }, dependencies);
  assert.equal(response.status, 400, 'default preview continues to enforce DEMO contact data');
  assert.equal(dependencies.calls.sent.length, 0);
});

test('notification transport uses Gmail implicit TLS, selected recipient and existing message body', async () => {
  let transportOptions;
  let mail;
  const result = await createWorkerNotification(smtpSettings, {
    brand: 'Synthetic brand', model: 'Synthetic model', year: 2020, mileage: 12345,
    exteriorColor: 'Synthetic color', notes: 'Synthetic condition', contactInfo: 'Synthetic contact',
    contactName: 'Synthetic seller', photoCount: 2,
  }, async (options, message) => { transportOptions = options; mail = message; });
  assert.deepEqual(result, { outcome: 'sent' });
  assert.equal(transportOptions.host, 'smtp.gmail.com');
  assert.equal(transportOptions.port, 465);
  assert.equal(transportOptions.secure, true);
  assert.equal(transportOptions.auth.user, smtpSettings.gmailUser);
  assert.equal(transportOptions.auth.pass, smtpSettings.gmailAppPassword);
  assert.equal(transportOptions.tls.rejectUnauthorized, true);
  assert.equal(transportOptions.connectionTimeout, 10_000);
  assert.equal(transportOptions.greetingTimeout, 10_000);
  assert.equal(transportOptions.socketTimeout, 15_000);
  assert.equal(mail.to, smtpSettings.notificationEmail);
  assert.equal(mail.subject, '新賣車申請：Synthetic brand Synthetic model 2020');
  assert.equal(mail.from, `"賣車通知" <${smtpSettings.gmailUser}>`);
  assert.match(mail.text, /姓名：Synthetic seller\n聯絡方式：Synthetic contact/);
  assert.match(mail.text, /附件照片：2 張/);
  assert.equal(JSON.stringify(mail).includes(smtpSettings.gmailAppPassword), false);
});
