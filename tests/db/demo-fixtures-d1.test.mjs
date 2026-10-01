import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const wrangler = path.join(repoRoot, 'node_modules', '.bin', 'wrangler');
const config = path.join(repoRoot, 'wrangler.toml');
const seedFile = path.join(repoRoot, 'scripts/seed-preview-d1.sql');
const resetFile = path.join(repoRoot, 'scripts/reset-preview-d1.sql');
const binding = 'DB_PREVIEW';
const tableCounts = [
  ['vehicles', "id LIKE 'DEMO-%' OR slug LIKE 'DEMO-%' OR source LIKE 'DEMO-%' OR external_id LIKE 'DEMO-%'"],
  ['vehicle_images', "id LIKE 'DEMO-%' OR vehicle_id LIKE 'DEMO-%'"],
  ['import_mappings', "id LIKE 'DEMO-%' OR source LIKE 'DEMO-%' OR external_id LIKE 'DEMO-%' OR vehicle_id LIKE 'DEMO-%'"],
  ['site_settings', "key LIKE 'DEMO-%'"],
  ['brand_aliases', "source_brand LIKE 'DEMO-%'"],
];

function wranglerArgs(persistRoot, ...args) {
  const databasePosition = args[1] === 'execute' ? 2 : args.length;
  return [...args.slice(0, databasePosition), binding, ...args.slice(databasePosition), '--local', '--persist-to', persistRoot, '--config', config, '--env', 'preview'];
}

function execute(persistRoot, ...args) {
  const output = execFileSync(wrangler, wranglerArgs(persistRoot, 'd1', 'execute', ...args, '--json'), {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(output);
  return parsed.find((entry) => Array.isArray(entry.results))?.results ?? [];
}

function fixtureSnapshot(persistRoot) {
  return Object.fromEntries(tableCounts.map(([table, predicate]) => [table,
    execute(persistRoot, '--command', `SELECT * FROM ${table} WHERE ${predicate} ORDER BY 1`)]));
}

test('preview D1 fixtures seed idempotently and reset without changing non-DEMO sentinel rows', () => {
  const persistRoot = mkdtempSync(path.join(tmpdir(), 'car-site-d1-fixtures-'));
  try {
    execFileSync(wrangler, wranglerArgs(persistRoot, 'd1', 'migrations', 'apply'), {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const sentinelInsert = `INSERT INTO vehicles (id, slug, title, brand, model, source, status, features_json, local_edits_json, created_at, updated_at)
      VALUES ('sentinel-vehicle', 'sentinel-slug', 'Sentinel vehicle', 'Sentinel brand', 'Sentinel model', 'manual', 'draft', '[]', '[]', '2025-02-03T04:05:06.000Z', '2025-02-03T04:05:06.000Z');
      INSERT INTO site_settings (key, value, updated_at) VALUES ('sentinel-setting', 'preserve-this-value', '2025-02-03T04:05:06.000Z');
      INSERT INTO brand_aliases (source_brand, display_name, url_slug, icon_url, updated_at) VALUES ('sentinel-brand', 'Sentinel display', 'sentinel-brand', NULL, '2025-02-03T04:05:06.000Z');`;
    execute(persistRoot, '--command', sentinelInsert);
    const sentinelBefore = {
      vehicle: execute(persistRoot, '--command', "SELECT * FROM vehicles WHERE id = 'sentinel-vehicle'")[0],
      setting: execute(persistRoot, '--command', "SELECT * FROM site_settings WHERE key = 'sentinel-setting'")[0],
      alias: execute(persistRoot, '--command', "SELECT * FROM brand_aliases WHERE source_brand = 'sentinel-brand'")[0],
    };

    execute(persistRoot, '--file', seedFile);
    const firstSeed = fixtureSnapshot(persistRoot);
    const firstIds = Object.fromEntries(Object.entries(firstSeed).map(([table, rows]) => [table, rows.map((row) => row.id ?? row.key ?? row.source_brand)]));
    execute(persistRoot, '--file', seedFile);
    const secondSeed = fixtureSnapshot(persistRoot);
    const secondIds = Object.fromEntries(Object.entries(secondSeed).map(([table, rows]) => [table, rows.map((row) => row.id ?? row.key ?? row.source_brand)]));
    assert.deepEqual(secondIds, firstIds, 'fixture IDs remain stable after the second seed');
    assert.deepEqual(Object.fromEntries(Object.entries(secondSeed).map(([table, rows]) => [table, rows.length])),
      Object.fromEntries(Object.entries(firstSeed).map(([table, rows]) => [table, rows.length])), 'per-table fixture counts remain stable');
    assert.deepEqual(secondSeed, firstSeed, 'repeat seed does not mutate fixture rows');

    execute(persistRoot, '--file', resetFile);
    for (const [table, predicate] of tableCounts) {
      assert.equal(execute(persistRoot, '--command', `SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`)[0].count, 0, `${table} fixture rows`);
    }
    assert.deepEqual(execute(persistRoot, '--command', "SELECT * FROM vehicles WHERE id = 'sentinel-vehicle'")[0], sentinelBefore.vehicle);
    assert.deepEqual(execute(persistRoot, '--command', "SELECT * FROM site_settings WHERE key = 'sentinel-setting'")[0], sentinelBefore.setting);
    assert.deepEqual(execute(persistRoot, '--command', "SELECT * FROM brand_aliases WHERE source_brand = 'sentinel-brand'")[0], sentinelBefore.alias);
  } finally {
    rmSync(persistRoot, { recursive: true, force: true });
  }
});
