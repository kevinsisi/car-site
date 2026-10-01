import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { auth: null, calls: 0, dbBindings: [] };
globalThis.__t6h2 = state;

const modules = {
  '@/db/d1': `export async function createD1Db(binding) { globalThis.__t6h2.dbBindings.push(binding); return { binding }; }`,
  '@/lib/auth': `export async function getAdminOrResponse(cookies, options) { globalThis.__t6h2.calls++; if (Object.keys(options ?? {}).length && (!options.db || !options.sessionSecret)) throw new Error('request-scoped auth missing'); return globalThis.__t6h2.auth ?? new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }); }`,
  '@/lib/opencode-settings': `export async function getOpenCodeStatus() { globalThis.__t6h2.calls++; return { servers: [{ id: 'node-server', label: 'Node server', baseUrl: 'http://node.example' }], serversSource: 'setting', envUrl: '', textModel: 'node/model', textModelSource: 'setting', visionModel: 'node/vision', visionModelSource: 'setting', textVariant: 'high', textVariantSource: 'setting', visionVariant: 'medium', visionVariantSource: 'setting' }; }
    export async function listOpenCodeModels() { globalThis.__t6h2.calls++; return { models: [{ id: 'node/model', name: 'Node model', provider: 'node' }], sourceServerId: 'node-server', warning: null }; }
    export async function setOpenCodeServers() { globalThis.__t6h2.calls++; }
    export async function setOpenCodeTextModel() { globalThis.__t6h2.calls++; }
    export async function setOpenCodeVisionModel() { globalThis.__t6h2.calls++; }
    export async function setOpenCodeTextVariant() { globalThis.__t6h2.calls++; }
    export async function setOpenCodeVisionVariant() { globalThis.__t6h2.calls++; }
    export async function clearOpenCodeSettings() { globalThis.__t6h2.calls++; }
    export const OPENCODE_VARIANTS = ['default', 'medium', 'high'];`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const [settings, models] = await Promise.all([
  import('../../src/pages/api/admin/settings/opencode.ts'),
  import('../../src/pages/api/admin/settings/opencode/models.ts'),
]);
const binding = { marker: 'synthetic-preview-binding' };
const secretMarkers = ['https://private-provider.invalid', 'private-password-marker', 'private-api-key-marker', 'preview-session-secret-marker'];

function context({ bindings = true, user = null } = {}) {
  state.auth = user;
  state.calls = 0;
  state.dbBindings = [];
  return {
    cookies: { get: () => ({ value: 'synthetic-session' }) },
    locals: { runtime: { env: bindings ? { DB_PREVIEW: binding, SESSION_SECRET: secretMarkers[3] } : {} } },
    request: new Request('https://preview.example/api/admin/settings/opencode'),
  };
}

const superadmin = { id: 'synthetic-admin', username: 'synthetic-user', role: 'superadmin', permissions: 0 };
const regularUser = { ...superadmin, role: 'admin' };

test('Worker GET status and models authenticate against request D1 and return secret-free stubs without provider calls', async () => {
  const ctx = context({ user: superadmin });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (...args) => { fetchCalls++; return originalFetch(...args); };
  let status;
  try {
    const statusResponse = await settings.GET(ctx);
    assert.equal(statusResponse.status, 200);
    status = await statusResponse.json();
    assert.deepEqual(status.openCode.servers, []);
    assert.equal(status.openCode.envUrl, '');
    const modelsResponse = await models.GET(ctx);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), { models: [], sourceServerId: null, warning: null });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const serialized = JSON.stringify([status, await (async () => ({ models: [], sourceServerId: null, warning: null }))()]);
  for (const marker of secretMarkers) assert.equal(serialized.includes(marker), false);
  assert.equal(state.calls, 2);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(state.dbBindings, [binding, binding]);
});

test('Worker paths fail closed for missing bindings and unauthorized users', async () => {
  for (const handler of [settings.GET, settings.PUT, settings.DELETE, models.GET]) {
    const missing = await handler(context({ bindings: false, user: superadmin }));
    assert.equal(missing.status, 503);
    const denied = await handler(context({ user: null }));
    assert.equal(denied.status, 401);
    const forbidden = await handler(context({ user: regularUser }));
    assert.equal(forbidden.status, 403);
  }
});

test('Worker PUT and DELETE explicitly reject before persistence or provider access', async () => {
  const putContext = context({ user: superadmin });
  putContext.request = new Request('https://preview.example/api/admin/settings/opencode', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ servers: [{ baseUrl: secretMarkers[0] }], password: secretMarkers[1], apiKey: secretMarkers[2] }),
  });
  const put = await settings.PUT(putContext);
  assert.equal(put.status, 403);
  const putJson = await put.json();
  assert.equal(putJson.error, 'OpenCode settings are disabled in preview');
  const deletion = await settings.DELETE(context({ user: superadmin }));
  assert.equal(deletion.status, 403);
  assert.equal((await deletion.json()).error, 'OpenCode settings are disabled in preview');
  assert.equal(state.calls, 1);
  for (const marker of secretMarkers) assert.equal(JSON.stringify(putJson).includes(marker), false);
});

test('Node GET routes retain their existing response shapes and values', async () => {
  state.auth = superadmin;
  state.calls = 0;
  const locals = { runtime: undefined };
  const statusResponse = await settings.GET({ cookies: {}, locals });
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).openCode.textModel, 'node/model');
  const modelsResponse = await models.GET({ cookies: {}, locals });
  assert.equal(modelsResponse.status, 200);
  assert.deepEqual(await modelsResponse.json(), { models: [{ id: 'node/model', name: 'Node model', provider: 'node' }], sourceServerId: 'node-server', warning: null });
  assert.equal(state.calls, 4);
});
