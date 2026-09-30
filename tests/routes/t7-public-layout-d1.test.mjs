import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../src/layouts/PublicLayout.astro', import.meta.url), 'utf8');
const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
assert.ok(frontmatter, 'Astro frontmatter is present');
const frontmatterBody = frontmatter[1];
const runtimeStart = frontmatterBody.indexOf('const runtime = Astro.locals.runtime;');
const settingsEnd = frontmatterBody.indexOf('const features = resolveFrontFeatures(settings);');
assert.notEqual(runtimeStart, -1, 'PublicLayout runtime setup is present');
assert.notEqual(settingsEnd, -1, 'PublicLayout settings setup is present');
const body = frontmatterBody.slice(runtimeStart, settingsEnd);

async function runLayout(runtime, createD1Db, getSettings) {
  const run = new Function(
    'Astro', 'createD1Db', 'getSettings',
    `return (async () => { ${body}\nreturn settings; })();`,
  );
  return run({ locals: { runtime } }, createD1Db, getSettings);
}

test('Worker PublicLayout reads settings through the request-scoped D1 adapter', async () => {
  const binding = { marker: 'synthetic-preview-binding' };
  const adapter = { marker: 'synthetic-d1-adapter' };
  const calls = [];
  const result = await runLayout(
    { env: { DB_PREVIEW: binding } },
    async (receivedBinding) => { calls.push(['createD1Db', receivedBinding]); return adapter; },
    async (receivedAdapter) => {
      calls.push(['getSettings', receivedAdapter]);
      assert.equal(receivedAdapter, adapter, 'Worker settings must not use the native DB fallback');
      return { siteName: 'Synthetic D1 site' };
    },
  );

  assert.deepEqual(result, { siteName: 'Synthetic D1 site' });
  assert.deepEqual(calls, [['createD1Db', binding], ['getSettings', adapter]]);
});

test('Worker PublicLayout returns 503 without DB_PREVIEW before accessing settings', async () => {
  for (const runtime of [{ env: {} }, { env: undefined }]) {
    const result = await runLayout(
      runtime,
      async () => { throw new Error('D1 adapter must not be created'); },
      async () => { throw new Error('settings must not be read'); },
    );
    assert.equal(result.status, 503);
  }
});

test('Node PublicLayout preserves the native settings path', async () => {
  const calls = [];
  const result = await runLayout(
    undefined,
    async () => { throw new Error('Node must not create a D1 adapter'); },
    async (adapter) => {
      calls.push(adapter);
      assert.equal(adapter, undefined);
      return { siteName: 'Node site' };
    },
  );

  assert.deepEqual(result, { siteName: 'Node site' });
  assert.deepEqual(calls, [undefined]);
});
