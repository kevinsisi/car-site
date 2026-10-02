import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { createD1Db } from '@/db/d1';
import { importMappings, vehicleImages, vehicles, type PublishMode, type VehicleStatus } from '@/db/schema';
import { brandUrlSlug, getBrandAliasMap } from './brand-aliases';
import { getSettings } from './settings';
import type { SiteSettings } from './settings';
import { alwaysPublicVehicleStatuses, isPublicVehicleStatus, mapSourceInventoryStatus } from './vehicle-status';

const WORKER_PUBLIC_VEHICLE_LIMIT = 100;
const MAX_PRESERVED_VEHICLE_IMAGES = 20_000;

type VehicleReadDb = Awaited<ReturnType<typeof createD1Db>>;
type VehicleWriteDb = VehicleReadDb;

export interface VehicleReadContext {
  settings: SiteSettings;
  brandAliasMap: Awaited<ReturnType<typeof getBrandAliasMap>>;
}

const requestReadContexts = new WeakMap<object, Promise<VehicleReadContext>>();
const adapterReadContexts = new WeakMap<object, VehicleReadContext>();

export async function getVehicleReadContext(locals: object, adapter?: VehicleReadDb, settings?: SiteSettings): Promise<VehicleReadContext> {
  let context = requestReadContexts.get(locals);
  if (!context) {
    context = Promise.all([settings ?? getSettings(adapter), getBrandAliasMap(adapter)]).then(([settings, brandAliasMap]) => ({ settings, brandAliasMap }));
    requestReadContexts.set(locals, context);
  }
  const result = await context;
  if (adapter) adapterReadContexts.set(adapter, result);
  return result;
}

function cachedReadContext(adapter?: VehicleReadDb, context?: VehicleReadContext): VehicleReadContext | undefined {
  return context ?? (adapter ? adapterReadContexts.get(adapter) : undefined);
}

async function vehicleDb(adapter?: VehicleWriteDb): Promise<VehicleWriteDb> {
  if (adapter) return adapter;
  return (await import('@/db/connection')).db as unknown as VehicleWriteDb;
}

export interface VehicleImageView {
  id: string;
  url: string;
  thumbUrl: string; // 600px WebP thumbnail (falls back to url if not generated yet)
  alt: string;
  sortOrder: number;
  isCover: boolean;
}

export interface VehicleView {
  id: string;
  slug: string;
  title: string;
  cardTitle: string;
  cardTitleSupplement: string;
  brand: string;
  brandDisplayName: string;
  brandUrlSlug: string;
  brandIconUrl: string | null;
  model: string;
  subModel: string;
  year: string;
  mileage: string;
  exteriorColor: string;
  interiorColor: string;
  condition: string;
  status: VehicleStatus;
  headline: string;
  description: string;
  features: string[];
  monthlyRecommended: boolean;
  showSoldCase: boolean;
  source: string;
  externalId: string | null;
  images: VehicleImageView[];
  coverImage: VehicleImageView | null;
  createdAt: string;
  updatedAt: string;
  soldAt: string | null;
}

function parseFeatures(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function slugify(input: string): string {
  return input
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90) || `vehicle-${Date.now()}`;
}

function normalizeRouteSlug(input: string | undefined | null): string {
  return String(input || '')
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/^https?:\/\/[^/]+\/cars\//i, '')
    .replace(/^\/?cars\//i, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 90);
}

async function findVehicleBySlugInsensitive(slug: string, adapter?: VehicleReadDb): Promise<(typeof vehicles.$inferSelect) | undefined> {
  const normalized = normalizeRouteSlug(slug);
  if (!normalized) return undefined;
  const reader = await vehicleDb(adapter);
  const [row] = await reader
    .select()
    .from(vehicles)
    .where(sql`lower(${vehicles.slug}) = lower(${normalized})`)
    .limit(1);
  return row;
}

function cleanTemplateOutput(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function formatCardTitle(template: string, row: typeof vehicles.$inferSelect, brandDisplayName: string): string {
  const variables: Record<string, string> = {
    車名: row.title,
    年份: row.year,
    品牌: row.brand,
    顯示品牌: brandDisplayName,
    型號: row.model,
    規格: row.subModel,
    補充: row.cardTitleSupplement,
    里程: row.mileage,
    車況: row.condition,
  };
  const rendered = template.replace(/\{([^}]+)\}/g, (_, key: string) => variables[key] || '');
  return cleanTemplateOutput(rendered) || row.title;
}

async function attachImages(rows: (typeof vehicles.$inferSelect)[], adapter?: VehicleReadDb, context?: VehicleReadContext, includeAllImages = !cachedReadContext(adapter, context)): Promise<VehicleView[]> {
  if (!rows.length) return [];
  const reader = await vehicleDb(adapter);
  const readContext: VehicleReadContext = cachedReadContext(adapter, context) ?? await Promise.all([getBrandAliasMap(adapter), getSettings(adapter)]).then(([brandAliasMap, settings]) => ({ brandAliasMap, settings }));
  const { brandAliasMap, settings } = readContext;
  const imageQuery = reader.select().from(vehicleImages);
  const images = includeAllImages
    ? await imageQuery
      .where(inArray(vehicleImages.vehicleId, rows.map((row) => row.id)))
      .orderBy(asc(vehicleImages.sortOrder), asc(vehicleImages.id))
    : await imageQuery
      .where(inArray(vehicleImages.id, sql`(
        SELECT (
          SELECT preferred.id
          FROM vehicle_images AS preferred
          WHERE preferred.vehicle_id = requested_vehicles.value
          ORDER BY preferred.is_cover DESC, preferred.sort_order ASC, preferred.id ASC
          LIMIT 1
        )
        FROM json_each(${JSON.stringify(rows.map((row) => row.id))}) AS requested_vehicles
      )`));
  const imageMap = new Map<string, VehicleImageView[]>();
  const resolveMediaPair = adapter
    ? (url: string) => ({ url, thumbUrl: url })
    : (await import('./media')).resolveMediaPair;
  for (const image of images) {
    const list = imageMap.get(image.vehicleId) || [];
    const media = resolveMediaPair(image.url);
    list.push({ id: image.id, url: media.url, thumbUrl: media.thumbUrl, alt: image.alt, sortOrder: image.sortOrder, isCover: image.isCover });
    imageMap.set(image.vehicleId, list);
  }
  return rows.map((row) => {
    const rowImages = imageMap.get(row.id) || [];
    const brandAlias = brandAliasMap.get(row.brand);
    const brandDisplayName = brandAlias?.displayName || row.brand;
    const routeBrandSlug = brandAlias?.urlSlug || brandUrlSlug(brandDisplayName);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      cardTitle: formatCardTitle(settings.cardTitleTemplate, row, brandDisplayName),
      cardTitleSupplement: row.cardTitleSupplement,
      brand: row.brand,
      brandDisplayName,
      brandUrlSlug: routeBrandSlug,
      brandIconUrl: brandAlias?.iconUrl ?? null,
      model: row.model,
      subModel: row.subModel,
      year: row.year,
      mileage: row.mileage,
      exteriorColor: row.exteriorColor,
      interiorColor: row.interiorColor,
      condition: row.condition,
      status: row.status as VehicleStatus,
      headline: row.headline,
      description: row.description,
      features: parseFeatures(row.featuresJson),
      monthlyRecommended: row.monthlyRecommended,
      showSoldCase: row.showSoldCase,
      source: row.source,
      externalId: row.externalId,
      images: rowImages,
      coverImage: rowImages.find((image) => image.isCover) || rowImages[0] || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      soldAt: row.soldAt,
    };
  });
}

export async function listPublicBrands(adapter?: VehicleReadDb, context?: VehicleReadContext): Promise<{ displayName: string; urlSlug: string; count: number; iconUrl: string | null }[]> {
  const reader = await vehicleDb(adapter);
  const brandQuery = reader.select({ brand: vehicles.brand }).from(vehicles).where(inArray(vehicles.status, alwaysPublicVehicleStatuses));
  const allVehicles = adapter
    ? await brandQuery.orderBy(desc(vehicles.updatedAt), asc(vehicles.id)).limit(WORKER_PUBLIC_VEHICLE_LIMIT)
    : await brandQuery;
  const brandAliasMap = cachedReadContext(adapter, context)?.brandAliasMap ?? await getBrandAliasMap(adapter);
  const countMap = new Map<string, { displayName: string; urlSlug: string; count: number; iconUrl: string | null }>();
  for (const vehicle of allVehicles) {
    const brandAlias = brandAliasMap.get(vehicle.brand);
    const displayName = brandAlias?.displayName || vehicle.brand;
    const urlSlug = brandAlias?.urlSlug || brandUrlSlug(displayName);
    if (!urlSlug) continue;
    const key = urlSlug;
    const current = countMap.get(key) || {
      displayName,
      urlSlug,
      count: 0,
      iconUrl: brandAlias?.iconUrl ?? null,
    };
    current.count += 1;
    countMap.set(key, current);
  }
  return [...countMap.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listPublicVehiclesByBrand(urlSlug: string, adapter?: VehicleReadDb, context?: VehicleReadContext): Promise<VehicleView[]> {
  return (await listPublicInventoryVehicles(adapter, context)).filter((vehicle) => vehicle.brandUrlSlug === urlSlug);
}

export async function listPublicVehicles(adapter?: VehicleReadDb, context?: VehicleReadContext): Promise<VehicleView[]> {
  const reader = await vehicleDb(adapter);
  const settings = cachedReadContext(adapter, context)?.settings ?? await getSettings(adapter);
  const statusFilter = inArray(vehicles.status, settings.showSoldVehicles ? [...alwaysPublicVehicleStatuses, 'sold'] : alwaysPublicVehicleStatuses);
  const query = reader.select().from(vehicles).where(statusFilter);
  const rows = adapter
    ? await query.orderBy(desc(vehicles.updatedAt), asc(vehicles.id)).limit(WORKER_PUBLIC_VEHICLE_LIMIT)
    : await query.orderBy(desc(vehicles.updatedAt));
  return attachImages(rows, adapter, context);
}

export async function listMonthlyRecommendedVehicles(adapter?: VehicleReadDb, context?: VehicleReadContext): Promise<VehicleView[]> {
  const reader = await vehicleDb(adapter);
  const query = reader
    .select()
    .from(vehicles)
    .where(and(inArray(vehicles.status, alwaysPublicVehicleStatuses), eq(vehicles.monthlyRecommended, true)));
  const rows = adapter
    ? await query.orderBy(desc(vehicles.updatedAt), asc(vehicles.id)).limit(WORKER_PUBLIC_VEHICLE_LIMIT)
    : await query.orderBy(desc(vehicles.updatedAt));
  return attachImages(rows, adapter, context);
}

export async function listPublicInventoryVehicles(adapter?: VehicleReadDb, context?: VehicleReadContext): Promise<VehicleView[]> {
  const reader = await vehicleDb(adapter);
  const query = reader.select().from(vehicles).where(inArray(vehicles.status, alwaysPublicVehicleStatuses));
  const rows = adapter
    ? await query.orderBy(desc(vehicles.updatedAt), asc(vehicles.id)).limit(WORKER_PUBLIC_VEHICLE_LIMIT)
    : await query.orderBy(desc(vehicles.updatedAt));
  return attachImages(rows, adapter, context);
}

export async function listSoldVehicles(adapter?: VehicleReadDb, context?: VehicleReadContext): Promise<VehicleView[]> {
  const settings = cachedReadContext(adapter, context)?.settings ?? await getSettings(adapter);
  if (!settings.showSoldVehicles) return [];
  const reader = await vehicleDb(adapter);
  const query = reader.select().from(vehicles).where(eq(vehicles.status, 'sold'));
  const rows = adapter
    ? await query.orderBy(desc(vehicles.soldAt), desc(vehicles.updatedAt), asc(vehicles.id)).limit(WORKER_PUBLIC_VEHICLE_LIMIT)
    : await query.orderBy(desc(vehicles.soldAt), desc(vehicles.updatedAt));
  return attachImages(rows, adapter, context);
}

export async function listSoldCaseVehicles(limit = 6, adapter?: VehicleReadDb, context?: VehicleReadContext): Promise<VehicleView[]> {
  const settings = cachedReadContext(adapter, context)?.settings ?? await getSettings(adapter);
  if (!settings.showSoldVehicles) return [];
  const reader = await vehicleDb(adapter);
  const rows = await reader
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.status, 'sold'), eq(vehicles.showSoldCase, true)))
    .orderBy(desc(vehicles.soldAt), desc(vehicles.updatedAt))
    .limit(adapter ? Math.min(limit, WORKER_PUBLIC_VEHICLE_LIMIT) : limit);
  return attachImages(rows, adapter, context);
}

export async function listAdminVehicles(adapter?: VehicleReadDb, limit?: number): Promise<VehicleView[]> {
  const reader = await vehicleDb(adapter);
  const query = reader.select().from(vehicles).where(ne(vehicles.status, 'archived'));
  const rows = limit === undefined
    ? await query.orderBy(desc(vehicles.updatedAt))
    : await query.orderBy(desc(vehicles.updatedAt), asc(vehicles.id)).limit(limit);
  return attachImages(rows, adapter, undefined, true);
}

export async function getVehicleBySlug(slug: string, adapter?: VehicleReadDb): Promise<VehicleView | null> {
  const reader = await vehicleDb(adapter);
  const rows = await reader.select().from(vehicles).where(eq(vehicles.slug, slug)).limit(1);
  const [vehicle] = await attachImages(rows, adapter);
  return vehicle || null;
}

export async function getVehicleDetailBySlug(slug: string, adapter?: VehicleReadDb): Promise<VehicleView | null> {
  const reader = await vehicleDb(adapter);
  const rows = await reader.select().from(vehicles).where(eq(vehicles.slug, slug)).limit(1);
  const [vehicle] = await attachImages(rows, adapter, cachedReadContext(adapter), true);
  return vehicle || null;
}

export async function upsertVehicle(input: {
  id?: string;
  slug?: string;
  title: string;
  cardTitleSupplement?: string;
  brand: string;
  model: string;
  subModel?: string;
  year?: string;
  mileage?: string;
  exteriorColor?: string;
  interiorColor?: string;
  condition?: string;
  status?: VehicleStatus;
  headline?: string;
  description?: string;
  features?: string[];
  monthlyRecommended?: boolean;
  showSoldCase?: boolean;
  source?: string;
  externalId?: string | null;
  images?: string[];
  preserveImportMetadata?: boolean;
}, adapter?: VehicleWriteDb) {
  if (input.preserveImportMetadata && input.images !== undefined && input.images.length > MAX_PRESERVED_VEHICLE_IMAGES) {
    throw new Error(`Cannot preserve imported image identities for more than ${MAX_PRESERVED_VEHICLE_IMAGES} images`);
  }
  const writer = await vehicleDb(adapter);
  const now = new Date().toISOString();
  const baseSlug = slugify(`${input.year || ''} ${input.brand} ${input.model} ${input.subModel || ''}`);
  const requestedSlug = normalizeRouteSlug(input.slug);
  const existingById = input.id ? await writer.select().from(vehicles).where(eq(vehicles.id, input.id)).limit(1) : [];
  const existingBySlug = requestedSlug ? await findVehicleBySlugInsensitive(requestedSlug, adapter) : undefined;
  const existing = existingById[0] || existingBySlug;
  const id = existing?.id || input.id || crypto.randomUUID();
  const slug = requestedSlug || existing?.slug || `${baseSlug}-${id.slice(0, 6)}`;
  const monthlyRecommended = input.monthlyRecommended ?? existing?.monthlyRecommended ?? false;
  const showSoldCase = input.showSoldCase ?? existing?.showSoldCase ?? false;
  const values = {
    id,
    slug,
    title: input.title,
    cardTitleSupplement: input.cardTitleSupplement ?? existing?.cardTitleSupplement ?? '',
    brand: input.brand,
    model: input.model,
    subModel: input.subModel || '',
    year: input.year || '',
    mileage: input.mileage || '',
    exteriorColor: input.exteriorColor || '',
    interiorColor: input.interiorColor || '',
    condition: input.condition || '嚴選車況',
    status: input.status || 'draft',
    headline: input.headline || '',
    description: input.description || '',
    featuresJson: JSON.stringify(input.features || []),
    monthlyRecommended,
    showSoldCase,
    source: input.preserveImportMetadata && input.source === undefined ? existing?.source ?? 'manual' : input.source || 'manual',
    externalId: input.preserveImportMetadata && input.externalId === undefined ? existing?.externalId ?? null : input.externalId || null,
    localEditsJson: input.preserveImportMetadata ? existing?.localEditsJson ?? JSON.stringify([]) : JSON.stringify([]),
    soldAt: input.status === 'sold' ? now : null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const statements: any[] = [writer.insert(vehicles).values(values).onConflictDoUpdate({ target: vehicles.id, set: values })];
  if (input.images !== undefined) {
    const imageUrls = input.images.filter(Boolean);
    const existingImages = input.preserveImportMetadata
      ? await writer.select().from(vehicleImages).where(eq(vehicleImages.vehicleId, id)).orderBy(asc(vehicleImages.sortOrder), asc(vehicleImages.id)).limit(MAX_PRESERVED_VEHICLE_IMAGES + 1)
      : [];
    if (existingImages.length > MAX_PRESERVED_VEHICLE_IMAGES) {
      throw new Error(`Cannot preserve imported image identities for more than ${MAX_PRESERVED_VEHICLE_IMAGES} retained rows`);
    }
    const availableByUrl = new Map<string, typeof existingImages>();
    for (const image of existingImages) {
      const matches = availableByUrl.get(image.url) || [];
      matches.push(image);
      availableByUrl.set(image.url, matches);
    }
    statements.push(writer.delete(vehicleImages).where(eq(vehicleImages.vehicleId, id)));
    for (const [sortOrder, url] of imageUrls.entries()) {
      const match = availableByUrl.get(url)?.shift();
      statements.push(writer.insert(vehicleImages).values({
        id: match?.id || crypto.randomUUID(),
        vehicleId: id,
        url,
        alt: input.title,
        sortOrder,
        isCover: sortOrder === 0,
        createdAt: match?.createdAt || now,
      }));
    }
  }
  if (adapter) await adapter.batch(statements as any);
  else for (const statement of statements) await statement;
  return id;
}

export async function updateVehicleStatus(id: string, status: VehicleStatus, adapter?: VehicleWriteDb) {
  const statement = (await vehicleDb(adapter)).update(vehicles).set({ status, soldAt: status === 'sold' ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(vehicles.id, id));
  if (adapter) await adapter.batch([statement] as any);
  else await statement;
}

export function publicVehicleStatus(value: VehicleStatus, showSoldVehicles = false): boolean {
  return isPublicVehicleStatus(value, showSoldVehicles);
}

export async function importVehicle(input: {
  source: string;
  externalId: string;
  slug?: string;
  title?: string;
  brand: string;
  model: string;
  subModel?: string;
  year?: string;
  mileage?: string;
  exteriorColor?: string;
  interiorColor?: string;
  condition?: string;
  headline?: string;
  description?: string;
  features?: string[];
  monthlyRecommended?: boolean;
  photos?: string[];
  status?: VehicleStatus;
  sourceStatus?: string;
  publishMode?: PublishMode;
}, adapter?: VehicleWriteDb) {
  const writer = await vehicleDb(adapter);
  const settings = await getSettings(adapter);
  const slug = normalizeRouteSlug(input.slug || input.externalId);
  const existingMapping = await writer
    .select()
    .from(importMappings)
    .where(and(sql`lower(${importMappings.source}) = lower(${input.source})`, sql`lower(${importMappings.externalId}) = lower(${input.externalId})`))
    .limit(1);
  const existingSlug = slug ? await findVehicleBySlugInsensitive(slug, adapter) : undefined;

  const hasPublicFields = Boolean(input.brand && input.model && (input.photos?.length || 0) > 0);
  const publishMode = input.publishMode || 'use_default';
  const status: VehicleStatus = (() => {
    if (input.status) return input.status;
    if (input.sourceStatus) return mapSourceInventoryStatus(input.sourceStatus);
    if (publishMode === 'draft') return 'draft';
    if (publishMode === 'publish') return hasPublicFields ? 'published' : 'draft';
    if (settings.importBehavior === 'auto_publish') return hasPublicFields ? 'published' : 'draft';
    if (settings.importBehavior === 'import_only') return 'unpublished';
    return 'draft';
  })();

  const vehicleInput = {
    id: existingSlug?.id || existingMapping[0]?.vehicleId,
    slug,
    title: input.title || [input.year, input.brand, input.model, input.subModel].filter(Boolean).join(' '),
    brand: input.brand,
    model: input.model,
    subModel: input.subModel,
    year: input.year,
    mileage: input.mileage,
    exteriorColor: input.exteriorColor,
    interiorColor: input.interiorColor,
    condition: input.condition,
    status,
    headline: input.headline,
    description: input.description,
    features: input.features,
    monthlyRecommended: input.monthlyRecommended,
    source: input.source,
    externalId: input.externalId,
    images: input.photos,
  };

  if (!adapter) {
    const vehicleId = await upsertVehicle(vehicleInput);
    const now = new Date().toISOString();
    if (existingMapping[0]?.id) {
      await writer.update(importMappings).set({ vehicleId, lastImportedAt: now }).where(eq(importMappings.id, existingMapping[0].id));
    } else {
      await writer.insert(importMappings).values({ id: crypto.randomUUID(), source: input.source, externalId: input.externalId, vehicleId, lastImportedAt: now })
        .onConflictDoUpdate({ target: [importMappings.source, importMappings.externalId], set: { vehicleId, lastImportedAt: now } });
    }
    return { vehicleId, status, published: status === 'published', validation: { hasPublicFields } };
  }

  // Prepare the vehicle statements without submitting them so vehicle, images,
  // and mapping are committed by the same D1 batch.
  const nowForVehicle = new Date().toISOString();
  const existingById = existingSlug?.id || existingMapping[0]?.vehicleId
    ? await writer.select().from(vehicles).where(eq(vehicles.id, existingSlug?.id || existingMapping[0]!.vehicleId)).limit(1)
    : [];
  const existing = existingById[0] || existingSlug;
  const vehicleId = existing?.id || existingSlug?.id || existingMapping[0]?.vehicleId || crypto.randomUUID();
  const actualSlug = slug || existing?.slug || `${slugify(`${input.year || ''} ${input.brand} ${input.model} ${input.subModel || ''}`)}-${vehicleId.slice(0, 6)}`;
  const vehicleValues = {
    id: vehicleId, slug: actualSlug,
    title: vehicleInput.title,
    cardTitleSupplement: existing?.cardTitleSupplement ?? '', brand: input.brand, model: input.model,
    subModel: input.subModel || '', year: input.year || '', mileage: input.mileage || '',
    exteriorColor: input.exteriorColor || '', interiorColor: input.interiorColor || '',
    condition: input.condition || '嚴選車況', status, headline: input.headline || '', description: input.description || '',
    featuresJson: JSON.stringify(input.features || []), monthlyRecommended: input.monthlyRecommended ?? existing?.monthlyRecommended ?? false,
    showSoldCase: existing?.showSoldCase ?? false, source: input.source || 'manual', externalId: input.externalId || null,
    localEditsJson: JSON.stringify([]), soldAt: status === 'sold' ? nowForVehicle : null,
    createdAt: existing?.createdAt || nowForVehicle, updatedAt: nowForVehicle,
  };
  const statements: any[] = [writer.insert(vehicles).values(vehicleValues).onConflictDoUpdate({ target: vehicles.id, set: vehicleValues })];
  if (input.photos !== undefined) {
    statements.push(writer.delete(vehicleImages).where(eq(vehicleImages.vehicleId, vehicleId)));
    for (const [sortOrder, url] of input.photos.filter(Boolean).entries()) statements.push(writer.insert(vehicleImages).values({
      id: crypto.randomUUID(), vehicleId, url, alt: vehicleInput.title, sortOrder, isCover: sortOrder === 0, createdAt: nowForVehicle,
    }));
  }

  const now = new Date().toISOString();
  if (existingMapping[0]?.id) {
    statements.push(writer.update(importMappings).set({ vehicleId, lastImportedAt: now }).where(eq(importMappings.id, existingMapping[0].id)));
  } else {
    statements.push(writer
      .insert(importMappings)
      .values({ id: crypto.randomUUID(), source: input.source, externalId: input.externalId, vehicleId, lastImportedAt: now })
      .onConflictDoUpdate({
        target: [importMappings.source, importMappings.externalId],
        set: { vehicleId, lastImportedAt: now },
      }));
  }
  await adapter.batch(statements as any);

  return { vehicleId, status, published: status === 'published', validation: { hasPublicFields } };
}
