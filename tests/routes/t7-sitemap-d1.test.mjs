import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function createRoute(source, { createD1Db, listPublicVehicles }) {
  const handler = source
    .replace(/^import .*;\n/gm, '')
    .replace('const env = runtime?.env as { DB_PREVIEW?: Parameters<typeof createD1Db>[0] } | undefined;', 'const env = runtime?.env;')
    .replace('const lines: string[] = [];', 'const lines = [];')
    .replace('export const GET: APIRoute =', 'return')
    .replace(/;\s*$/, '');
  return new Function('createD1Db', 'listPublicVehicles', handler)(createD1Db, listPublicVehicles);
}

test('sitemap uses request D1 in Workers, fails closed without binding, and preserves Node XML', async () => {
  const source = await readFile(new URL('../../src/pages/sitemap.xml.ts', import.meta.url), 'utf8');
  const binding = { marker: 'synthetic-preview-binding' };
  const adapter = { marker: 'request-scoped-adapter' };
  const calls = [];
  const GET = createRoute(source, {
    async createD1Db(value) {
      calls.push(['createD1Db', value]);
      return adapter;
    },
    async listPublicVehicles(value) {
      calls.push(['listPublicVehicles', value]);
      return [{ slug: 'synthetic-demo-vehicle' }];
    },
  });

  const request = { url: new URL('https://example.test/sitemap.xml'), locals: { runtime: { env: { DB_PREVIEW: binding } } } };
  const response = await GET(request);
  const xml = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.match(xml, /https:\/\/example\.test\/cars\/synthetic-demo-vehicle/);
  assert.match(xml, /https:\/\/example\.test\/about/);
  assert.deepEqual(calls, [['createD1Db', binding], ['listPublicVehicles', adapter]]);

  for (const locals of [{ runtime: { env: {} } }, { runtime: { env: undefined } }]) {
    const missing = await GET({ ...request, locals });
    assert.equal(missing.status, 503);
  }
  assert.equal(calls.length, 2, 'missing bindings do not create a DB or query vehicles');

  const nodeResponse = await GET({ ...request, locals: {} });
  assert.equal(nodeResponse.status, 200);
  assert.match(await nodeResponse.text(), /https:\/\/example\.test\/cars\/synthetic-demo-vehicle/);
  assert.deepEqual(calls.slice(2), [['listPublicVehicles', undefined]]);
});
