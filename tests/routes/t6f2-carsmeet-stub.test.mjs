import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const calls = { auth: [], imports: [], adapters: [], liveFetches: 0 };
globalThis.__t6f2Calls = calls;

const modules = {
  '@/db/d1': `export async function createD1Db(binding) {
    const adapter = { binding };
    globalThis.__t6f2Calls.adapters.push(adapter);
    return adapter;
  }`,
  '@/lib/auth': `export async function getPermittedOrResponse(cookies, permission, options) {
    globalThis.__t6f2Calls.auth.push({ cookies, permission, options });
    return {};
  }`,
  '@/lib/permissions': `export const PERMISSIONS = { VEHICLES_EDIT: 32 };`,
  '@/lib/carsmeet-import': `
    export class CarsmeetImportError extends Error {
      constructor(message, status = 400) { super(message); this.status = status; }
    }
    export function parseCarsmeetUrl(input) {
      let url;
      try { url = new URL(String(input || '').trim()); }
      catch { throw new CarsmeetImportError('請輸入有效的 Carsmeet 車輛網址'); }
      if (url.protocol !== 'https:' || url.hostname !== 'carsmeet.tw' || !/^\\/\\d+\\/?$/.test(url.pathname)) {
        throw new CarsmeetImportError('目前只支援 https://carsmeet.tw/數字/ 的車輛網址');
      }
      const externalId = url.pathname.match(/\\d+/)[0];
      return { url: 'https://carsmeet.tw/' + externalId + '/', externalId };
    }
    export async function importableCarsmeetData(url) {
      globalThis.__t6f2Calls.liveFetches += 1;
      return { externalId: '123', title: 'Live car', brand: 'Live', model: 'Car', photos: [] };
    }
  `,
  '@/lib/vehicles': `export async function importVehicle(input, adapter) {
    globalThis.__t6f2Calls.imports.push({ input, adapter });
    return { vehicleId: 'live-vehicle-id', status: 'draft' };
  }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { POST } = await import('../../src/pages/api/admin/vehicles/import-carsmeet.ts');
const binding = { marker: 'DEMO-request-d1' };
const secret = 'DEMO-request-session-secret';

function context(url, { worker = true, env = { DB_PREVIEW: binding, SESSION_SECRET: secret } } = {}) {
  return {
    request: new Request('https://preview.example/api/admin/vehicles/import-carsmeet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
    cookies: { marker: 'request-cookies' },
    locals: { runtime: worker ? { env } : undefined },
  };
}

test('Worker Carsmeet import clearly reports preview disabled without fetching or writing', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('unexpected outbound fetch'); };
  try {
    const first = await POST(context('https://carsmeet.tw/92831/'));
    const second = await POST(context('https://carsmeet.tw/92831/'));
    assert.equal(first.status, 501);
    assert.equal(second.status, 501);
    const firstResult = await first.json();
    const secondResult = await second.json();
    assert.deepEqual(firstResult, secondResult);
    assert.equal(firstResult.ok, false);
    assert.equal(firstResult.previewOnly, true);
    assert.match(firstResult.error, /no vehicle was imported/i);
    assert.equal('vehicleId' in firstResult, false);
    assert.equal('status' in firstResult, false);
    assert.equal(fetchCalls, 0);
    assert.equal(calls.liveFetches, 0);
    assert.equal(calls.imports.length, 0);
    assert.equal(calls.adapters.length, 2);
    assert.ok(calls.adapters.every((adapter) => adapter.binding === binding));
    assert.ok(calls.auth.slice(-2).every(({ options }) => options.db.binding === binding && options.sessionSecret === secret));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker fails closed without either required binding and invalid input stays bounded', async () => {
  for (const env of [{ SESSION_SECRET: secret }, { DB_PREVIEW: binding }]) {
    const response = await POST(context('https://carsmeet.tw/92831/', { env }));
    assert.equal(response.status, 503);
  }
  const badUrl = await POST(context('https://example.com/92831/'));
  assert.equal(badUrl.status, 400);
  assert.deepEqual(await badUrl.json(), { error: '目前只支援 https://carsmeet.tw/數字/ 的車輛網址' });
  assert.equal(calls.imports.length, 0);
});

test('Node Carsmeet import retains existing live helper and native database behavior', async () => {
  const adaptersBefore = calls.adapters.length;
  const response = await POST(context('https://carsmeet.tw/92831/', { worker: false }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    vehicleId: 'live-vehicle-id',
    status: 'draft',
    source: 'carsmeet',
    externalId: '123',
    title: 'Live car',
    imageCount: 0,
  });
  assert.equal(calls.liveFetches, 1);
  assert.equal(calls.imports.length, 1);
  assert.equal(calls.imports[0].adapter, undefined);
  assert.equal(calls.adapters.length, adaptersBefore);
});
