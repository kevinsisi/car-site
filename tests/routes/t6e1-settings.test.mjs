import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const calls = { analytics: 0, settings: [] };
globalThis.__t6e1SettingsCalls = calls;

const modules = {
  '@/db/d1': `export async function createD1Db(binding) { globalThis.__t6e1SettingsCalls.d1Binding = binding; return { binding }; }`,
  '@/lib/auth': `export async function getAdminOrResponse(_cookies, options) {
    globalThis.__t6e1SettingsCalls.authCount = (globalThis.__t6e1SettingsCalls.authCount ?? 0) + 1;
    globalThis.__t6e1SettingsCalls.authOptions = options;
    if (options?.reject) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    return { id: 'DEMO-admin', username: 'DEMO-user', role: 'superadmin', permissions: 0 };
  }`,
  '@/lib/permissions': `export const PERMISSIONS = { SETTINGS_BASIC: 1, SETTINGS_LAYOUT: 2, SETTINGS_GALLERY: 4, SETTINGS_AI_CHATBOT: 8 }; export function hasPermission() { return false; }`,
  '@/lib/detail-spec-fields': `export const detailSpecFieldOptions = [];`,
  '@/lib/features': `export const FEATURE_DIRECT_CONTACT = 1; export const FEATURE_SELL_INQUIRY = 2; export const FEATURE_SOCIAL_ICONS = 4; export const FEATURE_AI_CHATBOT = 8; export function effectiveFeatureMask(mask) { return mask; } export function hasFeature(mask, feature) { return (mask & feature) !== 0; }`,
  '@/lib/safe-url': `export function sanitizeImageUrl(value) { return value; } export function sanitizePublicHref(value) { return value; }`,
  '@/lib/settings': `export async function getSettings(adapter) {
    globalThis.__t6e1SettingsCalls.getAdapter = adapter;
    return { featureMask: 1023, featureLicenseMask: 1023 };
  }
  export function parseSocialIcons(value) { return value; }
  export async function setSettings(updates, adapter) { globalThis.__t6e1SettingsCalls.settings.push({ updates, adapter }); }
  export function resolveTemplate(value) { return value; }
  export function resolveStyle(value) { return value; }`,
  '@/lib/theme': `export function resolveTemplate(value) { return value; } export function resolveStyle(value) { return value; }`,
  '@/lib/analytics': `globalThis.__t6e1SettingsCalls.analytics++; export function hashIp(ip) { return 'HASH:' + ip; } export async function logAdminActivity(activity) { globalThis.__t6e1SettingsCalls.activity = activity; }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) {
      if (specifier === '@/lib/analytics') calls.analyticsResolved = (calls.analyticsResolved ?? 0) + 1;
      return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { POST } = await import('../../src/pages/api/admin/settings.ts');
const secret = 'DEMO-worker-session-secret';
const binding = { marker: 'DEMO-request-d1' };

function context(body, { runtime = false, env = { DB_PREVIEW: binding, SESSION_SECRET: secret }, reject = false } = {}) {
  return {
    request: new Request('https://preview.example/api/admin/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    cookies: { get: () => undefined },
    locals: { runtime: runtime ? { env: { ...env, reject } } : undefined },
  };
}

test('Worker settings POST uses request D1 and secret for auth and settings, with no analytics persistence', async () => {
  assert.equal(calls.analyticsResolved ?? 0, 0, 'route import must not resolve Node analytics');
  const response = await POST(context({ siteName: 'DEMO-preview-name' }, { runtime: true }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.d1Binding, binding);
  assert.equal(calls.authOptions.db.binding, binding);
  assert.equal(calls.authOptions.sessionSecret, secret);
  assert.equal(calls.getAdapter.binding, binding);
  assert.equal(calls.settings.at(-1).adapter.binding, binding);
  assert.equal(calls.settings.at(-1).updates.siteName, 'DEMO-preview-name');
  assert.equal(calls.analyticsResolved ?? 0, 0);
  assert.equal(calls.analytics, 0);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('Worker settings POST fails closed when either required binding is missing', async () => {
  const authCallCount = calls.authCount ?? 0;
  const noDatabase = await POST(context({}, { runtime: true, env: { SESSION_SECRET: secret } }));
  assert.equal(noDatabase.status, 503);
  const noSecret = await POST(context({}, { runtime: true, env: { DB_PREVIEW: binding } }));
  assert.equal(noSecret.status, 503);
  assert.equal(calls.authCount ?? 0, authCallCount, 'missing bindings must be rejected before auth');
  assert.equal(calls.analyticsResolved ?? 0, 0);
});

test('Node settings POST preserves the default auth/settings path and lazy analytics logging', async () => {
  const response = await POST(context({ siteName: 'DEMO-node-name' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.authOptions.db, undefined);
  assert.equal(calls.authOptions.sessionSecret, undefined);
  assert.equal(calls.getAdapter, undefined);
  assert.equal(calls.settings.at(-1).adapter, undefined);
  assert.equal(calls.analyticsResolved, 1);
  assert.equal(calls.analytics, 1);
});
