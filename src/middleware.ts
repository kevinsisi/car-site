import { defineMiddleware } from 'astro:middleware';
import { getSession } from '@/lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.admin = (await getSession(context.cookies)) || undefined;
  return next();
});
