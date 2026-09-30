import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const calls = { settings: 0, vehicles: 0, openCode: 0 };
globalThis.__t6h1Calls = calls;

const modules = {
  '@/lib/settings': `export async function getSettings() { globalThis.__t6h1Calls.settings += 1; return { featureMask: 1, featureLicenseMask: 1 }; }`,
  '@/lib/features': `export const FEATURE_AI_CHATBOT = 1; export function hasFeature(mask, feature) { return Boolean(mask & feature); } export function effectiveFeatureMask(mask, license) { return mask & license; }`,
  '@/lib/opencode-settings': `export async function getOpenCodeServers() { globalThis.__t6h1Calls.openCode += 1; return []; } export async function getOpenCodeTextModel() {} export async function getOpenCodeTextVariant() {} export async function getOpenCodeVisionModel() {} export async function getOpenCodeVisionVariant() {} export function getOpenCodePassword() { globalThis.__t6h1Calls.openCode += 1; return 'secret-marker'; }`,
  '@/lib/vehicles': `export async function listPublicInventoryVehicles() { globalThis.__t6h1Calls.vehicles += 1; return []; }`,
  '@/lib/vehicle-share': `export function shareOriginFromRequest() { return 'https://example.test'; }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { POST } = await import('../../src/pages/api/chat.ts');

function workerContext() {
  const request = new Request('https://preview.example/api/chat', { method: 'POST', body: '{"message":"private user text","images":[{"data":"private-image"}]}' });
  return { request, locals: { runtime: { env: {} } } };
}

test('Worker chat responds deterministically without reading request/provider data or fetching', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('unexpected provider fetch'); };
  const originalJson = Request.prototype.json;
  let bodyReads = 0;
  Request.prototype.json = async function () { bodyReads += 1; return originalJson.call(this); };
  try {
    const first = await POST(workerContext());
    const second = await POST(workerContext());
    assert.equal(first.status, 503);
    assert.equal(second.status, 503);
    const firstBody = await first.json();
    const secondBody = await second.json();
    assert.deepEqual(firstBody, secondBody);
    assert.deepEqual(firstBody, { error: 'AI 客服在預覽環境中已停用。', previewDisabled: true });
    assert.equal(JSON.stringify(firstBody).includes('secret-marker'), false);
    assert.equal(JSON.stringify(firstBody).includes('private'), false);
    assert.equal(fetchCalls, 0);
    assert.equal(bodyReads, 0);
    assert.deepEqual(calls, { settings: 0, vehicles: 0, openCode: 0 });
  } finally {
    globalThis.fetch = originalFetch;
    Request.prototype.json = originalJson;
  }
});

test('Node route keeps the provider configuration entrance', async () => {
  const response = await POST({
    request: new Request('https://site.example/api/chat', { method: 'POST', body: JSON.stringify({ message: 'hello' }) }),
    locals: {},
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'AI 客服尚未設定，請聯繫管理員。' });
  assert.equal(calls.settings, 1);
  assert.equal(calls.vehicles, 1);
  assert.equal(calls.openCode, 1);
});
