import { asc } from 'drizzle-orm';
import { db } from '@/db/connection';
import { brandAliases } from '@/db/schema';

export interface BrandAliasView {
  sourceBrand: string;
  displayName: string;
  urlSlug: string;
}

export function brandUrlSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function listBrandAliases(): Promise<BrandAliasView[]> {
  const rows = await db.select().from(brandAliases).orderBy(asc(brandAliases.sourceBrand));
  return rows.map((row) => ({ sourceBrand: row.sourceBrand, displayName: row.displayName, urlSlug: row.urlSlug || brandUrlSlug(row.displayName) }));
}

export async function getBrandAliasMap(): Promise<Map<string, { displayName: string; urlSlug: string }>> {
  return new Map((await listBrandAliases()).map((row) => [row.sourceBrand, { displayName: row.displayName, urlSlug: row.urlSlug }]));
}

export async function setBrandAliases(input: BrandAliasView[]) {
  const now = new Date().toISOString();
  await db.delete(brandAliases);
  for (const row of input) {
    const sourceBrand = row.sourceBrand.trim();
    const displayName = row.displayName.trim();
    const urlSlug = brandUrlSlug(row.urlSlug || displayName);
    if (!sourceBrand || !displayName) continue;
    await db.insert(brandAliases).values({ sourceBrand, displayName, urlSlug, updatedAt: now });
  }
}
