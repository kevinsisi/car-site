import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { resolveFrontFeatures } from '@/lib/front-features';
import { sanitizeImageUrl, sanitizePublicHref } from '@/lib/safe-url';
import { getSettingValue, getSettings, setSettings, type HeroVideo } from '@/lib/settings';

const videoPositions = new Set(['above-header', 'below-hero', 'below-featured', 'above-footer']);

async function authorize(cookies: Parameters<APIRoute>[0]['cookies'], locals: Parameters<APIRoute>[0]['locals']) {
  const runtime = (locals as { runtime?: { env?: Record<string, unknown> } }).runtime;
  let adapter: Awaited<ReturnType<typeof import('@/db/d1').createD1Db>> | undefined;
  let authOptions: { db?: typeof adapter; sessionSecret?: string } = {};
  if (runtime) {
    const env = runtime.env ?? {};
    const binding = env.DB_PREVIEW;
    const sessionSecret = env.SESSION_SECRET;
    if (!binding || typeof sessionSecret !== 'string' || !sessionSecret) {
      return new Response(JSON.stringify({ error: 'preview_unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
    const { createD1Db } = await import('@/db/d1');
    adapter = await createD1Db(binding as Parameters<typeof createD1Db>[0]);
    authOptions = { db: adapter, sessionSecret };
  }
  const _user = await getAdminOrResponse(cookies, authOptions);
  if (_user instanceof Response) return _user;
  const user = _user;
  const settings = await getSettings(adapter);
  const features = resolveFrontFeatures(settings);
  const canCarousel = features.heroVideos && (user.role === 'superadmin' || (user.permissions & PERMISSIONS.VIDEOS_CAROUSEL) !== 0);
  const canLinks = features.videoLinks && (user.role === 'superadmin' || (user.permissions & PERMISSIONS.VIDEOS_LINKS) !== 0);
  const canVideos = canCarousel || canLinks;
  if (!canVideos) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  return { settings, canCarousel, canLinks, adapter, worker: Boolean(runtime) };
}

function parseExistingHeroVideos(): Promise<HeroVideo[]> {
  return getSettingValue('heroVideos').then((raw) => {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
}

async function sanitizeHeroVideos(value: unknown) {
  let raw = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const existingById = new Map((await parseExistingHeroVideos()).map((video) => [video.id, video]));
  const videos: HeroVideo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const url = sanitizePublicHref(record.url);
    if (!url) continue;
    const type = record.type === 'mp4' ? 'mp4' : 'youtube';
    let thumbnailUrl = sanitizeImageUrl(record.thumbnailUrl);
    if (!thumbnailUrl) {
      const { fetchVideoThumbnail } = await import('@/lib/video-links');
      thumbnailUrl = (await fetchVideoThumbnail(url)) || '';
    }
    const id = String(record.id || crypto.randomUUID());
    const existing = existingById.get(id);
    const sourceUrl = type === 'youtube' ? String(record.sourceUrl || url) : '';
    const sameSource = existing && (existing.sourceUrl || existing.url) === sourceUrl;
    videos.push({
      id,
      url,
      type,
      thumbnailUrl,
      label: String(record.label || ''),
      sourceUrl: type === 'youtube' ? sourceUrl : undefined,
      localUrl: type === 'youtube' && sameSource ? existing.localUrl : undefined,
      conversionStatus: type === 'youtube'
        ? (sameSource && existing.conversionStatus === 'completed' ? 'completed' : 'pending')
        : undefined,
      conversionError: type === 'youtube' && sameSource ? existing.conversionError : undefined,
      convertedAt: type === 'youtube' && sameSource ? existing.convertedAt : undefined,
    });
  }
  return videos;
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const auth = await authorize(cookies, locals);
  if (auth instanceof Response) return auth;
  if (auth.worker) return Response.json({ error: 'preview_disabled', previewOnly: true }, { status: 501 });

  const body = await request.json();
  const updates: Parameters<typeof setSettings>[0] = {};
  let sanitizedHeroVideos: HeroVideo[] | undefined;
  if (body.heroVideos !== undefined) {
    if (!auth.canCarousel) return new Response(JSON.stringify({ error: 'hero videos feature disabled' }), { status: 403, headers: { 'content-type': 'application/json' } });
    sanitizedHeroVideos = await sanitizeHeroVideos(body.heroVideos);
    updates.heroVideos = sanitizedHeroVideos;
  }
  if (body.videoSectionPosition !== undefined) {
    if (!auth.canCarousel) return new Response(JSON.stringify({ error: 'hero videos feature disabled' }), { status: 403, headers: { 'content-type': 'application/json' } });
    updates.videoSectionPosition = videoPositions.has(String(body.videoSectionPosition)) ? String(body.videoSectionPosition) : 'below-hero';
  }
  if (body.videoLinksSectionTitle !== undefined) {
    if (!auth.canLinks) return new Response(JSON.stringify({ error: 'video links feature disabled' }), { status: 403, headers: { 'content-type': 'application/json' } });
    updates.videoLinksSectionTitle = String(body.videoLinksSectionTitle || '');
  }

  await setSettings(updates, auth.adapter);
  if (sanitizedHeroVideos) {
    const { enqueueHeroVideoConversions } = await import('@/lib/hero-video-conversion');
    enqueueHeroVideoConversions(sanitizedHeroVideos);
  }
  return Response.json({ ok: true, heroVideos: sanitizedHeroVideos });
};

export const GET: APIRoute = async ({ cookies, locals }) => {
  const auth = await authorize(cookies, locals);
  if (auth instanceof Response) return auth;
  const settings = auth.settings;
  return Response.json({
    ...(auth.canCarousel ? {
      heroVideos: settings.heroVideos,
      videoSectionPosition: settings.videoSectionPosition,
    } : {}),
    ...(auth.canLinks ? {
      videoLinksSectionTitle: settings.videoLinksSectionTitle,
    } : {}),
  });
};
