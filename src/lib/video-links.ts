import fs from 'node:fs';
import path from 'node:path';
import { asc } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/db/connection';
import { siteVideoLinks } from '@/db/schema';
import { appConfig } from './config';

export interface VideoLinkView {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  sortOrder: number;
}

const mediaRoot = path.resolve(path.dirname(appConfig.databasePath), 'media');
const thumbnailDir = path.join(mediaRoot, 'video-thumbnails');
const imageTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const maxThumbnailBytes = 8 * 1024 * 1024;

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

async function downloadThumbnail(url: string): Promise<string | null> {
  if (url.startsWith('/media/')) return url;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: 'https://www.instagram.com/',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = imageTypes[type];
    if (!ext) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > maxThumbnailBytes) return null;

    const today = new Date().toISOString().slice(0, 10);
    const dir = path.join(thumbnailDir, today);
    const root = path.resolve(mediaRoot);
    const resolvedDir = path.resolve(dir);
    if (!resolvedDir.startsWith(root + path.sep)) return null;
    await fs.promises.mkdir(resolvedDir, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
    const filePath = path.join(resolvedDir, filename);
    await fs.promises.writeFile(filePath, buffer, { flag: 'wx' });
    return `/media/video-thumbnails/${today}/${filename}`;
  } catch {
    return null;
  }
}

async function writeGeneratedThumbnail(): Promise<string | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dir = path.join(thumbnailDir, today);
    const root = path.resolve(mediaRoot);
    const resolvedDir = path.resolve(dir);
    if (!resolvedDir.startsWith(root + path.sep)) return null;
    await fs.promises.mkdir(resolvedDir, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#833ab4"/><stop offset="0.48" stop-color="#fd1d1d"/><stop offset="1" stop-color="#fcb045"/>
        </linearGradient>
      </defs>
      <rect width="960" height="540" rx="42" fill="url(#g)"/>
      <rect x="280" y="96" width="400" height="348" rx="92" fill="none" stroke="rgba(255,255,255,.86)" stroke-width="32"/>
      <circle cx="480" cy="270" r="82" fill="none" stroke="rgba(255,255,255,.86)" stroke-width="32"/>
      <circle cx="604" cy="176" r="24" fill="rgba(255,255,255,.92)"/>
      <circle cx="480" cy="270" r="170" fill="rgba(255,255,255,.12)"/>
      <path d="M430 198 586 270 430 342Z" fill="rgba(255,255,255,.92)"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(resolvedDir, filename));
    return `/media/video-thumbnails/${today}/${filename}`;
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
  if (youtube) {
    const thumbnail = `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg`;
    return (await downloadThumbnail(thumbnail)) || thumbnail;
  }

  const instagramFallback = instagramMediaThumbnail(url);

  try {
    const oembed = await fetchText(`https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`);
    if (oembed) {
      const parsed = JSON.parse(oembed) as { thumbnail_url?: string };
      if (parsed.thumbnail_url) {
        const thumbnail = parsed.thumbnail_url.replace(/&amp;/g, '&');
        return (await downloadThumbnail(thumbnail)) || thumbnail;
      }
    }
  } catch {
    // Continue to metadata and deterministic media endpoint fallback.
  }

  const html = await fetchText(url);
  if (html) {
    const metaImage = firstMetaImage(html, url);
    if (metaImage) return (await downloadThumbnail(metaImage)) || metaImage;
  }

  if (instagramFallback) {
    return (await downloadThumbnail(instagramFallback)) || (await writeGeneratedThumbnail()) || instagramFallback;
  }

  return null;
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
