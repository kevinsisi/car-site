import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { APIRoute } from 'astro';
import { appConfig } from '@/lib/config';

const mediaRoot = path.join(appConfig.databasePath, '..', 'media');
const mimeTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export const GET: APIRoute = async ({ params }) => {
  const requestedPath = params.path || '';
  const normalized = path.normalize(requestedPath).replace(/^([/\\])+/, '');
  const filePath = path.resolve(mediaRoot, normalized);
  const rootPath = path.resolve(mediaRoot);

  if (!filePath.startsWith(rootPath + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mimeTypes[ext];
  if (!mimeType || !fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 });
  }

  const stat = await fs.promises.stat(filePath);
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      'content-type': mimeType,
      'content-length': String(stat.size),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
