import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { setVideoLinks } from '@/lib/video-links';

export const POST: APIRoute = async ({ request, cookies }) => {
  const _auth = await getAdminOrResponse(cookies);
  if (_auth instanceof Response) return _auth;
  const body = await request.json();
  if (!Array.isArray(body)) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
  await setVideoLinks(body);
  return Response.json({ ok: true });
};
