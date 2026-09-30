import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';
import { vehicles } from '../../src/db/schema.ts';

function createBinding(label) {
  const calls = [];

  return {
    calls,
    prepare(query) {
      calls.push({ method: 'prepare', query });
      return {
        bind(...values) {
          calls.push({ method: 'bind', values });
          return this;
        },
        async all() {
          calls.push({ method: 'all' });
          return { results: [{ label }] };
        },
        async raw() {
          calls.push({ method: 'raw' });
          return [[label]];
        },
      };
    },
  };
}

test('D1 adapters use their supplied binding and keep calls independent', async () => {
  const firstBinding = createBinding('first');
  const secondBinding = createBinding('second');

  const firstDb = await createD1Db(firstBinding);
  const secondDb = await createD1Db(secondBinding);

  assert.notStrictEqual(firstDb, secondDb);
  assert.strictEqual(firstDb.$client, firstBinding);
  assert.strictEqual(secondDb.$client, secondBinding);

  const firstRows = await firstDb.select({ id: vehicles.id }).from(vehicles).all();
  const secondRows = await secondDb.select({ id: vehicles.id }).from(vehicles).all();

  assert.deepEqual(firstRows, [{ id: 'first' }]);
  assert.deepEqual(secondRows, [{ id: 'second' }]);
  assert.ok(firstBinding.calls.some(({ method }) => method === 'prepare'));
  assert.ok(secondBinding.calls.some(({ method }) => method === 'prepare'));
  assert.deepEqual(firstBinding.calls.map(({ method }) => method), ['prepare', 'bind', 'raw']);
  assert.deepEqual(secondBinding.calls.map(({ method }) => method), ['prepare', 'bind', 'raw']);
});
