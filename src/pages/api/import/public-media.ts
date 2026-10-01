import type { APIRoute } from 'astro';
import type { R2MediaBucket } from '@/lib/r2-media';
import {
  hasMatchingStoredMedia,
  isAllowedPublicSource,
  matchesPublicMediaType,
  publicMediaExtension,
  readBoundedBody,
  sha256Hex,
  signPublicMediaReceipt,
  type PublicMediaBucket,
} from '@/lib/public-source-media';

const PUBLIC_MEDIA_ORIGIN = 'https://mita.sisihome.org';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB_PREVIEW || !env.MEDIA_PREVIEW || !env.IMPORT_PREVIEW_TOKEN) {
    return Response.json({ error: 'preview media import unavailable' }, { status: 503 });
  }
  if (env.MITA_PUBLIC_SYNC_ENABLED !== 'true') return Response.json({ error: 'public media sync disabled' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${env.IMPORT_PREVIEW_TOKEN}`) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const sourceUrl = request.headers.get('x-source-url') || '';
  const contentType = (request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const expectedHash = request.headers.get('x-content-sha256') || '';
  if (!isAllowedPublicSource(sourceUrl)) return Response.json({ error: 'invalid public source URL' }, { status: 400 });
  if (!(contentType === 'image/jpeg' || contentType === 'image/png' || contentType === 'image/webp' || contentType === 'video/mp4')) return Response.json({ error: 'unsupported content type' }, { status: 415 });
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return Response.json({ error: 'invalid sha256' }, { status: 400 });
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 40 * 1024 * 1024)) return Response.json({ error: 'invalid or oversized content length' }, { status: 413 });

  const bytes = await readBoundedBody(request);
  if (!bytes) return Response.json({ error: 'empty, malformed, or oversized body' }, { status: 400 });
  if (declaredLength !== null && Number(declaredLength) !== bytes.byteLength) return Response.json({ error: 'content length mismatch' }, { status: 400 });
  if (!matchesPublicMediaType(bytes, contentType)) return Response.json({ error: 'content does not match declared type' }, { status: 400 });
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== expectedHash) return Response.json({ error: 'sha256 mismatch' }, { status: 400 });

  const key = `vehicle/${sha256}.${publicMediaExtension(contentType)}`;
  const bucket = env.MEDIA_PREVIEW as unknown as PublicMediaBucket;
  let stored = false;
  try {
    const result = await bucket.put(key, bytes, {
      httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { sha256 },
      onlyIf: { etagDoesNotMatch: '*' },
    });
    stored = Boolean(result);
  } catch {
    // Conditional put may report a precondition collision; verify the incumbent below.
  }
  if (!stored && !await hasMatchingStoredMedia(bucket, key, bytes, contentType, sha256)) {
    return Response.json({ error: 'immutable media key collision' }, { status: 409 });
  }

  const receipt = {
    source_url: sourceUrl,
    target_url: `${PUBLIC_MEDIA_ORIGIN}/media/${key}`,
    sha256,
    bytes: bytes.byteLength,
    content_type: contentType,
  };
  return Response.json({ ...receipt, signature: await signPublicMediaReceipt(env.IMPORT_PREVIEW_TOKEN, receipt) });
};
