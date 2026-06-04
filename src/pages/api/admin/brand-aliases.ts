import type { APIRoute } from 'astro';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { setBrandAliases } from '@/lib/brand-aliases';

export const POST: APIRoute = async ({ request, cookies }) => {
  await requirePermission(cookies, PERMISSIONS.BRANDS_VIEW);
  const body = await request.json();
  if (!Array.isArray(body.aliases)) {
    return Response.json({ error: 'aliases must be an array' }, { status: 400 });
  }
  await setBrandAliases(
    body.aliases.map((item: Record<string, unknown>) => ({
      sourceBrand: String(item.sourceBrand || ''),
      displayName: String(item.displayName || ''),
      urlSlug: String(item.urlSlug || ''),
    })),
  );
  return Response.json({ ok: true });
};
