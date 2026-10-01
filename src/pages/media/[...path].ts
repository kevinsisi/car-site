import path from 'node:path';
import type { APIRoute } from 'astro';
import { getMedia, type MediaCategory, type R2MediaBucket, type R2ObjectRange } from '@/lib/r2-media';

const mimeTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export const GET: APIRoute = async ({ params, request, locals }) => {
  const requestedPath = params.path || '';
  const normalized = path.posix.normalize(requestedPath.replace(/\\/g, '/')).replace(/^\/+/, '');

  if (!normalized || normalized === '..' || normalized.startsWith('../')) {
    return new Response('Not found', { status: 404 });
  }

  const [categoryPart, ...objectParts] = normalized.split('/');
  if ((categoryPart !== 'vehicle' && categoryPart !== 'sell-inquiry') || objectParts.length !== 1 || !objectParts[0]) {
    return new Response('Not found', { status: 404 });
  }
  const objectId = objectParts[0];
  const ext = path.posix.extname(objectId).toLowerCase();
  const mimeType = mimeTypes[ext];
  if (!mimeType) {
    return new Response('Not found', { status: 404 });
  }

  const bucket = locals.runtime?.env?.MEDIA_PREVIEW as R2MediaBucket | undefined;
  if (!bucket) return new Response('Not found', { status: 404 });

  const category = categoryPart as MediaCategory;
  const range = request.headers.get('range');
  let start: number | undefined;
  let requestedEnd: number | undefined;
  let suffixLength: number | undefined;
  if (range && mimeType.startsWith('video/')) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (match?.[1] && match[2]) {
      start = Number(match[1]);
      requestedEnd = Number(match[2]);
    } else if (match?.[1]) {
      start = Number(match[1]);
    } else if (match?.[2]) {
      suffixLength = Number(match[2]);
    }
    if (start !== undefined && (!Number.isSafeInteger(start) || start < 0 || (requestedEnd !== undefined && (!Number.isSafeInteger(requestedEnd) || requestedEnd < start)))) {
      start = undefined;
      requestedEnd = undefined;
    }
    if (suffixLength !== undefined && (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)) {
      suffixLength = undefined;
    }
  }

  let r2Range: R2ObjectRange | undefined;
  if (start !== undefined) {
    r2Range = { offset: start, ...(requestedEnd !== undefined ? { length: requestedEnd - start + 1 } : {}) };
  } else if (suffixLength !== undefined) {
    r2Range = { suffix: suffixLength };
  }
  let media;
  try {
    media = await getMedia(bucket, category, objectId, r2Range ? { range: r2Range } : undefined);
  } catch (error) {
    if (!r2Range || !(error instanceof Error) || !/\(10039\)$/.test(error.message)) throw error;
    media = await getMedia(bucket, category, objectId);
    r2Range = undefined;
  }
  if (!media) return new Response('Not found', { status: 404 });
  if (r2Range && (!media.range || !Number.isSafeInteger(media.range.offset) || !Number.isSafeInteger(media.range.length) || media.range.offset < 0 || media.range.length <= 0 || media.range.offset + media.range.length > media.size)) {
    media = await getMedia(bucket, category, objectId);
    if (!media) return new Response('Not found', { status: 404 });
    r2Range = undefined;
  }
  const contentType = media.contentType || mimeType;
  const isPartial = Boolean(r2Range);
  const actualRange = media.range;
  const end = isPartial ? actualRange!.offset + actualRange!.length - 1 : -1;
  const responseHeaders = new Headers({
    'content-type': contentType,
    'content-length': String(isPartial ? actualRange!.length : media.size),
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: `"${media.etag}"`,
  });
  if (isPartial) responseHeaders.set('content-range', `bytes ${actualRange!.offset}-${end}/${media.size}`);
  return new Response(media.body, {
    status: isPartial ? 206 : 200,
    headers: responseHeaders,
  });
};
