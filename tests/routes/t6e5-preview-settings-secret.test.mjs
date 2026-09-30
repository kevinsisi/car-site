import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const calls = { writes: [] };
globalThis.__t6e5Calls = calls;

const modules = {
  '@/db/d1': `export async function createD1Db(binding) { return { binding }; }`,
  '@/lib/auth': `export async function getAdminOrResponse() { return { id: 'DEMO-admin', username: 'DEMO-user', role: 'superadmin', permissions: 0 }; }`,
  '@/lib/permissions': `export const PERMISSIONS = { SETTINGS_BASIC: 1, SETTINGS_LAYOUT: 2, SETTINGS_GALLERY: 4, SETTINGS_AI_CHATBOT: 8 }; export function hasPermission() { return false; }`,
  '@/lib/detail-spec-fields': `export const detailSpecFieldOptions = [];`,
  '@/lib/features': `export const FEATURE_DIRECT_CONTACT = 1; export const FEATURE_SELL_INQUIRY = 2; export const FEATURE_SOCIAL_ICONS = 4; export const FEATURE_AI_CHATBOT = 8; export function effectiveFeatureMask(mask) { return mask; } export function hasFeature(mask, feature) { return (mask & feature) !== 0; }`,
  '@/lib/safe-url': `export function sanitizeImageUrl(value) { return value; } export function sanitizePublicHref(value) { return value; }`,
  '@/lib/settings': `export async function getSettings() { return { featureMask: 1023, featureLicenseMask: 1023 }; }
    export function parseSocialIcons(value) { return value; }
    export async function setSettings(updates, adapter) { globalThis.__t6e5Calls.writes.push({ updates, adapter }); }
    export function resolveTemplate(value) { return value; }
    export function resolveStyle(value) { return value; }`,
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
const binding = { marker: 'DEMO-preview-d1' };
const markerValues = {
  notificationEmail: 'SMTP-DESTINATION-MUST-NOT-LEAK',
  gmailUser: 'SMTP-USER-MUST-NOT-LEAK',
  gmailAppPassword: 'SMTP-PASSWORD-MUST-NOT-LEAK',
};

function context(body, runtime = true) {
  return {
    request: new Request('https://preview.example/api/admin/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    cookies: { get: () => undefined },
    locals: { runtime: runtime ? { env: { DB_PREVIEW: binding, SESSION_SECRET: 'DEMO-session-secret' } } : undefined },
  };
}

test('Worker settings reject every SMTP field before writing, without reflecting submitted values', async () => {
  for (const [field, value] of Object.entries(markerValues)) {
    const response = await POST(context({ [field]: value }));
    assert.equal(response.status, 400, `${field} must be rejected`);
    const body = await response.json();
    assert.equal(typeof body.error, 'string');
    assert.equal(JSON.stringify(body).includes(value), false);
    assert.equal(calls.writes.length, 0, `${field} must not reach settings persistence`);
  }
});

test('Worker settings still accept ordinary synthetic site setting updates', async () => {
  const response = await POST(context({ siteName: 'DEMO-preview-name' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].updates.siteName, 'DEMO-preview-name');
  assert.equal(calls.writes[0].adapter.binding, binding);
});

test('Node settings retain SMTP settings behavior', async () => {
  const response = await POST(context({ notificationEmail: 'DEMO-node@example.test' }, false));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.writes.at(-1).updates.notificationEmail, 'DEMO-node@example.test');
  assert.equal(calls.writes.at(-1).adapter, undefined);
});
