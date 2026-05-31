import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
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
  await requireAdmin(cookies);
  const formData = await request.formData();
  const files = formData.getAll('files').filter((file): file is File => file instanceof File);

  if (!files.length) {
    return Response.json({ error: 'No files uploaded' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const uploadDir = path.resolve(mediaRoot, 'uploads', today);
  if (!uploadDir.startsWith(mediaRoot + path.sep)) {
    return Response.json({ error: 'Invalid upload path' }, { status: 400 });
  }
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const urls: string[] = [];
  for (const file of files) {
    const ext = allowedTypes[file.type];
    if (!ext) {
      return Response.json({ error: `Unsupported image type: ${file.type || file.name}` }, { status: 400 });
    }
    if (file.size > maxFileSize) {
      return Response.json({ error: `${file.name} is larger than 12MB` }, { status: 400 });
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
