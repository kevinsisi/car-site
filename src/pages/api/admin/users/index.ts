import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { adminUsers } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/crypto';

export const GET: APIRoute = async ({ cookies, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return new Response('User storage unavailable', { status: 503 });
  }
  const adapter = runtimeEnv?.DB_PREVIEW ? await createD1Db(runtimeEnv.DB_PREVIEW) : undefined;
  const authOptions = {
    ...(adapter ? { db: adapter } : {}),
    ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
  };
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.USERS_MANAGE, authOptions);
  if (_auth instanceof Response) return _auth;
  const db = adapter ? adapter as unknown as typeof import('@/db/connection').db : (await import('@/db/connection')).db;
  const query = db.select({
    id: adminUsers.id,
    username: adminUsers.username,
    role: adminUsers.role,
    permissions: adminUsers.permissions,
    createdAt: adminUsers.createdAt,
  }).from(adminUsers).orderBy(asc(adminUsers.createdAt), ...(adapter ? [asc(adminUsers.id)] : []));
  const rows = await (adapter ? query.limit(100) : query);
  return Response.json(rows);
};

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return new Response('User storage unavailable', { status: 503 });
  }
  const adapter = runtimeEnv?.DB_PREVIEW ? await createD1Db(runtimeEnv.DB_PREVIEW) : undefined;
  const authOptions = {
    ...(adapter ? { db: adapter } : {}),
    ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
  };
  const _creator = await getPermittedOrResponse(cookies, PERMISSIONS.USERS_MANAGE, authOptions);
  if (_creator instanceof Response) return _creator;
  const creator = _creator;
  const db = adapter ? adapter as unknown as typeof import('@/db/connection').db : (await import('@/db/connection')).db;
  if (creator.role !== 'superadmin') {
    return Response.json({ error: '只有 superadmin 可以建立用戶' }, { status: 403 });
  }
  const body = await request.json();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const permissions = Number(body.permissions) || 0;

  if (!username || password.length < 8) {
    return Response.json({ error: '帳號不得空白，密碼至少 8 字元' }, { status: 400 });
  }
  if ((permissions & creator.permissions) !== permissions) {
    return Response.json({ error: '不能授予超過自身的權限' }, { status: 400 });
  }

  const existing = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
  if (existing.length > 0) {
    return Response.json({ error: '帳號已存在' }, { status: 400 });
  }

  await db.insert(adminUsers).values({
    id: crypto.randomUUID(),
    username,
    passwordHash: hashPassword(password),
    role: 'admin',
    permissions,
    createdAt: new Date().toISOString(),
  });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (!locals.runtime) {
    const { hashIp, logAdminActivity } = await import('@/lib/analytics');
    logAdminActivity({
      userId: creator.id,
      username: creator.username,
      action: 'user_create',
      targetType: 'user',
      details: { createdUsername: username, permissions },
      ipHash: hashIp(ip),
    }).catch(() => {});
  }

  return Response.json({ ok: true });
};
