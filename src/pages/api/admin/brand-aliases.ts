import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { setBrandAliases } from '@/lib/brand-aliases';

export const POST: APIRoute = async ({ request, cookies }) => {
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.BRANDS_VIEW);
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
  );
  return Response.json({ ok: true });
};
