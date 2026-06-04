import { eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { getAdminOrResponse } from '@/lib/auth';

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const _admin = await getAdminOrResponse(cookies);
  if (_admin instanceof Response) return _admin;
  const admin = _admin;
  const id = String(params.id || '');
  if (!id) return Response.json({ error: '缺少帳號 ID' }, { status: 400 });
  if (id === admin.id) {
    return Response.json({ error: '無法刪除目前登入的帳號' }, { status: 400 });
  }
  const all = await db.select({ id: adminUsers.id }).from(adminUsers);
  if (all.length <= 1) {
    return Response.json({ error: '至少需要保留一個管理員帳號' }, { status: 400 });
  }
  const target = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!target.length) {
    return Response.json({ error: '找不到該帳號' }, { status: 404 });
  }
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  return Response.json({ ok: true });
};
