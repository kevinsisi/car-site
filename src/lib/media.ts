import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from './config';

const mediaRoot = path.resolve(path.dirname(appConfig.databasePath), 'media');
let optimizedManifest: Set<string> | null = null;
const manifestAdditions = new Set<string>();

async function buildOptimizedManifest(): Promise<void> {
  const files = new Set<string>();
  const pending = async (directory: string): Promise<void> => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return pending(entryPath);
      if (entry.isFile() && entry.name.endsWith('.webp')) {
        files.add(path.relative(mediaRoot, entryPath).replace(/\\/g, '/'));
      }
    }));
  };

  await pending(path.join(mediaRoot, '__optimized'));
  for (const addition of manifestAdditions) files.add(addition);
  optimizedManifest = files;
}

// The first request can still use the legacy filesystem fallback while this runs.
void buildOptimizedManifest();

function optimizedKey(url: string, suffix: string): { key: string; url: string } | null {
  if (!url.startsWith('/media/')) return null;
  const relativePath = url.slice('/media/'.length);
  const normalized = path.normalize(relativePath).replace(/^([/\\])+/, '');
  if (normalized.startsWith('..')) return null;

  const parsed = path.parse(normalized);
  const optimizedRelativePath = path.join('__optimized', parsed.dir, `${parsed.name}${suffix}.webp`);
  const optimizedPath = path.resolve(mediaRoot, optimizedRelativePath);
  if (!optimizedPath.startsWith(path.resolve(mediaRoot) + path.sep)) return null;

  return { key: optimizedRelativePath.replace(/\\/g, '/'), url: `/media/${optimizedRelativePath.replace(/\\/g, '/')}` };
}

function hasOptimized(key: string, absolutePath: string): boolean {
  return optimizedManifest === null ? fs.existsSync(absolutePath) : optimizedManifest.has(key);
}

export function registerOptimizedMedia(url: string): void {
  const full = optimizedKey(url, '');
  const thumb = optimizedKey(url, '-thumb');
  if (!full || !thumb) return;
  if (optimizedManifest === null) {
    manifestAdditions.add(full.key);
    manifestAdditions.add(thumb.key);
  } else {
    optimizedManifest.add(full.key);
    optimizedManifest.add(thumb.key);
  }
}

export function resolveMediaPair(url: string): { url: string; thumbUrl: string } {
  const full = optimizedKey(url, '');
  const thumb = optimizedKey(url, '-thumb');
  if (!full || !thumb) return { url, thumbUrl: url };

  const fullPath = path.resolve(mediaRoot, full.key);
  const thumbPath = path.resolve(mediaRoot, thumb.key);
  const fullAvailable = hasOptimized(full.key, fullPath);
  const thumbAvailable = hasOptimized(thumb.key, thumbPath);
  return {
    url: fullAvailable ? full.url : url,
    thumbUrl: thumbAvailable ? thumb.url : fullAvailable ? full.url : url,
  };
}

function resolveOptimized(url: string, suffix: string): string | null {
  const optimized = optimizedKey(url, suffix);
  if (!optimized) return null;
  return hasOptimized(optimized.key, path.resolve(mediaRoot, optimized.key)) ? optimized.url : null;
}

// Full-size WebP (max 1800px) — for detail page main image
export function optimizedMediaUrl(url: string): string {
  return resolveOptimized(url, '') ?? url;
}

// Thumbnail WebP (max 600px) — for gallery strips, car cards, compare page
export function thumbnailMediaUrl(url: string): string {
  return resolveOptimized(url, '-thumb') ?? resolveOptimized(url, '') ?? url;
}
