import type { APIRoute } from 'astro';
import type { R2MediaBucket } from '@/lib/r2-media';

const allowedTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const maxFileSize = 12 * 1024 * 1024;

function validateFile(file: File): { error: string } | { ext: string } {
  const ext = allowedTypes[file.type];
  if (!ext) return { error: `不支援的圖片格式：${file.type || file.name}` };
  if (file.size > maxFileSize) return { error: `${file.name} 檔案大小超過 12MB` };
  return { ext };
}

export async function uploadMediaToR2(files: File[], bucket: R2MediaBucket): Promise<Response> {
  const { deleteMedia, putMedia } = await import('@/lib/r2-media');
  const urls: string[] = [];
  const createdIds: string[] = [];

  try {
    for (const file of files) {
      const validation = validateFile(file);
      if ('error' in validation) {
        await Promise.allSettled(createdIds.map((id) => deleteMedia(bucket, 'vehicle', id)));
        return Response.json({ error: validation.error }, { status: 400 });
      }
      const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}${validation.ext}`;
      await putMedia(bucket, 'vehicle', id, file, { contentType: file.type });
      createdIds.push(id);
      urls.push(`/media/vehicle/${id}`);
    }
  } catch {
    await Promise.allSettled(createdIds.map((id) => deleteMedia(bucket, 'vehicle', id)));
    return Response.json({ error: '圖片上傳失敗，請稍後再試' }, { status: 500 });
  }

  return Response.json({ ok: true, urls });
}

function safeName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'vehicle-image';
}

// Generate WebP full + thumbnail in __optimized (non-blocking, best-effort)
async function generateOptimized(srcPath: string, relDir: string, baseName: string): Promise<void> {
  const [{ default: fs }, path, { default: sharp }] = await Promise.all([
    import('node:fs'),
    import('node:path'),
    import('sharp'),
  ]);
  const { appConfig } = await import('@/lib/config');
  const mediaRoot = path.resolve(path.join(appConfig.databasePath, '..', 'media'));
  const optimizedDir = path.join(mediaRoot, '__optimized', relDir);
  await fs.promises.mkdir(optimizedDir, { recursive: true });

  const img = sharp(srcPath).rotate(); // auto-rotate from EXIF
  const meta = await img.metadata();
  const w = meta.width ?? 1800;

  // Full WebP — max 1800px, q82 (typically 80-90% smaller than original JPG)
  await img.clone()
    .resize({ width: Math.min(w, 1800), withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(optimizedDir, `${baseName}.webp`));

  // Thumbnail WebP — max 600px, q75 (for gallery strips, car cards)
  await img.clone()
    .resize({ width: Math.min(w, 600), withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(path.join(optimizedDir, `${baseName}-thumb.webp`));
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const runtime = locals?.runtime;
  const env = runtime?.env;
  const isWorker = Boolean(runtime);
  const { ADMIN_COOKIE, getAdminOrResponse } = await import('@/lib/auth');
  let authOptions;
  let bucket: R2MediaBucket | undefined;

  if (isWorker) {
    if (!cookies.get(ADMIN_COOKIE)?.value) {
      const unauthenticated = await getAdminOrResponse(cookies);
      if (unauthenticated instanceof Response) return unauthenticated;
    }

    const dbBinding = env?.DB_PREVIEW;
    const sessionSecret = env?.SESSION_SECRET;
    bucket = env?.MEDIA_PREVIEW as R2MediaBucket | undefined;
    if (!dbBinding || !sessionSecret || !bucket) {
      return Response.json({ error: '服務設定不完整' }, { status: 503 });
    }
    const { createD1Db } = await import('@/db/d1');
    authOptions = { db: await createD1Db(dbBinding), sessionSecret };
  }

  const _auth = await getAdminOrResponse(cookies, authOptions);
  if (_auth instanceof Response) return _auth;
  const formData = await request.formData();
  const files = formData.getAll('files').filter((file): file is File => file instanceof File);

  if (!files.length) {
    return Response.json({ error: '請先選擇要上傳的圖片' }, { status: 400 });
  }

  if (isWorker) return uploadMediaToR2(files, bucket!);

  const [{ default: fs }, path, { appConfig }, { registerOptimizedMedia }] = await Promise.all([
    import('node:fs'),
    import('node:path'),
    import('@/lib/config'),
    import('@/lib/media'),
  ]);
  const mediaRoot = path.resolve(path.join(appConfig.databasePath, '..', 'media'));
  const today = new Date().toISOString().slice(0, 10);
  const uploadDir = path.resolve(mediaRoot, 'uploads', today);
  if (!uploadDir.startsWith(mediaRoot + path.sep)) {
    return Response.json({ error: '上傳路徑無效，請聯繫管理員' }, { status: 400 });
  }
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const urls: string[] = [];
  for (const file of files) {
    const validation = validateFile(file);
    if ('error' in validation) return Response.json({ error: validation.error }, { status: 400 });
    const ext = validation.ext;

    const id = crypto.randomUUID().slice(0, 8);
    const baseName = `${Date.now()}-${id}-${safeName(file.name)}`;
    const filename = `${baseName}${ext}`;
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(filePath, buffer, { flag: 'wx' });

    // Fire-and-forget optimization (won't delay upload response)
    generateOptimized(filePath, `uploads/${today}`, baseName)
      .then(() => registerOptimizedMedia(`/media/uploads/${today}/${filename}`))
      .catch((err) => console.error('[media] optimize failed:', baseName, err));

    urls.push(`/media/uploads/${today}/${filename}`);
  }

  return Response.json({ ok: true, urls });
};
