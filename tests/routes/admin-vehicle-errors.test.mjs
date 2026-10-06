import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { signSession } from '../../src/lib/crypto.ts';
import * as schema from '../../src/db/schema.ts';

const secret = 'DEMO-vehicle-error-session-secret';
const fixtures = new Map();
const activity = [];
globalThis.__vehicleErrorActivity = activity;

for (const runtime of ['Node', 'Worker']) {
  const sqlite = new Database(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/d1/0001_baseline.sql', import.meta.url), 'utf8'));
  sqlite.exec(`
    INSERT INTO admin_users VALUES ('DEMO-editor', 'DEMO-editor', 'unused', 'admin', 2, 'DEMO-created');
    INSERT INTO admin_users VALUES ('DEMO-viewer', 'DEMO-viewer', 'unused', 'admin', 1, 'DEMO-created');
    INSERT INTO admin_sessions VALUES ('DEMO-editor-session', 'DEMO-editor', '2999-01-01T00:00:00.000Z', 'DEMO-created');
    INSERT INTO admin_sessions VALUES ('DEMO-viewer-session', 'DEMO-viewer', '2999-01-01T00:00:00.000Z', 'DEMO-created');
    INSERT INTO vehicles (id, slug, title, brand, model, status, created_at, updated_at)
      VALUES ('DEMO-vehicle', 'demo-vehicle', 'DEMO vehicle', 'DEMO-brand', 'DEMO-model', 'draft', 'DEMO-created', 'DEMO-updated');
  `);
  const binding = {
    prepare(query) {
      let values = [];
      const statement = {
        query,
        bind(...args) { values = args; return statement; },
        values: () => values,
        async all() { return { results: sqlite.prepare(query).all(...values) }; },
        async raw() { return sqlite.prepare(query).all(...values).map((row) => Object.values(row)); },
        async first() { return sqlite.prepare(query).get(...values) ?? null; },
        async run() { return { success: true, meta: { changes: sqlite.prepare(query).run(...values).changes } }; },
      };
      return statement;
    },
    async batch(statements) {
      return sqlite.transaction(() => statements.map(({ query, values }) => ({
        success: true, meta: { changes: sqlite.prepare(query).run(...values()).changes },
      })))();
    },
  };
  fixtures.set(runtime, { sqlite, binding });
  if (runtime === 'Node') globalThis.__vehicleErrorNodeDb = drizzle(sqlite, { schema });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = specifier === '@/db/connection'
      ? 'export const db = globalThis.__vehicleErrorNodeDb;'
      : specifier === '@/lib/analytics'
        ? `export const hashIp = (ip) => ip;
           export async function logAdminActivity(entry) { globalThis.__vehicleErrorActivity.push(entry); }`
        : undefined;
    return source
      ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});

const vehicleRoute = await import('../../src/pages/api/admin/vehicles.ts');
const statusRoute = await import('../../src/pages/api/admin/vehicles/[id]/status.ts');

function context(runtime, rawBody, { id = 'DEMO-vehicle', user = 'editor' } = {}) {
  const token = user ? signSession(`DEMO-${user}-session`, runtime === 'Worker' ? secret : undefined) : null;
  return {
    request: new Request('https://preview.example/api/admin/vehicles', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: rawBody,
    }),
    params: id ? { id } : {},
    cookies: { get: (name) => name === 'car_site_admin' && token ? { value: token } : undefined },
    locals: runtime === 'Worker'
      ? { runtime: { env: { DB_PREVIEW: fixtures.get(runtime).binding, SESSION_SECRET: secret } } }
      : {},
  };
}

after(() => {
  for (const { sqlite } of fixtures.values()) sqlite.close();
});

for (const runtime of fixtures.keys()) {
  test(`${runtime} vehicle endpoints reject malformed JSON and non-object bodies with 400`, async (t) => {
    for (const [name, route] of [['save', vehicleRoute], ['status', statusRoute]]) {
      await t.test(name, async () => {
        for (const rawBody of ['{', '', 'null', '[]', '42', 'true', '"invalid"']) {
          const response = await route.POST(context(runtime, rawBody));
          assert.equal(response.status, 400, rawBody || 'empty body');
          assert.equal(typeof (await response.json()).error, 'string');
        }
      });
    }
  });

  test(`${runtime} status updates return 404 when the vehicle does not exist`, async () => {
    const previousActivity = activity.length;
    const response = await statusRoute.POST(context(runtime, '{"status":"sold"}', { id: 'DEMO-missing' }));
    assert.equal(response.status, 404);
    assert.equal(typeof (await response.json()).error, 'string');
    assert.equal(activity.length, previousActivity, 'missing vehicle must not be logged as a successful change');
  });

  test(`${runtime} existing vehicle status updates and same-status retries still succeed`, async () => {
    for (const status of ['sold', 'sold', 'draft']) {
      const response = await statusRoute.POST(context(runtime, JSON.stringify({ status })));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    }
  });

  test(`${runtime} valid vehicle saves still succeed`, async () => {
    const response = await vehicleRoute.POST(context(runtime, JSON.stringify({
      id: 'DEMO-vehicle', title: 'DEMO updated', brand: 'DEMO-brand', model: 'DEMO-model',
    })));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, vehicleId: 'DEMO-vehicle' });
  });

  test(`${runtime} validation still rejects missing fields, invalid status, and absent target IDs`, async () => {
    for (const body of [{}, { title: 'DEMO', brand: 'DEMO-brand' }]) {
      assert.equal((await vehicleRoute.POST(context(runtime, JSON.stringify(body)))).status, 400);
    }
    for (const status of ['not-a-status', '', null, 42]) {
      assert.equal((await statusRoute.POST(context(runtime, JSON.stringify({ status })))).status, 400);
    }
    assert.equal((await statusRoute.POST(context(runtime, '{"status":"sold"}', { id: null }))).status, 400);
  });

  test(`${runtime} authentication and edit permission are checked before request body validation`, async () => {
    for (const route of [vehicleRoute, statusRoute]) {
      for (const rawBody of ['{', '{"status":"sold"}']) {
        assert.equal((await route.POST(context(runtime, rawBody, { user: null }))).status, 401);
        assert.equal((await route.POST(context(runtime, rawBody, { user: 'viewer' }))).status, 403);
      }
    }
  });

  test(`${runtime} database write failures remain failures rather than invalid-input or missing-target responses`, async () => {
    const { sqlite } = fixtures.get(runtime);
    sqlite.exec(`CREATE TRIGGER fail_vehicle_write BEFORE UPDATE ON vehicles
      BEGIN SELECT RAISE(ABORT, 'DEMO database write failure'); END`);
    try {
      const previousActivity = activity.length;
      for (const [route, body] of [
        [vehicleRoute, { id: 'DEMO-vehicle', title: 'DEMO', brand: 'DEMO-brand', model: 'DEMO-model' }],
        [statusRoute, { status: 'sold' }],
      ]) {
        await assert.rejects(() => route.POST(context(runtime, JSON.stringify(body))), (error) => {
          assert.match(error.cause?.message ?? error.message, /DEMO database write failure/);
          return true;
        });
      }
      assert.equal(activity.length, previousActivity, 'failed writes must not be logged as successful changes');
    } finally {
      sqlite.exec('DROP TRIGGER fail_vehicle_write');
    }
  });
}
