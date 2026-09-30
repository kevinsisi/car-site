export type MediaCategory = 'vehicle' | 'sell-inquiry';

export interface R2ObjectMetadata {
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2ObjectMetadata {
  body: ReadableStream<Uint8Array>;
  range?: { offset: number; length: number };
}

export type R2ObjectRange =
  | { offset: number; length?: number }
  | { suffix: number }

export interface R2GetOptions {
  range?: R2ObjectRange;
}

export interface R2MediaBucket {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<R2ObjectMetadata | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

export interface StoredMedia {
  key: string;
  size: number;
  etag: string;
  contentType: string | null;
  customMetadata: Record<string, string>;
  body: ReadableStream<Uint8Array>;
  range?: { offset: number; length: number };
}

function assertObjectId(objectId: string): void {
  if (!objectId || objectId.includes('/') || objectId === '.' || objectId === '..') {
    throw new TypeError('Media object id must be a non-empty path segment');
  }
}

export function mediaKey(category: MediaCategory, objectId: string): string {
  if (category !== 'vehicle' && category !== 'sell-inquiry') {
    throw new TypeError('Unsupported media category');
  }
  assertObjectId(objectId);
  return `${category}/${objectId}`;
}

export async function putMedia(
  bucket: R2MediaBucket,
  category: MediaCategory,
  objectId: string,
  body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
  options: { contentType: string; customMetadata?: Record<string, string> },
): Promise<{ key: string; size: number; etag: string }> {
  if (!options.contentType.trim()) throw new TypeError('Media content type is required');
  const key = mediaKey(category, objectId);
  const result = await bucket.put(key, body, {
    httpMetadata: { contentType: options.contentType },
    customMetadata: options.customMetadata,
  });
  if (!result) throw new Error('R2 did not return stored object metadata');
  return { key, size: result.size, etag: result.etag };
}

export async function getMedia(
  bucket: R2MediaBucket,
  category: MediaCategory,
  objectId: string,
  options?: R2GetOptions,
): Promise<StoredMedia | null> {
  const key = mediaKey(category, objectId);
  const result = await bucket.get(key, options);
  if (!result) return null;
  return {
    key,
    size: result.size,
    etag: result.etag,
    contentType: result.httpMetadata?.contentType ?? null,
    customMetadata: result.customMetadata ?? {},
    body: result.body,
    range: result.range,
  };
}

export async function deleteMedia(
  bucket: R2MediaBucket,
  category: MediaCategory,
  objectId: string,
): Promise<void> {
  await bucket.delete(mediaKey(category, objectId));
}
