import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { setBrandAliases } from '@/lib/brand-aliases';

export const POST: APIRoute = async ({ request, cookies }) => {
  await requireAdmin(cookies);
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
