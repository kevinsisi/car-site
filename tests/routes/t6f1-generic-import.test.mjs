import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const calls = { imports: [], adapters: [] };
globalThis.__t6f1Calls = calls;

const modules = {
  '@/db/d1': `export async function createD1Db(binding) {
    const adapter = { binding };
    globalThis.__t6f1Calls.adapters.push(adapter);
    return adapter;
  }`,
  '@/lib/config': `export const appConfig = { importApiToken: 'DEMO-production-token-must-not-authorize-worker' };`,
  '@/lib/vehicles': `export async function importVehicle(input, adapter) {
    globalThis.__t6f1Calls.imports.push({ input, adapter });
    return { vehicleId: 'DEMO-vehicle', status: 'draft', published: false, validation: { hasPublicFields: false } };
  }`,
  '@/lib/vehicle-status': `export function isVehicleStatus(value) { return value === 'draft' || value === 'published'; }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { POST } = await import('../../src/pages/api/import/cars.ts');
const binding = { marker: 'DEMO-preview-d1' };
const previewToken = 'DEMO-preview-token';

function context(body, { worker = true, env = { DB_PREVIEW: binding, IMPORT_PREVIEW_TOKEN: previewToken }, token = previewToken } = {}) {
  return {
    request: new Request('https://preview.example/api/import/cars', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { runtime: worker ? { env } : undefined },
  };
}

function validInput(overrides = {}) {
  return { source: 'preview', externalId: 'DEMO-car-001', brand: 'DEMO-brand', model: 'DEMO-model', photos: ['/media/DEMO-car.webp'], ...overrides };
}

test('Worker import requires preview bindings and authenticates only with preview token', async () => {
  const missingDatabase = await POST(context(validInput(), { env: { IMPORT_PREVIEW_TOKEN: previewToken } }));
  assert.equal(missingDatabase.status, 503);
  const missingToken = await POST(context(validInput(), { env: { DB_PREVIEW: binding } }));
  assert.equal(missingToken.status, 503);

  const productionToken = await POST(context(validInput(), { token: 'DEMO-production-token-must-not-authorize-worker' }));
  assert.equal(productionToken.status, 401);
  assert.equal(calls.imports.length, 0);
  assert.equal(calls.adapters.length, 0);
});

test('Worker import accepts synthetic fixtures through the request-scoped D1 adapter', async () => {
  const response = await POST(context(validInput()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    vehicleId: 'DEMO-vehicle',
    status: 'draft',
    published: false,
    validation: { hasPublicFields: false },
  });
  assert.equal(calls.imports.length, 1);
  assert.equal(calls.imports[0].input.source, 'preview');
  assert.equal(calls.imports[0].input.externalId, 'DEMO-car-001');
  assert.equal(calls.imports[0].adapter.binding, binding);
});

test('Worker import rejects non-fixture source, id, and external photo URLs before importing', async () => {
  const importsBefore = calls.imports.length;
  const adaptersBefore = calls.adapters.length;
  for (const input of [
    validInput({ source: 'dealer' }),
    validInput({ externalId: 'car-001' }),
    validInput({ photos: ['https://images.example/DEMO-car.webp'] }),
    validInput({ photos: ['//images.example/DEMO-car.webp'] }),
  ]) {
    const response = await POST(context(input));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.imports.length, importsBefore);
  assert.equal(calls.adapters.length, adaptersBefore);
});

test('Node import keeps global token and native database path', async () => {
  const importsBefore = calls.imports.length;
  const adaptersBefore = calls.adapters.length;
  const response = await POST(context(validInput({ source: 'dealer', externalId: 'real-car-001' }), {
    worker: false,
    token: 'DEMO-production-token-must-not-authorize-worker',
  }));
  assert.equal(response.status, 200);
  assert.equal(calls.imports.length, importsBefore + 1);
  assert.equal(calls.imports[importsBefore].adapter, undefined);
  assert.equal(calls.adapters.length, adaptersBefore);
});
