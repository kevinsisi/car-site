import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db/connection';
import { importMappings, vehicleImages, vehicles, type PublishMode, type VehicleStatus } from '@/db/schema';
import { brandUrlSlug, getBrandAliasMap } from './brand-aliases';
import { optimizedMediaUrl, thumbnailMediaUrl } from './media';
import { getSettings } from './settings';
import { alwaysPublicVehicleStatuses, isPublicVehicleStatus, mapSourceInventoryStatus } from './vehicle-status';

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
  internalPrice: number | null;
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

async function attachImages(rows: (typeof vehicles.$inferSelect)[]): Promise<VehicleView[]> {
  if (!rows.length) return [];
  const brandAliasMap = await getBrandAliasMap();
  const settings = await getSettings();
  const images = await db
    .select()
    .from(vehicleImages)
    .where(inArray(vehicleImages.vehicleId, rows.map((row) => row.id)))
    .orderBy(asc(vehicleImages.sortOrder));
  const imageMap = new Map<string, VehicleImageView[]>();
  for (const image of images) {
    const list = imageMap.get(image.vehicleId) || [];
    const fullUrl = optimizedMediaUrl(image.url);
    list.push({ id: image.id, url: fullUrl, thumbUrl: thumbnailMediaUrl(image.url), alt: image.alt, sortOrder: image.sortOrder, isCover: image.isCover });
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
      internalPrice: row.internalPrice,
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

export async function listPublicBrands(): Promise<{ displayName: string; urlSlug: string; count: number; iconUrl: string | null }[]> {
  const allVehicles = await listPublicInventoryVehicles();
  const countMap = new Map<string, { displayName: string; urlSlug: string; count: number; iconUrl: string | null }>();
  for (const vehicle of allVehicles) {
    if (!vehicle.brandUrlSlug) continue;
    const key = vehicle.brandUrlSlug;
    const current = countMap.get(key) || {
      displayName: vehicle.brandDisplayName,
      urlSlug: vehicle.brandUrlSlug,
      count: 0,
      iconUrl: vehicle.brandIconUrl,
    };
    current.count += 1;
    countMap.set(key, current);
  }
  return [...countMap.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listPublicVehiclesByBrand(urlSlug: string): Promise<VehicleView[]> {
  return (await listPublicInventoryVehicles()).filter((vehicle) => vehicle.brandUrlSlug === urlSlug);
}

export async function listPublicVehicles(): Promise<VehicleView[]> {
  const settings = await getSettings();
  const statusFilter = inArray(vehicles.status, settings.showSoldVehicles ? [...alwaysPublicVehicleStatuses, 'sold'] : alwaysPublicVehicleStatuses);
  const rows = await db.select().from(vehicles).where(statusFilter).orderBy(desc(vehicles.updatedAt));
  return attachImages(rows);
}

export async function listMonthlyRecommendedVehicles(): Promise<VehicleView[]> {
  const rows = await db
    .select()
    .from(vehicles)
    .where(and(inArray(vehicles.status, alwaysPublicVehicleStatuses), eq(vehicles.monthlyRecommended, true)))
    .orderBy(desc(vehicles.updatedAt));
  return attachImages(rows);
}

export async function listPublicInventoryVehicles(): Promise<VehicleView[]> {
  const rows = await db.select().from(vehicles).where(inArray(vehicles.status, alwaysPublicVehicleStatuses)).orderBy(desc(vehicles.updatedAt));
  return attachImages(rows);
}

export async function listSoldVehicles(): Promise<VehicleView[]> {
  const settings = await getSettings();
  if (!settings.showSoldVehicles) return [];
  const rows = await db.select().from(vehicles).where(eq(vehicles.status, 'sold')).orderBy(desc(vehicles.soldAt), desc(vehicles.updatedAt));
  return attachImages(rows);
}

export async function listSoldCaseVehicles(limit = 6): Promise<VehicleView[]> {
  const settings = await getSettings();
  if (!settings.showSoldVehicles) return [];
  const rows = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.status, 'sold'), eq(vehicles.showSoldCase, true)))
    .orderBy(desc(vehicles.soldAt), desc(vehicles.updatedAt))
    .limit(limit);
  return attachImages(rows);
}

export async function listAdminVehicles(): Promise<VehicleView[]> {
  const rows = await db.select().from(vehicles).where(ne(vehicles.status, 'archived')).orderBy(desc(vehicles.updatedAt));
  return attachImages(rows);
}

export async function getVehicleBySlug(slug: string): Promise<VehicleView | null> {
  const rows = await db.select().from(vehicles).where(eq(vehicles.slug, slug)).limit(1);
  const [vehicle] = await attachImages(rows);
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
  internalPrice?: number | null;
  source?: string;
  externalId?: string | null;
  images?: string[];
}) {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const baseSlug = slugify(`${input.year || ''} ${input.brand} ${input.model} ${input.subModel || ''}`);
  const existing = input.id ? await db.select().from(vehicles).where(eq(vehicles.id, input.id)).limit(1) : [];
  const requestedSlug = normalizeRouteSlug(input.slug);
  const slug = requestedSlug || existing[0]?.slug || `${baseSlug}-${id.slice(0, 6)}`;
  const monthlyRecommended = input.monthlyRecommended ?? existing[0]?.monthlyRecommended ?? false;
  const showSoldCase = input.showSoldCase ?? existing[0]?.showSoldCase ?? false;
  const values = {
    id,
    slug,
    title: input.title,
    cardTitleSupplement: input.cardTitleSupplement ?? existing[0]?.cardTitleSupplement ?? '',
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
    internalPrice: input.internalPrice ?? null,
    source: input.source || 'manual',
    externalId: input.externalId || null,
    localEditsJson: JSON.stringify([]),
    soldAt: input.status === 'sold' ? now : null,
    createdAt: existing[0]?.createdAt || now,
    updatedAt: now,
  };

  await db.insert(vehicles).values(values).onConflictDoUpdate({ target: vehicles.id, set: values });

  if (input.images) {
    await db.delete(vehicleImages).where(eq(vehicleImages.vehicleId, id));
    for (const [sortOrder, url] of input.images.filter(Boolean).entries()) {
      await db.insert(vehicleImages).values({
        id: crypto.randomUUID(),
        vehicleId: id,
        url,
        alt: input.title,
        sortOrder,
        isCover: sortOrder === 0,
        createdAt: now,
      });
    }
  }
  return id;
}

export async function updateVehicleStatus(id: string, status: VehicleStatus) {
  await db.update(vehicles).set({ status, soldAt: status === 'sold' ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(vehicles.id, id));
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
}) {
  const settings = await getSettings();
  const existing = await db
    .select({ vehicleId: importMappings.vehicleId })
    .from(importMappings)
    .where(and(eq(importMappings.source, input.source), eq(importMappings.externalId, input.externalId)))
    .limit(1);

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

  const vehicleId = await upsertVehicle({
    id: existing[0]?.vehicleId,
    slug: input.slug || input.externalId,
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
  });

  const now = new Date().toISOString();
  await db
    .insert(importMappings)
    .values({ id: crypto.randomUUID(), source: input.source, externalId: input.externalId, vehicleId, lastImportedAt: now })
    .onConflictDoUpdate({
      target: [importMappings.source, importMappings.externalId],
      set: { vehicleId, lastImportedAt: now },
    });

  return { vehicleId, status, published: status === 'published', validation: { hasPublicFields } };
}
