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

// Attempt to fetch og:image from a URL (IG, YouTube, etc.)
export async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const raw = match?.[1] ?? null;
    if (!raw) return null;
    // Make absolute if needed
    try {
      return new URL(raw, url).toString();
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

export async function setVideoLinks(input: Omit<VideoLinkView, 'id'>[]): Promise<void> {
  const now = new Date().toISOString();
  await db.delete(siteVideoLinks);
  for (const [i, item] of input.entries()) {
    if (!item.url) continue;
    // Auto-fetch og:image if no thumbnail provided
    let thumbnailUrl = item.thumbnailUrl ?? null;
    if (!thumbnailUrl) {
      thumbnailUrl = await fetchOgImage(item.url);
    }
    await db.insert(siteVideoLinks).values({
      id: crypto.randomUUID(),
      title: item.title || '',
      url: item.url,
      thumbnailUrl,
      sortOrder: item.sortOrder ?? i,
      createdAt: now,
    });
  }
}
