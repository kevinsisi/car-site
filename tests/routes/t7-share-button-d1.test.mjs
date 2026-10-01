import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const componentPath = new URL('../../src/components/ShareButton.astro', import.meta.url);

test('ShareButton uses request-scoped D1 in Workers and never falls back natively', async () => {
  const source = await readFile(componentPath, 'utf8');

  assert.match(source, /const runtime = Astro\.locals\.runtime/);
  assert.match(source, /const db = runtime\.env\.DB_PREVIEW/);
  assert.match(source, /getSettings\(await createD1Db\(db\)\)/);
  assert.match(source, /if \(!db\)\s*\{\s*Astro\.response\.status = 503;/);
  assert.match(source, /else\s*\{\s*const settings = await getSettings\(\);/);
  assert.doesNotMatch(source, /from ['"]@\/db\/connection['"]/);

  let queried = false;
  const syntheticD1 = {
    prepare(sql) {
      assert.match(sql, /site_settings/);
      return {
        bind() { return this; },
        async all() {
          queried = true;
          return { results: [{ key: 'socialIcons', value: '{"share":{"url":"https://example.test/share.svg"}}' }] };
        },
      };
    },
  };
  const adapter = {
    select() {
      return { from: () => ({ all: () => syntheticD1.prepare('select * from site_settings').all() }) };
    },
  };
  const result = await adapter.select().from().all();
  assert.equal(queried, true, 'the synthetic D1 binding should be queried through the adapter');
  assert.equal(result.results[0].key, 'socialIcons');
});

test('ShareButton keeps the native settings path for Node and returns controlled 503 without Worker binding', async () => {
  const source = await readFile(componentPath, 'utf8');

  assert.match(source, /else\s*\{\s*const settings = await getSettings\(\);/);
  assert.match(source, /if \(!db\)\s*\{\s*Astro\.response\.status = 503;/);
  assert.doesNotMatch(source, /if \(!db\)[\s\S]{0,120}getSettings\(\)/);
});
