import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';

let nativeConnectionEvaluations = 0;
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      nativeConnectionEvaluations += 1;
      throw new Error('Native SQLite connection must not load for an injected D1 request');
    }
    return nextLoad(url, context);
  },
});

function syntheticBinding() {
  return {
    prepare() {
      return {
        bind() { return this; },
        async all() { return { results: [] }; },
        async raw() { return []; },
        async run() { return { success: true, meta: { changes: 0 } }; },
      };
    },
    async batch() { return []; },
  };
}

test('shared helpers use injected D1 without evaluating the native connection module', async () => {
  const adapter = await createD1Db(syntheticBinding());
  const [vehicles, settings, aliases] = await Promise.all([
    import('../../src/lib/vehicles.ts'),
    import('../../src/lib/settings.ts'),
    import('../../src/lib/brand-aliases.ts'),
  ]);

  assert.deepEqual(await vehicles.listPublicInventoryVehicles(adapter), []);
  assert.equal((await settings.getSettings(adapter)).siteName, '私人精品車展');
  assert.deepEqual(await aliases.listBrandAliases(adapter), []);
  assert.equal(nativeConnectionEvaluations, 0);
});
