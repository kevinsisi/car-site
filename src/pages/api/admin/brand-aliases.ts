import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { setBrandAliases } from '@/lib/brand-aliases';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return new Response('Brand storage unavailable', { status: 503 });
  }
  const adapter = runtimeEnv?.DB_PREVIEW ? await createD1Db(runtimeEnv.DB_PREVIEW) : undefined;
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.BRANDS_VIEW, {
    ...(adapter ? { db: adapter } : {}),
    ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
  });
  if (_auth instanceof Response) return _auth;
  const user = _auth;
  const body = await request.json();
  if (!Array.isArray(body.aliases)) {
    return Response.json({ error: 'aliases must be an array' }, { status: 400 });
  }
  await setBrandAliases(
    body.aliases.map((item: Record<string, unknown>) => ({
      sourceBrand: String(item.sourceBrand || ''),
      displayName: String(item.displayName || ''),
      urlSlug: String(item.urlSlug || ''),
      iconUrl: typeof item.iconUrl === 'string' && item.iconUrl ? item.iconUrl : null,
    })),
    adapter,
  );
  return Response.json({ ok: true });
};
