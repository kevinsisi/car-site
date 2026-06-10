import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, createSession } from '@/lib/auth';
import { hashIp, logAdminActivity } from '@/lib/analytics';

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;

interface AttemptRecord {
  fails: number;
  firstAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function getKey(request: Request, username: string): string {
  const ip = getClientIp(request);
  return `${ip}::${username.toLowerCase()}`;
}

function isLocked(key: string): boolean {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (rec.lockedUntil > Date.now()) return true;
  if (Date.now() - rec.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return false;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.firstAt > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { fails: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  rec.fails += 1;
  if (rec.fails >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS;
  }
  attempts.set(key, rec);
}

function clearAttempts(key: string): void {
  attempts.delete(key);
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const username = String(form.get('username') || '');
  const password = String(form.get('password') || '');
  const key = getKey(request, username);

  if (isLocked(key)) {
    return redirect('/admin/login?limited=1');
  }

  const session = await createSession(username, password);
  if (!session) {
    recordFailure(key);
    return redirect('/admin/login?error=1');
  }

  clearAttempts(key);
  cookies.set(ADMIN_COOKIE, session.cookieValue, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: import.meta.env.PROD,
    expires: new Date(session.expiresAt),
  });

  const ip = getClientIp(request);
  logAdminActivity({
    userId: session.user.id,
    username: session.user.username,
    action: 'login',
    ipHash: hashIp(ip),
  }).catch(() => {});

  return redirect('/admin');
};
