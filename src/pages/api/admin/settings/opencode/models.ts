import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getAdminOrResponse } from '@/lib/auth';

export const GET: APIRoute = async ({ cookies, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return new Response(JSON.stringify({ error: 'preview bindings unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  const adapter = runtimeEnv?.DB_PREVIEW ? await createD1Db(runtimeEnv.DB_PREVIEW) : undefined;
  const user = await getAdminOrResponse(cookies, {
    ...(adapter ? { db: adapter } : {}),
    ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
  });
  if (user instanceof Response) return user;
  if (user.role !== 'superadmin') {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  if (locals.runtime) return Response.json({ models: [], sourceServerId: null, warning: null });
  const { listOpenCodeModels } = await import('@/lib/opencode-settings');
  const result = await listOpenCodeModels();
  return Response.json(result);
};
