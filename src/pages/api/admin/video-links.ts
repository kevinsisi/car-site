import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { resolveFrontFeatures } from '@/lib/front-features';
import { getSettings } from '@/lib/settings';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const runtime = (locals as { runtime?: { env?: Record<string, unknown> } }).runtime;
  const env = runtime?.env ?? {};
  let adapter: Awaited<ReturnType<typeof createD1Db>> | undefined;
  let authOptions: { db?: typeof adapter; sessionSecret?: string } = {};
  if (runtime) {
    const binding = env.DB_PREVIEW;
    const sessionSecret = env.SESSION_SECRET;
    if (!binding || typeof sessionSecret !== 'string' || !sessionSecret) {
      return Response.json({ error: 'preview_unavailable' }, { status: 503 });
    }
    adapter = await createD1Db(binding as Parameters<typeof createD1Db>[0]);
    authOptions = { db: adapter, sessionSecret };
  }

  const _auth = await getAdminOrResponse(cookies, authOptions);
  if (_auth instanceof Response) return _auth;
  const settings = await getSettings(adapter);
  const features = resolveFrontFeatures(settings);
  if (!features.videoLinks) {
    return new Response(JSON.stringify({ error: 'video links feature disabled' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  if (_auth.role !== 'superadmin' && (_auth.permissions & PERMISSIONS.VIDEOS_LINKS) === 0) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  if (runtime) return Response.json({ error: 'preview_disabled', previewOnly: true }, { status: 501 });

  const body = await request.json();
  if (!Array.isArray(body)) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
  const { setVideoLinks } = await import('@/lib/video-links');
  const links = await setVideoLinks(body);
  return Response.json({ ok: true, links });
};
