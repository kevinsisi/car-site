import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { appConfig } from '@/lib/config';

const mediaRoot = path.resolve(path.join(appConfig.databasePath, '..', 'media'));
const allowedTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const maxFileSize = 12 * 1024 * 1024;

function safeName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'vehicle-image';
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const _auth = await getAdminOrResponse(cookies);
  if (_auth instanceof Response) return _auth;
  const formData = await request.formData();
  const files = formData.getAll('files').filter((file): file is File => file instanceof File);

  if (!files.length) {
    return Response.json({ error: '請先選擇要上傳的圖片' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const uploadDir = path.resolve(mediaRoot, 'uploads', today);
  if (!uploadDir.startsWith(mediaRoot + path.sep)) {
    return Response.json({ error: '上傳路徑無效，請聯繫管理員' }, { status: 400 });
  }
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const urls: string[] = [];
  for (const file of files) {
    const ext = allowedTypes[file.type];
    if (!ext) {
      return Response.json({ error: `不支援的圖片格式：${file.type || file.name}` }, { status: 400 });
    }
    if (file.size > maxFileSize) {
      return Response.json({ error: `${file.name} 檔案大小超過 12MB` }, { status: 400 });
    }

    const id = crypto.randomUUID().slice(0, 8);
    const filename = `${Date.now()}-${id}-${safeName(file.name)}${ext}`;
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(filePath, buffer, { flag: 'wx' });
    urls.push(`/media/uploads/${today}/${filename}`);
  }

  return Response.json({ ok: true, urls });
};
