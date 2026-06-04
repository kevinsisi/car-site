import { and, eq, gt } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { db } from '@/db/connection';
import { adminSessions, adminUsers } from '@/db/schema';
import { ONE_DAY_SECONDS } from './config';
import { signSession, verifyPassword, verifySignedSession } from './crypto';
import { hasPermission } from './permissions';

export interface AdminUserSession {
  id: string;
  username: string;
  role: string;
  permissions: number;
}

export const ADMIN_COOKIE = 'car_site_admin';

export async function createSession(username: string, password: string) {
  const user = (await db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1))[0];
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * ONE_DAY_SECONDS * 1000).toISOString();
  const sessionId = crypto.randomUUID();
  await db.insert(adminSessions).values({ id: sessionId, userId: user.id, expiresAt, createdAt: now.toISOString() });
  return { cookieValue: signSession(sessionId), expiresAt, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions } };
}

export async function getSession(cookies: AstroCookies): Promise<AdminUserSession | null> {
  const signed = cookies.get(ADMIN_COOKIE)?.value;
  if (!signed) return null;
  const sessionId = verifySignedSession(signed);
  if (!sessionId) return null;
  const rows = await db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      role: adminUsers.role,
      permissions: adminUsers.permissions,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.id, sessionId), gt(adminSessions.expiresAt, new Date().toISOString())))
    .limit(1);
  return rows[0] || null;
}

export async function destroySession(cookies: AstroCookies) {
  const signed = cookies.get(ADMIN_COOKIE)?.value;
  const sessionId = signed ? verifySignedSession(signed) : null;
  if (sessionId) await db.delete(adminSessions).where(eq(adminSessions.id, sessionId));
  cookies.delete(ADMIN_COOKIE, { path: '/' });
}

export async function requireAdmin(cookies: AstroCookies): Promise<AdminUserSession> {
  const user = await getSession(cookies);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  return user;
}

// Returns user or a Response (401/403) — API routes must check: if (result instanceof Response) return result;
export async function getAdminOrResponse(cookies: AstroCookies): Promise<AdminUserSession | Response> {
  const user = await getSession(cookies);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  return user;
}

export async function getPermittedOrResponse(cookies: AstroCookies, required: number): Promise<AdminUserSession | Response> {
  const user = await getSession(cookies);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  if (user.role !== 'superadmin' && !hasPermission(user.permissions, required)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  return user;
}

export async function requirePermission(cookies: AstroCookies, required: number): Promise<AdminUserSession> {
  const user = await requireAdmin(cookies);
  if (user.role !== 'superadmin' && !hasPermission(user.permissions, required)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return user;
}

export async function hasAnyUsers(): Promise<boolean> {
  const rows = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  return rows.length > 0;
}
