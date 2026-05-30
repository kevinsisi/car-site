import { defineMiddleware } from 'astro:middleware';
import { getSession } from '@/lib/auth';

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

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith('/api/admin/') && !sameHostPost(context.request)) {
    return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
  }
  context.locals.admin = (await getSession(context.cookies)) || undefined;
  return next();
});
