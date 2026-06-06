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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export const GET: APIRoute = async ({ params, request }) => {
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
  const range = request.headers.get('range');
  if (range && mimeType.startsWith('video/')) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end && start < stat.size) {
        const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
        return new Response(stream, {
          status: 206,
          headers: {
            'content-type': mimeType,
            'content-length': String(end - start + 1),
            'content-range': `bytes ${start}-${end}/${stat.size}`,
            'accept-ranges': 'bytes',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        });
      }
    }
  }
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      'content-type': mimeType,
      'content-length': String(stat.size),
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
