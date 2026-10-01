import { MAX_JSON_BIND_BYTES, MAX_VEHICLES, PUBLIC_SOURCE, type PublicSnapshot, VEHICLE_FIELDS } from './public-source-snapshot';

type D1Binding = NonNullable<CloudflareEnv['DB_PREVIEW']>;

export class PublicSyncConflict extends Error {}

type Row = Record<string, unknown>;
type TableSpec = { table: string; key: string; fields: readonly string[] };
const TABLES: readonly TableSpec[] = [
  { table: 'vehicles', key: 'id', fields: VEHICLE_FIELDS },
  { table: 'vehicle_images', key: 'id', fields: ['id','vehicle_id','url','alt','sort_order','is_cover','created_at'] },
  { table: 'brand_aliases', key: 'source_brand', fields: ['source_brand','display_name','url_slug','icon_url','updated_at'] },
  { table: 'site_settings', key: 'key', fields: ['key','value','updated_at'] },
  { table: 'site_video_links', key: 'id', fields: ['id','title','url','thumbnail_url','sort_order','created_at'] },
];
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (spec: TableSpec, row: Row) => String(row[spec.key]);
function jsonSize(value: unknown) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
function assertBind(value: unknown, name: string) {
  if (jsonSize(value) > MAX_JSON_BIND_BYTES) throw new PublicSyncConflict(`${name} JSON bind exceeds 1.5 MiB`);
}
function keyed(rows: Row[], spec: TableSpec) { return new Map(rows.map((row) => [keyOf(spec, row), row])); }
function businessFields(spec: TableSpec) { return spec.fields.filter((field) => !['created_at','updated_at'].includes(field)); }

function mergeTable(spec: TableSpec, priorRows: Row[], targetRows: Row[], incomingRows: Row[]) {
  const oldMap = keyed(priorRows, spec), targetMap = keyed(targetRows, spec), incomingMap = keyed(incomingRows, spec);
  const merged: Row[] = [];
  for (const [key, incoming] of incomingMap) {
    const old = oldMap.get(key), target = targetMap.get(key);
    if (!old && target) throw new PublicSyncConflict(`${spec.table} identity collision: ${key}`);
    if (!target) {
      if (old) throw new PublicSyncConflict(`${spec.table} ${key} was deleted locally while still present in source`);
      merged.push(incoming);
      continue;
    }
    const row: Row = { ...incoming };
    for (const field of businessFields(spec)) {
      const sourceChanged = !equal(incoming[field], old![field]);
      const localChanged = !equal(target[field], old![field]);
      if (sourceChanged && localChanged && !equal(incoming[field], target[field])) {
        throw new PublicSyncConflict(`${spec.table} ${key} field ${field} changed on both sides`);
      }
      if (localChanged && !sourceChanged) row[field] = target[field];
    }
    for (const field of ['created_at','updated_at']) if (spec.fields.includes(field) && !equal(old![field], incoming[field])) {
      // Timestamp-only source changes are adopted unless a business-field edit is retained.
      const localBusinessEdit = businessFields(spec).some((name) => !equal(target[name], old![name]));
      if (localBusinessEdit) row[field] = target[field];
    }
    merged.push(row);
  }
  const removed: Row[] = [];
  for (const [key, old] of oldMap) {
    if (incomingMap.has(key)) continue;
    const target = targetMap.get(key);
    if (!target) continue;
    if (spec.table === 'vehicles') {
      const archived = { ...target, status: 'archived' };
      merged.push(archived);
      continue;
    }
    if (businessFields(spec).some((field) => !equal(target[field], old[field]))) {
      throw new PublicSyncConflict(`${spec.table} ${key} changed locally before source withdrawal`);
    }
    removed.push(old);
  }
  return { rows: merged, removed };
}

function insertStatement(db: D1Binding, spec: TableSpec, rows: Row[]) {
  const columns = spec.fields;
  const select = columns.map((column) => `json_extract(value,'$.${column}')`).join(',');
  const updates = columns.filter((column) => column !== spec.key).map((column) => `${column}=excluded.${column}`).join(',');
  return db.prepare(`INSERT INTO ${spec.table} (${columns.join(',')}) SELECT ${select} FROM json_each(?) WHERE 1 ON CONFLICT(${spec.key}) DO UPDATE SET ${updates}`)
    .bind(JSON.stringify(rows));
}

export async function applyPublicSnapshot(db: D1Binding, snapshot: PublicSnapshot, mapped: PublicSnapshot, expectedRevision?: number) {
  // Revision is deliberately read before ownership baseline and data rows.
  const currentRevision = await db.prepare('SELECT revision FROM public_data_revision WHERE id = 1').first<{ revision: number }>();
  if (!currentRevision || (expectedRevision !== undefined && currentRevision.revision !== expectedRevision)) {
    throw new PublicSyncConflict('public data changed during snapshot preparation');
  }
  const baselineRows = await db.prepare('SELECT baseline_json, captured_at, source_body_hash FROM source_sync_state WHERE source = ?').bind(PUBLIC_SOURCE).all<{ baseline_json: string; captured_at: string; source_body_hash: string }>();
  const baseline = baselineRows.results[0];
  const capture = Date.parse(snapshot.captured_at);
  if (baseline && capture < Date.parse(baseline.captured_at)) throw new PublicSyncConflict('snapshot is stale');
  const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
  const hash = [...new Uint8Array(hashBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (baseline && capture === Date.parse(baseline.captured_at)) {
    if (baseline.source_body_hash === hash) return { revision: currentRevision.revision, replay: true };
    throw new PublicSyncConflict('same captured_at has different snapshot body');
  }

  const previous = baseline ? JSON.parse(baseline.baseline_json) as PublicSnapshot : null;
  const prior = previous ?? { vehicles: [], vehicle_images: [], brand_aliases: [], site_settings: [], site_video_links: [] };
  if (prior.vehicles.length > MAX_VEHICLES) throw new PublicSyncConflict('previous baseline exceeds vehicle limit');
  assertBind(prior, 'previous baseline');
  for (const [table, rows] of Object.entries({ vehicles: prior.vehicles, vehicle_images: prior.vehicle_images, brand_aliases: prior.brand_aliases, site_settings: prior.site_settings, site_video_links: prior.site_video_links })) {
    assertBind(rows, `previous baseline ${table}`);
  }
  const data: Record<string, Row[]> = {
    vehicles: mapped.vehicles.map((row) => {
      const original = snapshot.vehicles.find((candidate) => candidate.id === row.id);
      return original ? { ...row, source: original.source, external_id: original.external_id } : row;
    }),
    vehicle_images: mapped.vehicle_images,
    brand_aliases: mapped.brand_aliases,
    site_settings: mapped.site_settings,
    site_video_links: mapped.site_video_links,
  };
  const priorData: Record<string, Row[]> = {
    vehicles: prior.vehicles, vehicle_images: prior.vehicle_images, brand_aliases: prior.brand_aliases,
    site_settings: prior.site_settings, site_video_links: prior.site_video_links,
  };
  const baselineVehicles = [...data.vehicles];
  const incomingVehicleIds = new Set(data.vehicles.map((row) => String(row.id)));
  for (const old of priorData.vehicles) if (!incomingVehicleIds.has(String(old.id))) {
    baselineVehicles.push({ ...old, status: 'archived' });
  }
  const mappedBaseline: PublicSnapshot = { ...snapshot, ...data, vehicles: baselineVehicles } as PublicSnapshot;
  if (mappedBaseline.vehicles.length > MAX_VEHICLES) throw new PublicSyncConflict('mapped baseline exceeds vehicle limit');
  assertBind(mappedBaseline, 'mapped baseline');
  const targets: Record<string, Row[]> = {};
  for (const spec of TABLES) {
    const ids = [...new Set([...priorData[spec.table].map((row) => keyOf(spec, row)), ...data[spec.table].map((row) => keyOf(spec, row))])];
    assertBind(ids, `${spec.table} target identities`);
    targets[spec.table] = ids.length
      ? (await db.prepare(`SELECT ${spec.fields.join(',')}${spec.table === 'vehicles' ? ',local_edits_json' : ''} FROM ${spec.table} WHERE ${spec.key} IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Row>()).results
      : [];
  }

  const merged: Record<string, Row[]> = {}, removed: Record<string, Row[]> = {};
  for (const spec of TABLES) {
    const result = mergeTable(spec, priorData[spec.table], targets[spec.table], data[spec.table]);
    merged[spec.table] = result.rows;
    removed[spec.table] = result.removed;
  }
  const mergedVehicles = merged.vehicles;
  const mergedIds = new Set(mergedVehicles.map((row) => String(row.id)));
  const mergedSlugs = new Set<string>();
  for (const row of mergedVehicles) {
    const slug = String(row.slug);
    if (mergedSlugs.has(slug)) throw new PublicSyncConflict(`vehicles slug collision: ${slug}`);
    mergedSlugs.add(slug);
  }
  const slugs = [...mergedSlugs];
  assertBind(slugs, 'vehicle slugs');
  assertBind([...mergedIds], 'merged vehicle identities');
  if (slugs.length) {
    const collisions = await db.prepare(`SELECT id, slug FROM vehicles WHERE slug IN (SELECT value FROM json_each(?)) AND id NOT IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(slugs), JSON.stringify([...mergedIds])).all<{ id: string; slug: string }>();
    if (collisions.results.length) throw new PublicSyncConflict(`vehicles slug collision: ${collisions.results[0].slug}`);
  }
  // Incoming image IDs are never permitted to reparent a row owned by another vehicle.
  const incomingVehicleById = new Map(mapped.vehicles.map((row) => [String(row.id), row]));
  for (const image of mapped.vehicle_images) {
    const existing = targets.vehicle_images.find((row) => row.id === image.id);
    if (existing && existing.vehicle_id !== image.vehicle_id) throw new PublicSyncConflict(`vehicle_images identity collision: ${image.id}`);
    if (!incomingVehicleById.has(String(image.vehicle_id))) throw new PublicSyncConflict(`vehicle image has unknown target: ${image.id}`);
  }
  for (const rows of Object.values(merged)) assertBind(rows, 'merged rows');
  assertBind(snapshot, 'source snapshot');
  for (const spec of TABLES) assertBind(removed[spec.table].map((row) => keyOf(spec, row)), `${spec.table} removals`);

  const statements = [
    db.prepare('INSERT INTO public_sync_guard (expected_revision) VALUES (?)').bind(currentRevision.revision),
  ];
  for (const spec of TABLES) {
    const removedIds = removed[spec.table].map((row) => keyOf(spec, row));
    if (removedIds.length) statements.push(db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.key} IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(removedIds)));
    if (merged[spec.table].length) statements.push(insertStatement(db, spec, merged[spec.table]));
  }
  statements.push(db.prepare('UPDATE public_data_revision SET revision = revision + 1 WHERE id = 1'));
  const mappedBaselineJson = JSON.stringify(mappedBaseline);
  assertBind(mappedBaselineJson, 'persisted mapped baseline');
  statements.push(db.prepare(`INSERT INTO source_sync_state (source,baseline_json,captured_at,source_body_hash) VALUES (?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET baseline_json=excluded.baseline_json,captured_at=excluded.captured_at,source_body_hash=excluded.source_body_hash`).bind(PUBLIC_SOURCE, mappedBaselineJson, snapshot.captured_at, hash));
  statements.push(db.prepare('DELETE FROM public_sync_guard'));
  if (statements.length > 50) throw new Error('public sync statement cap exceeded');
  try { await db.batch(statements); }
  catch (error) {
    if (String(error).includes('public_sync_guard')) throw new PublicSyncConflict('public data revision changed concurrently');
    throw error;
  }
  const postRevision = await db.prepare('SELECT revision FROM public_data_revision WHERE id = 1').first<{ revision: number }>();
  return { revision: postRevision?.revision ?? currentRevision.revision, replay: false };
}
