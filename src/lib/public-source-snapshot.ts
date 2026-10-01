import { isAllowedPublicSource } from './public-source-media';

export const PUBLIC_SOURCE = 'mita-public';
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_VEHICLES = 1_000;
export const MAX_IMAGES = 20_000;
export const MAX_JSON_BIND_BYTES = 1.5 * 1024 * 1024;

export const PUBLIC_SETTING_KEYS = [
  'siteName','siteIconUrl','salespersonName','lineUrl','instagramUrl','facebookUrl','threadsUrl','tiktokUrl',
  'phoneNumber','storeAddress','businessHours','homepageEyebrow','homepageTitle','homepageLead','homepageNote',
  'homepageBadge','featuredEyebrow','featuredTitle','featuredCount','listingEyebrow','listingTitle','listingLead',
  'cardTitleTemplate','detailNotesEyebrow','detailNotesTitle','shareMessageTemplate','detailSpecFields',
  'footerDisclaimer','heroVehicleSlug','activeTemplate','activeStyle','showSoldVehicles','socialIcons','galleryMode',
  'heroVideos','videoSectionPosition','videoLinksSectionTitle','featureMask',
] as const;

export const VEHICLE_FIELDS = [
  'id','slug','title','card_title_supplement','brand','model','sub_model','year','mileage','exterior_color',
  'interior_color','condition','status','headline','description','features_json','monthly_recommended','show_sold_case',
  'source','external_id','sold_at','created_at','updated_at',
] as const;
export const IMAGE_FIELDS = ['id','vehicle_id','url','alt','sort_order','is_cover','created_at'] as const;
export const ALIAS_FIELDS = ['source_brand','display_name','url_slug','icon_url','updated_at'] as const;
export const VIDEO_FIELDS = ['id','title','url','thumbnail_url','sort_order','created_at'] as const;

type ObjectRow = Record<string, unknown>;
export interface PublicSnapshot extends ObjectRow {
  captured_at: string;
  vehicles: ObjectRow[];
  vehicle_images: ObjectRow[];
  brand_aliases: ObjectRow[];
  site_settings: ObjectRow[];
  site_video_links: ObjectRow[];
}

export class SnapshotValidationError extends Error {}

function object(value: unknown, name: string): ObjectRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SnapshotValidationError(`${name} must be an object`);
  return value as ObjectRow;
}

function exactKeys(value: ObjectRow, keys: readonly string[], name: string) {
  const allowed = new Set(keys);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new SnapshotValidationError(`${name} has unknown fields: ${extra.join(', ')}`);
}

function unique(values: unknown[], name: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || !value || seen.has(value)) throw new SnapshotValidationError(`${name} must be non-empty and unique`);
    seen.add(value);
  }
}

function jsonField(value: unknown, name: string) {
  if (typeof value !== 'string') throw new SnapshotValidationError(`${name} must be a JSON string`);
  try { JSON.parse(value); } catch { throw new SnapshotValidationError(`${name} is malformed JSON`); }
}

export function parsePublicSnapshot(bytes: Uint8Array): PublicSnapshot {
  if (bytes.byteLength > MAX_SNAPSHOT_BYTES) throw new SnapshotValidationError('snapshot exceeds 5 MiB');
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new SnapshotValidationError('body must be valid UTF-8 JSON'); }
  const body = object(raw, 'snapshot');
  exactKeys(body, ['schema_version','captured_at','source','visibility','projection','vehicles','vehicle_images','brand_aliases','site_settings','site_video_links'], 'snapshot');
  if (body.schema_version !== 1) throw new SnapshotValidationError('unsupported schema_version');
  if (typeof body.captured_at !== 'string' || !Number.isFinite(Date.parse(body.captured_at))) throw new SnapshotValidationError('captured_at must be an ISO timestamp');
  const source = object(body.source, 'source');
  exactKeys(source, ['name','origin','host','container','database_path','readonly','public_snapshot_complete'], 'source');
  if (source.name !== PUBLIC_SOURCE || source.origin !== 'https://mita.sisihome.org' || source.readonly !== true || source.public_snapshot_complete !== true || !['host','container','database_path'].every((key) => typeof source[key] === 'string')) throw new SnapshotValidationError('invalid public source descriptor');
  const visibility = object(body.visibility, 'visibility');
  exactKeys(visibility, ['always_public_statuses', 'show_sold_vehicles'], 'visibility');
  const expectedStatuses = ['published', 'incoming', 'reserved', 'special', 'unknown'];
  if (JSON.stringify(visibility.always_public_statuses) !== JSON.stringify(expectedStatuses)) throw new SnapshotValidationError('visibility.always_public_statuses does not match the public contract');
  if (typeof visibility.show_sold_vehicles !== 'boolean') throw new SnapshotValidationError('visibility.show_sold_vehicles must be boolean');
  const projection = object(body.projection, 'projection');
  exactKeys(projection, ['excluded', 'feature_mask', 'heroVideos'], 'projection');
  const expectedExclusions = ['admin_users','admin_sessions','sell_inquiries','import_mappings','local_edits_json','openCode.*','SMTP/auth/credentials','raw featureLicenseMask','hero conversion diagnostics'];
  if (JSON.stringify(projection.excluded) !== JSON.stringify(expectedExclusions) || projection.feature_mask !== 'public effective mask only' || projection.heroVideos !== 'id and effective public playback/poster/label only') throw new SnapshotValidationError('projection does not match the public contract');
  const arrays = ['vehicles','vehicle_images','brand_aliases','site_settings','site_video_links'] as const;
  for (const key of arrays) if (!Array.isArray(body[key])) throw new SnapshotValidationError(`${key} must be an array`);
  const vehicles = body.vehicles as ObjectRow[];
  const images = body.vehicle_images as ObjectRow[];
  const aliases = body.brand_aliases as ObjectRow[];
  const settings = body.site_settings as ObjectRow[];
  const videos = body.site_video_links as ObjectRow[];
  if (vehicles.length > MAX_VEHICLES || images.length > MAX_IMAGES) throw new SnapshotValidationError('snapshot row limit exceeded');
  for (const [name, value] of Object.entries({ vehicles, vehicle_images: images, brand_aliases: aliases, site_settings: settings, site_video_links: videos })) {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_JSON_BIND_BYTES) throw new SnapshotValidationError(`${name} exceeds 1.5 MiB JSON bind limit`);
  }
  const validateRowKeys = (rows: ObjectRow[], fields: readonly string[], table: string) => rows.forEach((row, i) => {
    object(row, `${table}[${i}]`);
    exactKeys(row, fields, `${table}[${i}]`);
    const missing = fields.filter((field) => !(field in row));
    if (missing.length) throw new SnapshotValidationError(`${table}[${i}] is missing fields: ${missing.join(', ')}`);
  });
  validateRowKeys(vehicles, VEHICLE_FIELDS, 'vehicles');
  validateRowKeys(images, IMAGE_FIELDS, 'vehicle_images');
  validateRowKeys(aliases, ALIAS_FIELDS, 'brand_aliases');
  validateRowKeys(videos, VIDEO_FIELDS, 'site_video_links');
  validateRowKeys(settings, ['key','value','updated_at'], 'site_settings');
  const requiredStringFields: Record<string, readonly string[]> = {
    vehicles: ['id','slug','title','brand','model','condition','status','headline','description','features_json','source','created_at','updated_at'],
    vehicle_images: ['id','url','alt','created_at'], brand_aliases: ['source_brand','display_name','url_slug','updated_at'],
    site_video_links: ['id','title','url','created_at'], site_settings: ['key','value','updated_at'],
  };
  for (const [table, rows] of Object.entries({ vehicles, vehicle_images: images, brand_aliases: aliases, site_video_links: videos, site_settings: settings })) {
    for (const [index, row] of rows.entries()) for (const field of requiredStringFields[table]) {
      if (typeof row[field] !== 'string') throw new SnapshotValidationError(`${table}[${index}].${field} must be a string`);
    }
  }
  for (const [table, rows, fields] of [['vehicles', vehicles, ['year','mileage','exterior_color','interior_color','sub_model','card_title_supplement']], ['vehicles', vehicles, ['external_id','sold_at']], ['vehicle_images', images, ['vehicle_id']], ['brand_aliases', aliases, ['icon_url']], ['site_video_links', videos, ['thumbnail_url']]] as const) {
    for (const [index, row] of rows.entries()) for (const field of fields) {
      const value = row[field];
      if (value !== null && typeof value !== 'string') throw new SnapshotValidationError(`${table}[${index}].${field} must be a string or null`);
    }
  }
  for (const [index, row] of vehicles.entries()) for (const field of ['monthly_recommended','show_sold_case']) {
    if (row[field] !== 0 && row[field] !== 1) throw new SnapshotValidationError(`vehicles[${index}].${field} must be 0 or 1`);
  }
  for (const [index, row] of images.entries()) {
    if (!Number.isInteger(row.sort_order) || (row.is_cover !== 0 && row.is_cover !== 1)) throw new SnapshotValidationError(`vehicle_images[${index}] has invalid numeric values`);
  }
  for (const [index, row] of videos.entries()) if (!Number.isInteger(row.sort_order)) throw new SnapshotValidationError(`site_video_links[${index}].sort_order must be an integer`);
  unique(vehicles.map((row) => row.id), 'vehicle ids'); unique(vehicles.map((row) => row.slug), 'vehicle slugs');
  unique(images.map((row) => row.id), 'image ids'); unique(aliases.map((row) => row.source_brand), 'alias keys');
  unique(settings.map((row) => row.key), 'setting keys'); unique(videos.map((row) => row.id), 'video ids');
  const vehicleIds = new Set(vehicles.map((row) => row.id));
  if (images.some((row) => !vehicleIds.has(String(row.vehicle_id)))) throw new SnapshotValidationError('image references a non-public vehicle');
  const visibleStatuses = new Set(['published','incoming','reserved','special','unknown']);
  if (vehicles.some((row) => typeof row.status !== 'string' || !(visibleStatuses.has(row.status) || (visibility.show_sold_vehicles && row.status === 'sold')))) throw new SnapshotValidationError('snapshot includes a non-public vehicle');
  if (vehicles.some((row) => typeof row.features_json !== 'string' || !['0','1'].includes(String(row.monthly_recommended)) || !['0','1'].includes(String(row.show_sold_case)))) throw new SnapshotValidationError('invalid vehicle values');
  vehicles.forEach((row) => jsonField(row.features_json, 'features_json'));
  const allowedSettings = new Set<string>(PUBLIC_SETTING_KEYS);
  if (settings.some((row) => typeof row.key !== 'string' || !allowedSettings.has(row.key) || typeof row.value !== 'string' || typeof row.updated_at !== 'string')) throw new SnapshotValidationError('unknown or malformed public setting');
  for (const key of ['socialIcons','heroVideos']) {
    const row = settings.find((item) => item.key === key);
    if (row) jsonField(row.value, key);
  }
  return { ...body, captured_at: body.captured_at, vehicles, vehicle_images: images, brand_aliases: aliases, site_settings: settings, site_video_links: videos } as PublicSnapshot;
}

export function publicAssetReferences(snapshot: PublicSnapshot): string[] {
  const refs = new Set<string>();
  const add = (value: unknown, required = false) => {
    if (typeof value !== 'string' || !value) {
      if (required) throw new SnapshotValidationError('vehicle image URL must be a public media URL');
      return;
    }
    const normalized = value.startsWith('/media/') || value.startsWith('/brand-icons/') ? `https://mita.sisihome.org${value}` : value;
    if (!isAllowedPublicSource(normalized)) {
      if (required) throw new SnapshotValidationError('vehicle image URL must be a public media URL');
      return;
    }
    refs.add(normalized);
  };
  snapshot.vehicle_images.forEach((row) => add(row.url, true));
  snapshot.brand_aliases.forEach((row) => add(row.icon_url));
  const settings = new Map(snapshot.site_settings.map((row) => [String(row.key), String(row.value)]));
  add(settings.get('siteIconUrl'));
  for (const key of ['socialIcons','heroVideos']) {
    const raw = settings.get(key);
    if (!raw) continue;
    const parsed: unknown = JSON.parse(raw);
    const visit = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') for (const [field, child] of Object.entries(value)) {
        if (['url','thumbnailUrl'].includes(field)) add(child);
        else visit(child);
      }
    };
    visit(parsed);
  }
  snapshot.site_video_links.forEach((row) => add(row.thumbnail_url));
  return [...refs];
}
