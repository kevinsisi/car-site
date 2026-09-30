import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistRoot = mkdtempSync(path.join(tmpdir(), 'car-site-d1-schema-'));
const wrangler = path.join(repoRoot, 'node_modules', '.bin', 'wrangler');
const config = path.join(repoRoot, 'wrangler.toml');
const binding = 'DB_PREVIEW';

function migrate() {
  return execFileSync(
    wrangler,
    ['d1', 'migrations', 'apply', binding, '--local', '--persist-to', persistRoot, '--config', config, '--env', 'preview'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function sql(query) {
  const output = execFileSync(
    wrangler,
    ['d1', 'execute', binding, '--local', '--persist-to', persistRoot, '--config', config, '--env', 'preview', '--command', query, '--json'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(output);
  const result = parsed.find((item) => Array.isArray(item.results));
  assert.ok(result, `Wrangler returned no SQL results for: ${query}`);
  return result.results;
}

function expectSqlFailure(query, pattern) {
  try {
    sql(query);
  } catch (error) {
    const diagnostic = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    assert.match(diagnostic, pattern, `unexpected SQL failure for: ${query}`);
    return;
  }
  assert.fail(`Expected SQL constraint failure for: ${query}`);
}

try {
  const firstApply = migrate();
  assert.match(firstApply, /0001_baseline\.sql/);

  const expectedTables = [
    'vehicles', 'vehicle_images', 'site_settings', 'brand_aliases', 'import_mappings', 'admin_users',
    'admin_sessions', 'site_video_links', 'sell_inquiries', 'page_views', 'admin_activity_log', 'shared_rate_limits',
  ];
  const tables = sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_METADATA' ORDER BY name").map((row) => row.name);
  assert.deepEqual(tables, [...expectedTables, 'd1_migrations'].sort());

  const expectedColumns = {
    vehicles: ['id','slug','title','card_title_supplement','brand','model','sub_model','year','mileage','exterior_color','interior_color','condition','status','headline','description','features_json','monthly_recommended','show_sold_case','source','external_id','local_edits_json','sold_at','created_at','updated_at'],
    vehicle_images: ['id','vehicle_id','url','alt','sort_order','is_cover','created_at'],
    site_settings: ['key','value','updated_at'],
    brand_aliases: ['source_brand','display_name','url_slug','icon_url','updated_at'],
    import_mappings: ['id','source','external_id','vehicle_id','last_imported_at'],
    admin_users: ['id','username','password_hash','role','permissions','created_at'],
    admin_sessions: ['id','user_id','expires_at','created_at'],
    site_video_links: ['id','title','url','thumbnail_url','sort_order','created_at'],
    sell_inquiries: ['id','brand','model','year','mileage','exterior_color','notes','contact_info','contact_name','photo_urls','created_at','read_at'],
    page_views: ['id','path','vehicle_slug','session_id','ip_hash','device_type','referrer','status_code','duration_ms','is_bot','created_at'],
    admin_activity_log: ['id','user_id','username','action','target_type','target_id','details_json','ip_hash','created_at'],
    shared_rate_limits: ['limiter','limiter_key','count','window_started_at','locked_until','expires_at'],
  };
  for (const [table, columns] of Object.entries(expectedColumns)) {
    assert.deepEqual(sql(`PRAGMA table_info('${table}')`).map((row) => row.name), columns, `${table} columns`);
  }

  const expectedForeignKeys = {
    vehicle_images: ['vehicles', 'vehicle_id', 'id', 'CASCADE'],
    import_mappings: ['vehicles', 'vehicle_id', 'id', 'CASCADE'],
    admin_sessions: ['admin_users', 'user_id', 'id', 'CASCADE'],
  };
  for (const [table, [parent, from, to, onDelete]] of Object.entries(expectedForeignKeys)) {
    assert.deepEqual(sql(`PRAGMA foreign_key_list('${table}')`).map(({ table: actualParent, from: actualFrom, to: actualTo, on_delete: actualDelete }) => [actualParent, actualFrom, actualTo, actualDelete]), [[parent, from, to, onDelete]], `${table} FK`);
  }

  const expectedIndexes = {
    vehicles: ['vehicles_source_external_idx'],
    import_mappings: ['import_mappings_source_external_idx'],
    page_views: ['page_views_created_at_idx','page_views_vehicle_slug_idx','page_views_session_id_idx'],
    admin_activity_log: ['admin_activity_log_created_at_idx','admin_activity_log_user_id_idx'],
  };
  for (const [table, indexes] of Object.entries(expectedIndexes)) {
    const actual = sql(`PRAGMA index_list('${table}')`).map((row) => row.name);
    for (const index of indexes) assert.ok(actual.includes(index), `${table} missing index ${index}`);
  }
  assert.ok(sql("PRAGMA index_list('shared_rate_limits')").some((row) => row.name === 'shared_rate_limits_expiry_idx'));
  expectSqlFailure("INSERT INTO shared_rate_limits (limiter, limiter_key, count, window_started_at, expires_at) VALUES ('unknown', 'key', 1, 0, 1)", /CHECK constraint failed/i);
  expectSqlFailure(`INSERT INTO shared_rate_limits (limiter, limiter_key, count, window_started_at, expires_at) VALUES ('sell', '${'x'.repeat(257)}', 1, 0, 1)`, /CHECK constraint failed/i);

  sql("INSERT INTO vehicles (id, slug, title, brand, model, created_at, updated_at) VALUES ('test-vehicle-1', 'test-slug-1', 'Test', 'Test', 'Model', 'now', 'now')");
  sql("INSERT INTO vehicles (id, slug, title, brand, model, source, external_id, created_at, updated_at) VALUES ('test-vehicle-2', 'test-slug-2', 'Test', 'Test', 'Model', 'fixture', 'external-1', 'now', 'now')");
  expectSqlFailure("INSERT INTO vehicles (id, slug, title, brand, model, created_at, updated_at) VALUES ('test-vehicle-3', 'test-slug-1', 'Test', 'Test', 'Model', 'now', 'now')", /UNIQUE constraint failed/i);
  expectSqlFailure("INSERT INTO vehicles (id, slug, title, brand, model, source, external_id, created_at, updated_at) VALUES ('test-vehicle-4', 'test-slug-4', 'Test', 'Test', 'Model', 'fixture', 'external-1', 'now', 'now')", /UNIQUE constraint failed/i);
  sql("INSERT INTO admin_users (id, username, password_hash, created_at) VALUES ('test-admin-1', 'test-user', 'synthetic', 'now')");
  expectSqlFailure("INSERT INTO admin_users (id, username, password_hash, created_at) VALUES ('test-admin-2', 'test-user', 'synthetic', 'now')", /UNIQUE constraint failed/i);

  sql("INSERT INTO vehicle_images (id, vehicle_id, url, created_at) VALUES ('test-image-1', 'test-vehicle-1', 'https://example.invalid/synthetic', 'now')");
  sql("INSERT INTO import_mappings (id, source, external_id, vehicle_id, last_imported_at) VALUES ('test-mapping-1', 'fixture', 'mapping-1', 'test-vehicle-1', 'now')");
  sql("INSERT INTO admin_sessions (id, user_id, expires_at, created_at) VALUES ('test-session-1', 'test-admin-1', 'later', 'now')");
  sql("DELETE FROM vehicles WHERE id = 'test-vehicle-1'");
  sql("DELETE FROM admin_users WHERE id = 'test-admin-1'");
  for (const table of ['vehicle_images', 'import_mappings', 'admin_sessions']) {
    assert.equal(sql(`SELECT COUNT(*) AS count FROM ${table}`).at(0).count, 0, `${table} cascade cleanup`);
  }

  const secondApply = migrate();
  assert.doesNotMatch(secondApply, /error|failed/i, 'migration reapplication must succeed');
  assert.deepEqual(sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_METADATA' ORDER BY name").map((row) => row.name), tables, 'reapply preserves schema');
  assert.equal(sql("SELECT COUNT(*) AS count FROM vehicles WHERE id = 'test-vehicle-2'").at(0).count, 1, 'reapply preserves existing synthetic data');
  sql("DELETE FROM vehicles WHERE id = 'test-vehicle-2'");
  assert.equal(sql('SELECT COUNT(*) AS count FROM vehicles').at(0).count, 0, 'synthetic vehicle cleanup');
  console.log('D1 local schema migration checks passed.');
} finally {
  rmSync(persistRoot, { recursive: true, force: true });
}
