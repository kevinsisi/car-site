import type { APIRoute } from 'astro';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/crypto';

export const GET: APIRoute = async ({ cookies }) => {
  await requirePermission(cookies, PERMISSIONS.USERS_MANAGE);
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
  const creator = await requirePermission(cookies, PERMISSIONS.USERS_MANAGE);
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
  return Response.json({ ok: true });
};
