import { asc, eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { adminUsers } from '@/db/schema';
import { getAdminOrResponse } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';

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

export const GET: APIRoute = async ({ cookies, locals }) => {
  const requestDb = await getRequestDb(locals);
  if (requestDb instanceof Response) return requestDb;
  const _auth = await getAdminOrResponse(cookies, requestDb);
  if (_auth instanceof Response) return _auth;
  const selection = requestDb.db
    .select({ id: adminUsers.id, username: adminUsers.username, createdAt: adminUsers.createdAt })
    .from(adminUsers);
  const rows = locals.runtime
    ? await selection.orderBy(asc(adminUsers.createdAt), asc(adminUsers.id)).limit(100)
    : await selection.orderBy(asc(adminUsers.createdAt));
  return Response.json({ accounts: rows });
};

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const requestDb = await getRequestDb(locals);
  if (requestDb instanceof Response) return requestDb;
  const _auth = await getAdminOrResponse(cookies, requestDb);
  if (_auth instanceof Response) return _auth;
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username) return Response.json({ error: '請輸入帳號' }, { status: 400 });
  if (username.length < 3) return Response.json({ error: '帳號長度至少 3 個字元' }, { status: 400 });
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) return Response.json({ error: '帳號只能使用英文字母、數字、底線、點與短橫線' }, { status: 400 });
  if (password.length < 8) return Response.json({ error: '密碼長度至少 8 個字元' }, { status: 400 });

  const existing = await requestDb.db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
  if (existing.length) {
    return Response.json({ error: `帳號「${username}」已存在` }, { status: 400 });
  }
  await requestDb.db.insert(adminUsers).values({
    id: crypto.randomUUID(),
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
};
