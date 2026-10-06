import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const state = { authResult: {}, fetches: 0, writes: 0, failure: null };
globalThis.__carsmeetInputErrors = state;
const modules = {
  '@/db/d1': 'export async function createD1Db(binding) { return { binding }; }',
  '@/lib/auth': 'export async function getPermittedOrResponse() { return globalThis.__carsmeetInputErrors.authResult; }',
  '@/lib/vehicles': `export async function importVehicle() {
    if (globalThis.__carsmeetInputErrors.failure) throw globalThis.__carsmeetInputErrors.failure;
    globalThis.__carsmeetInputErrors.writes += 1;
    return { vehicleId: 'DEMO-import', status: 'draft' };
  }`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier in modules
      ? { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
const { POST } = await import('../../src/pages/api/admin/vehicles/import-carsmeet.ts');
const html = '<html><head><meta property="og:title" content="2022 BMW M3 Competition"></head><body><h1>2022 BMW M3 Competition</h1><img src="https://carsmeet.tw/wp-content/uploads/DEMO.jpg"></body></html>';
function context(runtime, body) {
  return {
    request: new Request('https://DEMO.example/api/admin/vehicles/import-carsmeet', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }),
    cookies: {},
    locals: runtime === 'Node' ? {} : { runtime: { env: {
      DB_PREVIEW: {}, SESSION_SECRET: 'DEMO-secret', MITA_ENV: 'production', MITA_PUBLIC_SYNC_ENABLED: 'true',
    } } },
  };
}
for (const runtime of ['Node', 'Worker']) {
  test(`${runtime} Carsmeet malformed and non-object JSON is 400 without fetch or persistence`, async () => {
    const original = globalThis.fetch;
    const before = { fetches: state.fetches, writes: state.writes };
    globalThis.fetch = async () => { state.fetches += 1; throw new Error('unexpected fetch'); };
    try {
      for (const body of ['{', '', 'null', '[]', '42', 'true', '"invalid"']) {
        const response = await POST(context(runtime, body));
        assert.equal(response.status, 400, body || 'empty body');
        assert.equal(typeof (await response.json()).error, 'string');
      }
      assert.equal(state.fetches, before.fetches);
      assert.equal(state.writes, before.writes);
    } finally { globalThis.fetch = original; }
  });

  test(`${runtime} Carsmeet authorization remains before body parsing`, async () => {
    for (const status of [401, 403]) {
      state.authResult = new Response('DEMO denied', { status });
      try { assert.equal((await POST(context(runtime, '{'))).status, status); }
      finally { state.authResult = {}; }
    }
  });

  test(`${runtime} valid Carsmeet input succeeds while persistence faults stay 500`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      state.fetches += 1;
      return new Response(html, { headers: { 'content-type': 'text/html' } });
    };
    try {
      const body = JSON.stringify({ url: 'https://carsmeet.tw/12345/' });
      const beforeWrites = state.writes;
      assert.equal((await POST(context(runtime, body))).status, 200);
      assert.equal(state.writes, beforeWrites + 1);
      state.failure = new Error('DEMO persistence failure');
      const failed = await POST(context(runtime, body));
      assert.equal(failed.status, 500);
      assert.equal(typeof (await failed.json()).error, 'string');
      assert.equal(state.writes, beforeWrites + 1);
    } finally { state.failure = null; globalThis.fetch = original; }
  });
}
