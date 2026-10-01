import type { APIRoute } from 'astro';
import { getSettings } from '@/lib/settings';
import { buildDefaultSiteIconSvg } from '@/lib/site-icon';
import { createD1Db } from '@/db/d1';

export const GET: APIRoute = async ({ locals }) => {
  const runtime = locals.runtime;
  const binding = runtime?.env?.DB_PREVIEW;
  if (runtime && !binding) return new Response('Preview database unavailable', { status: 503 });
  const adapter = binding ? await createD1Db(binding) : undefined;
  const settings = await getSettings(adapter);
  return new Response(buildDefaultSiteIconSvg(settings), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
