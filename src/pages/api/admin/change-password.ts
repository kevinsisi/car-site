import { eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { adminUsers } from '@/db/schema';
import { getAdminOrResponse } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/crypto';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return Response.json({ error: 'Authentication storage unavailable' }, { status: 503 });
  }
  try {
    const db = runtimeEnv?.DB_PREVIEW
      ? await createD1Db(runtimeEnv.DB_PREVIEW)
      : (await import('@/db/connection')).db;
    const authOptions = {
      db,
      ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
    };
    const _admin = await getAdminOrResponse(cookies, authOptions);
    if (_admin instanceof Response) return _admin;
    const admin = _admin;
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
  } catch (error) {
    if (locals.runtime) return Response.json({ error: 'Authentication storage unavailable' }, { status: 503 });
    throw error;
  }
};
