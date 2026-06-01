import { asc, eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';

export const GET: APIRoute = async ({ cookies }) => {
  await requireAdmin(cookies);
  const rows = await db
    .select({ id: adminUsers.id, username: adminUsers.username, createdAt: adminUsers.createdAt })
    .from(adminUsers)
    .orderBy(asc(adminUsers.createdAt));
  return Response.json({ accounts: rows });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  await requireAdmin(cookies);
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username) return Response.json({ error: '請輸入帳號' }, { status: 400 });
  if (username.length < 3) return Response.json({ error: '帳號長度至少 3 個字元' }, { status: 400 });
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) return Response.json({ error: '帳號只能使用英文字母、數字、底線、點與短橫線' }, { status: 400 });
  if (password.length < 8) return Response.json({ error: '密碼長度至少 8 個字元' }, { status: 400 });

  const existing = await db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
  if (existing.length) {
    return Response.json({ error: `帳號「${username}」已存在` }, { status: 400 });
  }
  await db.insert(adminUsers).values({
    id: crypto.randomUUID(),
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
};
