import { count, eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { adminUsers } from '@/db/schema';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';

type RequestDb = Awaited<ReturnType<typeof createD1Db>>;

async function getRequestDb(locals: App.Locals): Promise<{ db: RequestDb; sessionSecret?: string } | Response> {
  const runtime = locals.runtime;
  if (!runtime) {
    const { db } = await import('@/db/connection');
    return { db: db as unknown as RequestDb };
  }
  const env = runtime.env as { DB_PREVIEW?: Parameters<typeof createD1Db>[0]; SESSION_SECRET?: string };
  if (!env.DB_PREVIEW || !env.SESSION_SECRET) {
    return Response.json({ error: 'Worker database or session configuration is unavailable' }, { status: 503 });
  }
  return { db: await createD1Db(env.DB_PREVIEW), sessionSecret: env.SESSION_SECRET };
}

export const DELETE: APIRoute = async ({ params, cookies, locals }) => {
  const requestDb = await getRequestDb(locals);
  if (requestDb instanceof Response) return requestDb;
  const _admin = await getPermittedOrResponse(cookies, PERMISSIONS.USERS_MANAGE, requestDb);
  if (_admin instanceof Response) return _admin;
  const admin = _admin;
  if (admin.role !== 'superadmin') {
    return Response.json({ error: '只有 superadmin 可以刪除用戶' }, { status: 403 });
  }
  const id = String(params.id || '');
  if (!id) return Response.json({ error: '缺少帳號 ID' }, { status: 400 });
  if (id === admin.id) {
    return Response.json({ error: '無法刪除目前登入的帳號' }, { status: 400 });
  }
  const [accountCount] = await requestDb.db.select({ value: count() }).from(adminUsers);
  if (accountCount.value <= 1) {
    return Response.json({ error: '至少需要保留一個管理員帳號' }, { status: 400 });
  }
  const target = await requestDb.db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!target.length) {
    return Response.json({ error: '找不到該帳號' }, { status: 404 });
  }
  if (target[0].role === 'superadmin') {
    return Response.json({ error: '不能刪除 superadmin' }, { status: 400 });
  }
  await requestDb.db.delete(adminUsers).where(eq(adminUsers.id, id));
  return Response.json({ ok: true });
};
