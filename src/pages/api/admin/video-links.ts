import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { resolveFrontFeatures } from '@/lib/front-features';
import { getSettings } from '@/lib/settings';
import { setVideoLinks } from '@/lib/video-links';

export const POST: APIRoute = async ({ request, cookies }) => {
  const _auth = await getAdminOrResponse(cookies);
  if (_auth instanceof Response) return _auth;
  const settings = await getSettings();
  const features = resolveFrontFeatures(settings);
  if (!features.videoLinks) {
    return new Response(JSON.stringify({ error: 'video links feature disabled' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  if (_auth.role !== 'superadmin' && (_auth.permissions & PERMISSIONS.VIDEOS_LINKS) === 0) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const body = await request.json();
  if (!Array.isArray(body)) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
  const links = await setVideoLinks(body);
  return Response.json({ ok: true, links });
};
