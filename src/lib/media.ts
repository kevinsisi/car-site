import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from './config';

const mediaRoot = path.resolve(path.dirname(appConfig.databasePath), 'media');

function resolveOptimized(url: string, suffix: string): string | null {
  if (!url.startsWith('/media/')) return null;
  const relativePath = url.slice('/media/'.length);
  const normalized = path.normalize(relativePath).replace(/^([/\\])+/, '');
  if (normalized.startsWith('..')) return null;

  const parsed = path.parse(normalized);
  const optimizedRelativePath = path.join('__optimized', parsed.dir, `${parsed.name}${suffix}.webp`);
  const optimizedPath = path.resolve(mediaRoot, optimizedRelativePath);
  if (!optimizedPath.startsWith(path.resolve(mediaRoot) + path.sep)) return null;

  return fs.existsSync(optimizedPath) ? `/media/${optimizedRelativePath.replace(/\\/g, '/')}` : null;
}

// Full-size WebP (max 1800px) — for detail page main image
export function optimizedMediaUrl(url: string): string {
  return resolveOptimized(url, '') ?? url;
}

// Thumbnail WebP (max 600px) — for gallery strips, car cards, compare page
export function thumbnailMediaUrl(url: string): string {
  return resolveOptimized(url, '-thumb') ?? resolveOptimized(url, '') ?? url;
}
