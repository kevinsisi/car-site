import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const _actor = await getPermittedOrResponse(cookies, PERMISSIONS.USERS_MANAGE);
  if (_actor instanceof Response) return _actor;
  const actor = _actor;
  if (actor.role !== 'superadmin') {
    return Response.json({ error: '只有 superadmin 可以刪除用戶' }, { status: 403 });
  }
  const targetId = params.id!;
  if (targetId === actor.id) {
    return Response.json({ error: '不能刪除自己的帳號' }, { status: 400 });
  }
  const target = await db.select({ role: adminUsers.role }).from(adminUsers).where(eq(adminUsers.id, targetId)).limit(1);
  if (!target[0]) {
    return Response.json({ error: '用戶不存在' }, { status: 404 });
  }
  if (target[0].role === 'superadmin') {
    return Response.json({ error: '不能刪除 superadmin' }, { status: 400 });
  }
  await db.delete(adminUsers).where(eq(adminUsers.id, targetId));
  return Response.json({ ok: true });
};
