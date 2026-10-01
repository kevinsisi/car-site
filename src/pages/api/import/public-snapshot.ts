import type { APIRoute } from 'astro';
import { applyPublicSnapshot, PublicSyncConflict } from '@/lib/public-source-sync';
import { parsePublicSnapshot, publicAssetReferences, SnapshotValidationError, type PublicSnapshot } from '@/lib/public-source-snapshot';
import { isAllowedPublicSource, verifyPublicMediaReceipt } from '@/lib/public-source-media';

const TARGET_ORIGIN = 'https://mita.sisihome.org';
const MAX_BODY_BYTES = 5 * 1024 * 1024;

async function boundedBody(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
  } catch { return null; }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return bytes;
}

function remapSnapshot(snapshot: PublicSnapshot, mappings: Map<string, string>): PublicSnapshot {
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') return mappings.get(value) ?? (value.startsWith('/') ? mappings.get(`${TARGET_ORIGIN}${value}`) : undefined) ?? value;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
    return value;
  };
  const settings = snapshot.site_settings.map((row) => {
    if (!['socialIcons','heroVideos'].includes(String(row.key))) return row;
    return { ...row, value: JSON.stringify(replace(JSON.parse(String(row.value)))) };
  });
  const mappedUrl = (value: unknown) => typeof value === 'string'
    ? mappings.get(value) ?? mappings.get(value.startsWith('/') ? `${TARGET_ORIGIN}${value}` : value) ?? value
    : value;
  return {
    ...snapshot,
    vehicles: snapshot.vehicles.map((row) => ({ ...row })),
    vehicle_images: snapshot.vehicle_images.map((row) => ({ ...row, url: mappedUrl(row.url) })),
    brand_aliases: snapshot.brand_aliases.map((row) => ({ ...row, icon_url: mappedUrl(row.icon_url) })),
    site_settings: settings.map((row) => row.key === 'siteIconUrl' ? { ...row, value: mappedUrl(row.value) } : row),
    site_video_links: snapshot.site_video_links.map((row) => ({ ...row, url: mappedUrl(row.url), thumbnail_url: mappedUrl(row.thumbnail_url) })),
  } as PublicSnapshot;
}

function allPublicMediaReferences(snapshot: PublicSnapshot): string[] {
  const refs = new Set(publicAssetReferences(snapshot));
  const add = (value: unknown) => {
    if (typeof value !== 'string' || !value) return;
    const normalized = value.startsWith('/') ? `${TARGET_ORIGIN}${value}` : value;
    if (isAllowedPublicSource(normalized)) refs.add(normalized);
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['url', 'thumbnailUrl', 'thumbnail_url', 'poster', 'posterUrl'].includes(key)) add(child);
      else visit(child);
    }
  };
  snapshot.site_video_links.forEach((row) => add(row.url));
  for (const row of snapshot.site_settings) if (['socialIcons', 'heroVideos'].includes(String(row.key))) visit(JSON.parse(String(row.value)));
  return [...refs];
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB_PREVIEW || !env.IMPORT_PREVIEW_TOKEN) return Response.json({ error: 'public snapshot import unavailable' }, { status: 503 });
  if (env.MITA_PUBLIC_SYNC_ENABLED !== 'true') return Response.json({ error: 'public snapshot sync disabled' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${env.IMPORT_PREVIEW_TOKEN}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const bytes = await boundedBody(request);
  if (!bytes) return Response.json({ error: 'empty or oversized snapshot body' }, { status: 413 });
  let snapshot: PublicSnapshot;
  let mediaReceipts: unknown;
  try {
    const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || Object.keys(envelope).sort().join(',') !== 'media_receipts,snapshot') throw new Error('request body must contain exactly snapshot and media_receipts');
    const body = envelope as { snapshot: unknown; media_receipts: unknown };
    snapshot = parsePublicSnapshot(new TextEncoder().encode(JSON.stringify(body.snapshot)));
    mediaReceipts = body.media_receipts;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    return Response.json({ error: message }, { status: 400 });
  }
  if (!Array.isArray(mediaReceipts)) return Response.json({ error: 'x-public-media-receipts must be an array' }, { status: 400 });
  const refs = allPublicMediaReferences(snapshot);
  const mappings = new Map<string, string>();
  for (const raw of mediaReceipts) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Response.json({ error: 'invalid media receipt' }, { status: 400 });
    const receipt = raw as Record<string, unknown>;
    if (Object.keys(receipt).sort().join(',') !== 'bytes,content_type,sha256,signature,source_url,target_url') return Response.json({ error: 'invalid media receipt fields' }, { status: 400 });
    const { source_url, target_url, sha256, bytes: size, content_type, signature } = receipt;
    if (typeof source_url !== 'string' || typeof target_url !== 'string' || typeof sha256 !== 'string' || typeof content_type !== 'string' || typeof signature !== 'string' || typeof size !== 'number') return Response.json({ error: 'invalid media receipt values' }, { status: 400 });
    const extension = content_type === 'image/jpeg' ? 'jpg' : content_type === 'image/png' ? 'png' : content_type === 'image/webp' ? 'webp' : content_type === 'video/mp4' ? 'mp4' : '';
    const canonicalSource = source_url.startsWith('/') ? `${TARGET_ORIGIN}${source_url}` : source_url;
    const expectedTarget = `${TARGET_ORIGIN}/media/vehicle/${sha256}.${extension}`;
    if (!extension || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(size) || size <= 0 || !isAllowedPublicSource(canonicalSource) || !refs.includes(canonicalSource) || mappings.has(canonicalSource) || target_url !== expectedTarget || !await verifyPublicMediaReceipt(env.IMPORT_PREVIEW_TOKEN, { source_url, target_url, sha256, bytes: size, content_type }, signature)) return Response.json({ error: 'invalid public media receipt' }, { status: 400 });
    mappings.set(source_url, target_url.replace(TARGET_ORIGIN, ''));
    mappings.set(canonicalSource, target_url.replace(TARGET_ORIGIN, ''));
  }
  const missing = refs.filter((ref) => !mappings.has(ref));
  if (missing.length) return Response.json({ error: 'missing media receipts', count: missing.length }, { status: 400 });
  const revisionRow = await env.DB_PREVIEW.prepare('SELECT revision FROM public_data_revision WHERE id = 1').first<{ revision: number }>();
  if (!revisionRow || !Number.isSafeInteger(revisionRow.revision) || revisionRow.revision < 0) return Response.json({ error: 'public data revision unavailable' }, { status: 500 });
  const db = env.DB_PREVIEW;
  try {
    const applied = await applyPublicSnapshot(db, snapshot, remapSnapshot(snapshot, mappings), revisionRow.revision);
    return Response.json({ ok: true, ...applied });
  } catch (error) {
    if (error instanceof PublicSyncConflict) return Response.json({ error: error.message }, { status: 409 });
    console.error(error);
    return Response.json({ error: 'public snapshot transaction failed' }, { status: 500 });
  }
};
