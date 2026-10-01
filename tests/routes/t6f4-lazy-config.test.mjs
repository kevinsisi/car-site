import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const calls = { configEvaluations: 0, imports: [], adapters: [] };
globalThis.__t6f4Calls = calls;

const modules = {
  '@/db/d1': `export async function createD1Db(binding) {
    const adapter = { binding };
    globalThis.__t6f4Calls.adapters.push(adapter);
    return adapter;
  }`,
  '@/lib/config': `globalThis.__t6f4Calls.configEvaluations += 1;
    export const appConfig = { importApiToken: 'DEMO-node-import-token' };`,
  '@/lib/vehicles': `export async function importVehicle(input, adapter) {
    globalThis.__t6f4Calls.imports.push({ input, adapter });
    return { vehicleId: 'DEMO-vehicle', status: 'draft' };
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
const nodeToken = 'DEMO-node-import-token';

function context({ worker, token, body = { source: 'preview', externalId: 'DEMO-car-001', brand: 'DEMO-brand', model: 'DEMO-model' } }) {
  const env = worker ? { DB_PREVIEW: { marker: 'DEMO-preview-d1' }, IMPORT_PREVIEW_TOKEN: 'DEMO-preview-token' } : undefined;
  return {
    request: new Request('https://preview.example/api/import/cars', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { runtime: worker ? { env } : undefined },
  };
}

test('Worker module loads and handles imports without evaluating Node config', async () => {
  assert.equal(calls.configEvaluations, 0);
  const response = await POST(context({ worker: true, token: 'DEMO-preview-token' }));
  assert.equal(response.status, 200);
  assert.equal(calls.configEvaluations, 0);
  assert.equal(calls.imports.length, 1);
  assert.deepEqual(calls.imports[0].adapter.binding, { marker: 'DEMO-preview-d1' });
});

test('Node import branch lazily loads and accepts the configured token', async () => {
  const response = await POST(context({
    worker: false,
    token: nodeToken,
    body: { source: 'dealer', externalId: 'real-car-001', brand: 'DEMO-brand', model: 'DEMO-model' },
  }));
  assert.equal(response.status, 200);
  assert.equal(calls.configEvaluations, 1);
  assert.equal(calls.imports.length, 2);
  assert.equal(calls.imports[1].adapter, undefined);
});
