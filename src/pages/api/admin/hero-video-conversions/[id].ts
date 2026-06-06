import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { retryHeroVideoConversion } from '@/lib/hero-video-conversion';

export const POST: APIRoute = async ({ params, cookies }) => {
  const _user = await getAdminOrResponse(cookies);
  if (_user instanceof Response) return _user;
  const user = _user;
  const canVideos = user.role === 'superadmin' || (user.permissions & PERMISSIONS.VIDEOS_CAROUSEL) !== 0;
  if (!canVideos) return Response.json({ error: 'forbidden' }, { status: 403 });

  const ok = await retryHeroVideoConversion(params.id || '');
  if (!ok) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true });
};
