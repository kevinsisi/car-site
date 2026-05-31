import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from './config';

const mediaRoot = path.resolve(path.dirname(appConfig.databasePath), 'media');

export function optimizedMediaUrl(url: string): string {
  if (!url.startsWith('/media/')) return url;
  const relativePath = url.slice('/media/'.length);
  const normalized = path.normalize(relativePath).replace(/^([/\\])+/, '');
  if (normalized.startsWith('..')) return url;

  const parsed = path.parse(normalized);
  const optimizedRelativePath = path.join('__optimized', parsed.dir, `${parsed.name}.webp`);
  const optimizedPath = path.resolve(mediaRoot, optimizedRelativePath);
  if (!optimizedPath.startsWith(path.resolve(mediaRoot) + path.sep)) return url;

  return fs.existsSync(optimizedPath) ? `/media/${optimizedRelativePath.replace(/\\/g, '/')}` : url;
}
