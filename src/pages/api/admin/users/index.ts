import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/crypto';
import { hashIp, logAdminActivity } from '@/lib/analytics';

export const GET: APIRoute = async ({ cookies }) => {
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.USERS_MANAGE);
  if (_auth instanceof Response) return _auth;
  const user = _auth;
  const rows = await db.select({
    id: adminUsers.id,
    username: adminUsers.username,
    role: adminUsers.role,
    permissions: adminUsers.permissions,
    createdAt: adminUsers.createdAt,
  }).from(adminUsers).orderBy(asc(adminUsers.createdAt));
  return Response.json(rows);
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const _creator = await getPermittedOrResponse(cookies, PERMISSIONS.USERS_MANAGE);
  if (_creator instanceof Response) return _creator;
  const creator = _creator;
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
  logAdminActivity({
    userId: creator.id,
    username: creator.username,
    action: 'user_create',
    targetType: 'user',
    details: { createdUsername: username, permissions },
    ipHash: hashIp(ip),
  }).catch(() => {});

  return Response.json({ ok: true });
};
