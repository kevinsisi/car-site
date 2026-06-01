import { eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/crypto';

export const POST: APIRoute = async ({ request, cookies }) => {
  const admin = await requireAdmin(cookies);
  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (!currentPassword || !newPassword) {
    return Response.json({ error: '請輸入目前密碼與新密碼' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ error: '新密碼長度至少 8 個字元' }, { status: 400 });
  }
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.id, admin.id)).limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return Response.json({ error: '目前密碼不正確' }, { status: 400 });
  }
  if (verifyPassword(newPassword, user.passwordHash)) {
    return Response.json({ error: '新密碼與目前密碼相同' }, { status: 400 });
  }
  await db.update(adminUsers).set({ passwordHash: hashPassword(newPassword) }).where(eq(adminUsers.id, admin.id));
  return Response.json({ ok: true });
};
