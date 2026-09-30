import { asc } from 'drizzle-orm';
import type { createD1Db } from '@/db/d1';
import { brandAliases } from '@/db/schema';

type BrandAliasesDb = Awaited<ReturnType<typeof createD1Db>>;

async function aliasesDb(adapter?: BrandAliasesDb): Promise<BrandAliasesDb> {
  if (adapter) return adapter;
  return (await import('@/db/connection')).db as unknown as BrandAliasesDb;
}

export interface BrandAliasView {
  sourceBrand: string;
  displayName: string;
  urlSlug: string;
  iconUrl: string | null;
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

export async function listBrandAliases(adapter?: BrandAliasesDb, limit?: number): Promise<BrandAliasView[]> {
  const query = (await aliasesDb(adapter)).select().from(brandAliases).orderBy(asc(brandAliases.sourceBrand));
  const rows = limit === undefined ? await query : await query.limit(limit);
  return rows.map((row) => ({
    sourceBrand: row.sourceBrand,
    displayName: row.displayName,
    urlSlug: row.urlSlug || brandUrlSlug(row.displayName),
    iconUrl: row.iconUrl ?? null,
  }));
}

export async function getBrandAliasMap(adapter?: BrandAliasesDb): Promise<Map<string, { displayName: string; urlSlug: string; iconUrl: string | null }>> {
  return new Map(
    (await listBrandAliases(adapter)).map((row) => [
      row.sourceBrand,
      { displayName: row.displayName, urlSlug: row.urlSlug, iconUrl: row.iconUrl },
    ])
  );
}

export async function setBrandAliases(input: BrandAliasView[], adapter?: BrandAliasesDb) {
  const now = new Date().toISOString();
  const writer = await aliasesDb(adapter);
  const statements: any[] = [writer.delete(brandAliases)];
  for (const row of input) {
    const sourceBrand = row.sourceBrand.trim();
    const displayName = row.displayName.trim();
    const urlSlug = brandUrlSlug(row.urlSlug || displayName);
    if (!sourceBrand || !displayName) continue;
    statements.push(writer.insert(brandAliases).values({
      sourceBrand,
      displayName,
      urlSlug,
      iconUrl: row.iconUrl ?? null,
      updatedAt: now,
    }));
  }
  if (adapter) await adapter.batch(statements as any);
  else for (const statement of statements) await statement;
}
