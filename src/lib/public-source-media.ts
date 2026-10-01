import type { R2MediaBucket, R2ObjectMetadata } from '@/lib/r2-media';

export const MAX_PUBLIC_MEDIA_BYTES = 40 * 1024 * 1024;

const mediaTypes = {
  'image/jpeg': { extension: 'jpg', signature: (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { extension: 'png', signature: (b: Uint8Array) => b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) },
  'image/webp': { extension: 'webp', signature: (b: Uint8Array) => b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' },
  'video/mp4': { extension: 'mp4', signature: (b: Uint8Array) => b.length >= 8 && String.fromCharCode(...b.slice(4, 8)) === 'ftyp' },
} as const;

export type PublicMediaType = keyof typeof mediaTypes;

export function isAllowedPublicSource(value: string): boolean {
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|%2f|$)/i.test(value)) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { return false; }
  if (decodedPath.split('/').some((part) => part === '.' || part === '..' || part.includes('\\'))) return false;
  if (url.hostname === 'mita.sisihome.org') {
    return /^\/(?:media|brand-icons)\/[^/]+(?:\/[^/]+)*$/.test(decodedPath) && !decodedPath.startsWith('/media/sell-inquiry/');
  }
  return url.hostname === 'i.ytimg.com' && /^\/vi(?:_webp)?\/[^/]+\/[^/]+\.(?:jpg|jpeg|png|webp)$/.test(decodedPath);
}

export function matchesPublicMediaType(bytes: Uint8Array, contentType: string): contentType is PublicMediaType {
  const type = mediaTypes[contentType as PublicMediaType];
  return Boolean(type?.signature(bytes));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalReceipt(sourceUrl: string, targetUrl: string, sha256: string, bytes: number, contentType: string): string {
  return JSON.stringify([sourceUrl, targetUrl, sha256, bytes, contentType]);
}

export async function signPublicMediaReceipt(token: string, receipt: { source_url: string; target_url: string; sha256: string; bytes: number; content_type: string }): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonicalReceipt(receipt.source_url, receipt.target_url, receipt.sha256, receipt.bytes, receipt.content_type)));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyPublicMediaReceipt(token: string, receipt: { source_url: string; target_url: string; sha256: string; bytes: number; content_type: string }, signature: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(canonicalReceipt(receipt.source_url, receipt.target_url, receipt.sha256, receipt.bytes, receipt.content_type)));
}

export async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PUBLIC_MEDIA_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  if (!size) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export interface PublicMediaBucket extends R2MediaBucket {
  put(key: string, value: ArrayBufferView, options?: {
    httpMetadata?: { contentType?: string; cacheControl?: string };
    customMetadata?: Record<string, string>;
    onlyIf?: { etagDoesNotMatch: '*' };
  }): Promise<R2ObjectMetadata | null>;
}

export async function hasMatchingStoredMedia(bucket: PublicMediaBucket, key: string, expected: Uint8Array, contentType: string, sha256: string): Promise<boolean> {
  const object = await bucket.get(key);
  if (!object || object.size !== expected.byteLength || object.httpMetadata?.contentType !== contentType || object.customMetadata?.sha256 !== sha256) return false;
  const stored = new Uint8Array(await new Response(object.body).arrayBuffer());
  return stored.byteLength === expected.byteLength && await sha256Hex(stored) === sha256 && stored.every((byte, index) => byte === expected[index]);
}

export function publicMediaExtension(contentType: PublicMediaType): string {
  return mediaTypes[contentType].extension;
}
