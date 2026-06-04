import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { sanitizeImageUrl, sanitizePublicHref } from '@/lib/safe-url';
import { setSettings } from '@/lib/settings';
import { fetchVideoThumbnail } from '@/lib/video-links';

const videoPositions = new Set(['below-hero', 'below-featured', 'above-footer']);

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

  const videos = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const url = sanitizePublicHref(record.url);
    if (!url) continue;
    const type = record.type === 'mp4' ? 'mp4' : 'youtube';
    let thumbnailUrl = sanitizeImageUrl(record.thumbnailUrl);
    if (!thumbnailUrl) thumbnailUrl = (await fetchVideoThumbnail(url)) || '';
    videos.push({
      id: String(record.id || crypto.randomUUID()),
      url,
      type,
      thumbnailUrl,
      label: String(record.label || ''),
    });
  }
  return videos;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const _user = await getAdminOrResponse(cookies);
  if (_user instanceof Response) return _user;
  const user = _user;
  const canVideos = user.role === 'superadmin' || (user.permissions & (PERMISSIONS.VIDEOS_CAROUSEL | PERMISSIONS.VIDEOS_LINKS)) !== 0;
  if (!canVideos) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });

  const body = await request.json();
  const updates: Parameters<typeof setSettings>[0] = {};
  if (body.heroVideos !== undefined) updates.heroVideos = await sanitizeHeroVideos(body.heroVideos);
  if (typeof body.videoSectionEnabled === 'boolean') updates.videoSectionEnabled = body.videoSectionEnabled;
  if (body.videoSectionPosition !== undefined) updates.videoSectionPosition = videoPositions.has(String(body.videoSectionPosition)) ? String(body.videoSectionPosition) : 'below-hero';
  if (typeof body.videoLinksEnabled === 'boolean') updates.videoLinksEnabled = body.videoLinksEnabled;
  if (body.videoLinksSectionTitle !== undefined) updates.videoLinksSectionTitle = String(body.videoLinksSectionTitle || '');

  await setSettings(updates);
  return Response.json({ ok: true });
};
