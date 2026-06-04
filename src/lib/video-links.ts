import { asc } from 'drizzle-orm';
import { db } from '@/db/connection';
import { siteVideoLinks } from '@/db/schema';

export interface VideoLinkView {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  sortOrder: number;
}

export async function listVideoLinks(): Promise<VideoLinkView[]> {
  const rows = await db.select().from(siteVideoLinks).orderBy(asc(siteVideoLinks.sortOrder));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl ?? null,
    sortOrder: row.sortOrder,
  }));
}

export async function setVideoLinks(input: Omit<VideoLinkView, 'id'>[]): Promise<void> {
  const now = new Date().toISOString();
  await db.delete(siteVideoLinks);
  for (const [i, item] of input.entries()) {
    if (!item.url) continue;
    await db.insert(siteVideoLinks).values({
      id: crypto.randomUUID(),
      title: item.title || '',
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? null,
      sortOrder: item.sortOrder ?? i,
      createdAt: now,
    });
  }
}
