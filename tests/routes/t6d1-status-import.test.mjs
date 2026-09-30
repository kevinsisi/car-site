import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const calls = { auth: 0, analytics: 0, activity: [] };
globalThis.__t6d1StatusCalls = calls;

const modules = {
  '@/db/d1': 'export async function createD1Db(binding) { return { binding }; }',
  '@/lib/auth': `export async function getPermittedOrResponse(_cookies, _permission, options) {
    globalThis.__t6d1StatusCalls.auth++;
    globalThis.__t6d1StatusCalls.authOptions = options;
    return { id: 'DEMO-admin', username: 'DEMO-user' };
  }`,
  '@/lib/permissions': 'export const PERMISSIONS = { VEHICLES_EDIT: "vehicles:edit" };',
  '@/lib/vehicles': `export async function updateVehicleStatus(...args) {
    globalThis.__t6d1StatusCalls.update = args;
  }`,
  '@/lib/vehicle-status': 'export function isVehicleStatus(status) { return status === "sold"; }',
  '@/lib/analytics': `
    globalThis.__t6d1StatusCalls.analytics++;
    export function hashIp(ip) { return 'HASH:' + ip; }
    export async function logAdminActivity(activity) {
      globalThis.__t6d1StatusCalls.activity.push(activity);
    }
  `,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) {
      if (specifier === '@/lib/analytics') calls.analyticsResolved = (calls.analyticsResolved ?? 0) + 1;
      return {
        url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { POST } = await import('../../src/pages/api/admin/vehicles/[id]/status.ts');

function context({ runtime, env = { DB_PREVIEW: {}, SESSION_SECRET: 'DEMO-worker-secret' } } = {}) {
  return {
    params: { id: 'DEMO-vehicle' },
    request: new Request('https://preview.example/api/admin/vehicles/DEMO-vehicle/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.10' },
      body: JSON.stringify({ status: 'sold' }),
    }),
    cookies: { get: () => undefined },
    locals: runtime ? { runtime: { env } } : { runtime: undefined },
  };
}

test('Worker status route avoids analytics, requires both request bindings, and Node logging remains reachable', async () => {
  assert.equal(calls.analyticsResolved ?? 0, 0, 'route import must not resolve analytics');

  const workerResponse = await POST(context({ runtime: true }));
  assert.equal(workerResponse.status, 200);
  assert.equal(calls.analyticsResolved ?? 0, 0, 'Worker request must not resolve analytics');
  assert.equal(calls.analytics, 0);
  assert.deepEqual(calls.activity, []);
  assert.equal(calls.authOptions.sessionSecret, 'DEMO-worker-secret');

  const authCalls = calls.auth;
  const missingSecret = await POST(context({ runtime: true, env: { DB_PREVIEW: {} } }));
  assert.equal(missingSecret.status, 503);
  assert.equal(calls.auth, authCalls, 'missing Worker secret must be rejected before auth');
  assert.equal(calls.analyticsResolved ?? 0, 0);

  const missingDatabase = await POST(context({ runtime: true, env: { SESSION_SECRET: 'DEMO-worker-secret' } }));
  assert.equal(missingDatabase.status, 503);
  assert.equal(calls.auth, authCalls, 'missing Worker D1 binding must be rejected before auth');
  assert.equal(calls.analyticsResolved ?? 0, 0);

  const nodeResponse = await POST(context());
  assert.equal(nodeResponse.status, 200);
  assert.equal(calls.analytics, 1);
  assert.equal(calls.activity.length, 1);
  assert.deepEqual(calls.activity[0], {
    userId: 'DEMO-admin',
    username: 'DEMO-user',
    action: 'vehicle_status_change',
    targetType: 'vehicle',
    targetId: 'DEMO-vehicle',
    details: { status: 'sold' },
    ipHash: 'HASH:192.0.2.10',
  });
});
