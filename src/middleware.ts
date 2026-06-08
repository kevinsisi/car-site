import { eq } from 'drizzle-orm';
import { defineMiddleware } from 'astro:middleware';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { verifyPassword } from '@/lib/crypto';
import { migrateFeatures } from '@/lib/migrate-features';

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

  return next();
});
