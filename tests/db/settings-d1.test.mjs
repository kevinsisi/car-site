import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';
import * as schema from '../../src/db/schema.ts';
import { defaultDetailSpecFields } from '../../src/lib/detail-spec-fields.ts';
import { ALL_FEATURES_MASK, DEFAULT_FEATURE_MASK } from '../../src/lib/features.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      return { format: 'module', source: 'export const db = globalThis.__settingsNodeDbStub;', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

function createBinding() {
  const rows = new Map();
  const calls = [];

  return {
    rows,
    calls,
    close() {},
    prepare(sql) {
      calls.push(sql);
      const normalizedSql = sql.toLowerCase();
      let values = [];
      const execute = () => {
        if (normalizedSql.startsWith('select')) {
          const key = values[0];
          const selected = key === undefined ? [...rows.values()] : (rows.has(key) ? [rows.get(key)] : []);
          return { results: selected };
        }
        if (normalizedSql.startsWith('insert into "site_settings"')) {
          for (let index = 0; index < values.length; index += 3) {
            const [key, value, updatedAt] = values.slice(index, index + 3);
            rows.set(key, { key, value, updated_at: updatedAt });
          }
          return { success: true, meta: { changes: values.length / 3 } };
        }
        if (normalizedSql.startsWith('delete from "site_settings"')) {
          return { success: true, meta: { changes: rows.delete(values[0]) ? 1 : 0 } };
        }
        throw new Error(`Unexpected synthetic D1 SQL: ${sql}`);
      };
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async all() {
          return execute();
        },
        async raw() {
          return execute().results?.map(({ key, value, updated_at }) => [key, value, updated_at]);
        },
        async run() {
          return execute();
        },
      };
    },
  };
}

async function createSettingsDb(binding = createBinding()) {
  return { binding, db: await createD1Db(binding) };
}

test('empty D1 settings use the documented defaults', async () => {
  const { binding, db } = await createSettingsDb();
  globalThis.__settingsNodeDbStub = db;
  globalThis.__settingsNodeBinding = binding;
  const { getSettings } = await import('../../src/lib/settings.ts');
  const settings = await getSettings(db);

  assert.equal(settings.siteName, '私人精品車展');
  assert.equal(settings.featuredCount, 3);
  assert.deepEqual(settings.detailSpecFields, defaultDetailSpecFields);
  assert.deepEqual(settings.socialIcons, {});
  assert.equal(settings.activeTemplate, 'private-salon');
  assert.equal(settings.showSoldVehicles, false);
  assert.equal(settings.featureMask, DEFAULT_FEATURE_MASK);
  assert.equal(settings.featureLicenseMask, ALL_FEATURES_MASK);
  assert.equal(settings.importBehavior, 'draft_first');
});

test('D1 settings reads retain parsing and sanitization behavior', async () => {
  const { binding, db } = await createSettingsDb();
  try {
    const { getSettings, getSettingValue } = await import('../../src/lib/settings.ts');
    await db.insert(schema.siteSettings).values([
      { key: 'siteName', value: 'Synthetic showroom', updatedAt: 'now' },
      { key: 'featuredCount', value: '99', updatedAt: 'now' },
      { key: 'showSoldVehicles', value: 'true', updatedAt: 'now' },
      { key: 'importBehavior', value: 'invalid', updatedAt: 'now' },
      { key: 'detailSpecFields', value: '["year","not-allowed"]', updatedAt: 'now' },
    ]);

    const settings = await getSettings(db);
    assert.equal(settings.siteName, 'Synthetic showroom');
    assert.equal(settings.featuredCount, 3);
    assert.equal(settings.showSoldVehicles, true);
    assert.equal(settings.importBehavior, 'draft_first');
    assert.deepEqual(settings.detailSpecFields, ['year']);
    assert.equal(await getSettingValue('missing-arbitrary-key', db), null);
  } finally {
    binding.close();
  }
});

test('explicit D1 injection handles create, update, delete, and sequential settings writes', async () => {
  const { binding, db } = await createSettingsDb();
  try {
    const { getSettingValue, setSettingValue, deleteSettingValue, setSettings } = await import('../../src/lib/settings.ts');
    await setSettingValue('siteName', 'first', db);
    await setSettingValue('siteName', 'second', db);
    await setSettings({ featuredCount: 5, detailSpecFields: ['year', 'brand'], socialIcons: { line: { url: 'https://example.com/icon.png' } }, siteUrl: undefined }, db);

    assert.equal(await getSettingValue('siteName', db), 'second');
    assert.equal(await getSettingValue('featuredCount', db), '5');
    assert.equal(await getSettingValue('detailSpecFields', db), '["year","brand"]');
    assert.equal(await getSettingValue('socialIcons', db), '{"line":{"url":"https://example.com/icon.png"}}');
    assert.equal(await getSettingValue('siteUrl', db), null);

    await deleteSettingValue('siteName', db);
    assert.equal(await getSettingValue('siteName', db), null);
  } finally {
    binding.close();
  }
});

test('settings calls without an adapter use the existing Node db default', async () => {
  const { getSettingValue, setSettingValue } = await import('../../src/lib/settings.ts');
  try {
    await setSettingValue('default-path', 'node');
    assert.equal(await getSettingValue('default-path'), 'node');
  } finally {
    globalThis.__settingsNodeBinding.close();
    delete globalThis.__settingsNodeBinding;
    delete globalThis.__settingsNodeDbStub;
  }
});

test('separately injected D1 adapters keep settings stores isolated', async () => {
  const first = await createSettingsDb();
  const second = await createSettingsDb();
  try {
    const { getSettingValue, setSettingValue } = await import('../../src/lib/settings.ts');
    await setSettingValue('isolated', 'first-store', first.db);
    assert.equal(await getSettingValue('isolated', first.db), 'first-store');
    assert.equal(await getSettingValue('isolated', second.db), null);
  } finally {
    first.binding.close();
    second.binding.close();
  }
});
