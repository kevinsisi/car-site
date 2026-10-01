import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { destroySession } from '@/lib/auth';

export const POST: APIRoute = async ({ cookies, redirect, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return new Response('Authentication storage unavailable', { status: 503 });
  }
  try {
    const db = runtimeEnv?.DB_PREVIEW ? await createD1Db(runtimeEnv.DB_PREVIEW) : undefined;
    await destroySession(cookies, {
      ...(db ? { db } : {}),
      ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
    });
  } catch (error) {
    if (locals.runtime) return new Response('Authentication storage unavailable', { status: 503 });
    throw error;
  }
  return redirect('/admin/login');
};
