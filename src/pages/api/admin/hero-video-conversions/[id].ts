import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { resolveFrontFeatures } from '@/lib/front-features';
import { getSettings } from '@/lib/settings';

export const POST: APIRoute = async ({ params, cookies, locals }) => {
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

  const _user = await getAdminOrResponse(cookies, authOptions);
  if (_user instanceof Response) return _user;
  const user = _user;
  const settings = await getSettings(adapter);
  const features = resolveFrontFeatures(settings);
  const canVideos = features.heroVideos && (user.role === 'superadmin' || (user.permissions & PERMISSIONS.VIDEOS_CAROUSEL) !== 0);
  if (!canVideos) return Response.json({ error: 'forbidden' }, { status: 403 });

  if (runtime) return Response.json({ error: 'preview_disabled', previewOnly: true }, { status: 501 });

  const { retryHeroVideoConversion } = await import('@/lib/hero-video-conversion');
  const ok = await retryHeroVideoConversion(params.id || '');
  if (!ok) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true });
};
