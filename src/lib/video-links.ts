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

function youtubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return match?.[1] ?? null;
}

function instagramMediaThumbnail(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/(?:p|reel|tv)\/([^/?#]+)/i);
    const shortcode = match?.[1];
    return shortcode ? `https://www.instagram.com/p/${shortcode}/media/?size=l` : null;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function firstMetaImage(html: string, baseUrl: string): string | null {
  const match =
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["']/i);
  const raw = match?.[1]?.replace(/&amp;/g, '&') ?? null;
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

export async function fetchVideoThumbnail(url: string): Promise<string | null> {
  const youtube = youtubeId(url);
  if (youtube) return `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg`;

  const instagramFallback = instagramMediaThumbnail(url);

  try {
    const oembed = await fetchText(`https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`);
    if (oembed) {
      const parsed = JSON.parse(oembed) as { thumbnail_url?: string };
      if (parsed.thumbnail_url) return parsed.thumbnail_url.replace(/&amp;/g, '&');
    }
  } catch {
    // Continue to metadata and deterministic media endpoint fallback.
  }

  const html = await fetchText(url);
  if (html) {
    const metaImage = firstMetaImage(html, url);
    if (metaImage) return metaImage;
  }

  return instagramFallback;
}

export async function fetchOgImage(url: string): Promise<string | null> {
  return fetchVideoThumbnail(url);
}

export async function setVideoLinks(input: Omit<VideoLinkView, 'id'>[]): Promise<VideoLinkView[]> {
  const now = new Date().toISOString();
  const saved: VideoLinkView[] = [];
  await db.delete(siteVideoLinks);
  for (const [i, item] of input.entries()) {
    if (!item.url) continue;
    let thumbnailUrl = item.thumbnailUrl ?? null;
    if (!thumbnailUrl) {
      thumbnailUrl = await fetchVideoThumbnail(item.url);
    }
    const savedItem: VideoLinkView = {
      id: crypto.randomUUID(),
      title: item.title || '',
      url: item.url,
      thumbnailUrl,
      sortOrder: item.sortOrder ?? i,
    };
    await db.insert(siteVideoLinks).values({
      ...savedItem,
      createdAt: now,
    });
    saved.push(savedItem);
  }
  return saved;
}
