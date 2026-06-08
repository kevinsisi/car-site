import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { sanitizeImageUrl, sanitizePublicHref } from '@/lib/safe-url';
import { getSettingValue, getSettings, setSettings, type HeroVideo } from '@/lib/settings';
import { fetchVideoThumbnail } from '@/lib/video-links';
import { enqueueHeroVideoConversions } from '@/lib/hero-video-conversion';

const videoPositions = new Set(['above-header', 'below-hero', 'below-featured', 'above-footer']);

async function authorize(cookies: Parameters<APIRoute>[0]['cookies']) {
  const _user = await getAdminOrResponse(cookies);
  if (_user instanceof Response) return _user;
  const user = _user;
  const canVideos = user.role === 'superadmin' || (user.permissions & (PERMISSIONS.VIDEOS_CAROUSEL | PERMISSIONS.VIDEOS_LINKS)) !== 0;
  if (!canVideos) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  return user;
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
    if (!thumbnailUrl) thumbnailUrl = (await fetchVideoThumbnail(url)) || '';
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

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = await authorize(cookies);
  if (user instanceof Response) return user;

  const body = await request.json();
  const updates: Parameters<typeof setSettings>[0] = {};
  let sanitizedHeroVideos: HeroVideo[] | undefined;
  if (body.heroVideos !== undefined) {
    sanitizedHeroVideos = await sanitizeHeroVideos(body.heroVideos);
    updates.heroVideos = sanitizedHeroVideos;
  }
  if (body.videoSectionPosition !== undefined) updates.videoSectionPosition = videoPositions.has(String(body.videoSectionPosition)) ? String(body.videoSectionPosition) : 'below-hero';
  if (body.videoLinksSectionTitle !== undefined) updates.videoLinksSectionTitle = String(body.videoLinksSectionTitle || '');

  await setSettings(updates);
  if (sanitizedHeroVideos) enqueueHeroVideoConversions(sanitizedHeroVideos);
  return Response.json({ ok: true, heroVideos: sanitizedHeroVideos });
};

export const GET: APIRoute = async ({ cookies }) => {
  const user = await authorize(cookies);
  if (user instanceof Response) return user;
  const settings = await getSettings();
  return Response.json({
    heroVideos: settings.heroVideos,
    videoSectionPosition: settings.videoSectionPosition,
    videoLinksSectionTitle: settings.videoLinksSectionTitle,
  });
};
