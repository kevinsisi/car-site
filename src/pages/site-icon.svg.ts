import type { APIRoute } from 'astro';
import { getSettings } from '@/lib/settings';
import { buildDefaultSiteIconSvg } from '@/lib/site-icon';

export const GET: APIRoute = async () => {
  const settings = await getSettings();
  return new Response(buildDefaultSiteIconSvg(settings), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
