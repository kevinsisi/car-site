import { eq } from 'drizzle-orm';
import { defineMiddleware } from 'astro:middleware';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { verifyPassword } from '@/lib/crypto';
import { migrateFeatures } from '@/lib/migrate-features';
import { detectBot, detectDeviceType, hashIp, logPageView, normalizeReferrer } from '@/lib/analytics';

const SESSION_COOKIE = 'car_site_session';
const SESSION_TTL_SECONDS = 24 * 60 * 60;

const PUBLIC_PATHS = ['/', '/about', '/sell', '/contact', '/price-doc'];
const PUBLIC_PREFIXES = ['/cars/'];

function isPublicPage(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getVehicleSlug(pathname: string): string | null {
  if (pathname.startsWith('/cars/') && pathname !== '/cars/') {
    const slug = pathname.slice('/cars/'.length).split('/')[0];
    return slug || null;
  }
  return null;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

const sameHostPost = (request: Request) => {
  if (request.method !== 'POST') return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const FORCE_CHANGE_ALLOWLIST = ['/admin/account', '/admin/login', '/api/admin/change-password', '/api/admin/logout'];

let migrationPromise: Promise<void> | null = null;

export const onRequest = defineMiddleware(async (context, next) => {
  if (!migrationPromise) {
    migrationPromise = migrateFeatures();
  }
  await migrationPromise;

  if (context.url.pathname.startsWith('/api/admin/') && !sameHostPost(context.request)) {
    return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
  }
  context.locals.admin = (await getSession(context.cookies)) || undefined;

  if (context.locals.admin && context.url.pathname.startsWith('/admin')) {
    const allowed = FORCE_CHANGE_ALLOWLIST.some((p) => context.url.pathname === p || context.url.pathname.startsWith(p + '/'));
    if (!allowed) {
      const user = (await db.select().from(adminUsers).where(eq(adminUsers.id, context.locals.admin.id)).limit(1))[0];
      if (user && verifyPassword('change-me-now', user.passwordHash)) {
        return context.redirect('/admin/account?force=1');
      }
    }
  }

  const shouldTrack =
    context.request.method === 'GET' &&
    isPublicPage(context.url.pathname) &&
    !context.url.pathname.startsWith('/api/') &&
    !context.url.pathname.startsWith('/admin');

  if (!shouldTrack) return next();

  const ua = context.request.headers.get('user-agent') || '';
  const isBot = detectBot(ua);
  const deviceType = detectDeviceType(ua);
  const ip = getClientIp(context.request);
  const ipHash = hashIp(ip);
  const referrerRaw = context.request.headers.get('referer');
  const siteOrigin = context.url.origin;
  const referrer = normalizeReferrer(referrerRaw, siteOrigin);
  const vehicleSlug = getVehicleSlug(context.url.pathname);

  let sessionId = context.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }
  context.cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    secure: import.meta.env.PROD,
  });

  const start = Date.now();
  const response = await next();
  const durationMs = Date.now() - start;

  logPageView({
    path: context.url.pathname,
    vehicleSlug,
    sessionId,
    ipHash,
    deviceType,
    referrer,
    statusCode: response.status,
    durationMs,
    isBot,
  }).catch((err) => console.error('[analytics] logPageView failed:', err));

  return response;
});
