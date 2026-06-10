import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { hashIp, logAdminActivity } from '@/lib/analytics';
import { detailSpecFieldOptions } from '@/lib/detail-spec-fields';
import { FEATURE_DIRECT_CONTACT, FEATURE_SELL_INQUIRY, FEATURE_SOCIAL_ICONS, FEATURE_AI_CHATBOT, effectiveFeatureMask, hasFeature } from '@/lib/features';
import { sanitizeImageUrl, sanitizePublicHref } from '@/lib/safe-url';
import { getSettings, parseSocialIcons, setSettings, type GalleryMode, type SiteSettings } from '@/lib/settings';
import { resolveStyle, resolveTemplate } from '@/lib/theme';

const allowedDetailSpecFields = new Set<string>(detailSpecFieldOptions.map((field) => field.key));
const galleryModes = new Set<GalleryMode>(['lightbox', 'slider', 'thumbnail-strip', 'grid']);

function hasOwn(body: Record<string, unknown>, key: keyof SiteSettings): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function jsonError(error: string, status = 403): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const _user = await getAdminOrResponse(cookies);
  if (_user instanceof Response) return _user;
  const user = _user;
  const settingsPerms = PERMISSIONS.SETTINGS_BASIC | PERMISSIONS.SETTINGS_LAYOUT | PERMISSIONS.SETTINGS_GALLERY | PERMISSIONS.SETTINGS_AI_CHATBOT;
  if (user.role !== 'superadmin' && (user.permissions & settingsPerms) === 0) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const body = await request.json() as Record<string, unknown>;
  const updates: Partial<Record<keyof SiteSettings, unknown>> = {};
  const currentSettings = await getSettings();
  const currentMask = effectiveFeatureMask(currentSettings.featureMask, currentSettings.featureLicenseMask);
  const licenseMask = currentSettings.featureLicenseMask;
  const directFields: (keyof SiteSettings)[] = ['lineUrl', 'phoneNumber'];
  const socialFields: (keyof SiteSettings)[] = ['instagramUrl', 'facebookUrl', 'threadsUrl', 'tiktokUrl', 'socialIcons'];
  const smtpFields: (keyof SiteSettings)[] = ['notificationEmail', 'gmailUser', 'gmailAppPassword'];
  const aiChatFields: (keyof SiteSettings)[] = ['aiChatOpening', 'aiChatTone'];

  if (!hasFeature(currentMask, FEATURE_DIRECT_CONTACT) && directFields.some((key) => hasOwn(body, key))) return jsonError('direct contact feature disabled');
  if (!hasFeature(currentMask, FEATURE_SOCIAL_ICONS) && socialFields.some((key) => hasOwn(body, key))) return jsonError('social feature disabled');
  if (!hasFeature(currentMask, FEATURE_SELL_INQUIRY) && smtpFields.some((key) => hasOwn(body, key))) return jsonError('sell inquiry feature disabled');
  if (!hasFeature(licenseMask, FEATURE_AI_CHATBOT) && aiChatFields.some((key) => hasOwn(body, key))) return jsonError('ai chatbot feature disabled');
  if (aiChatFields.some((key) => hasOwn(body, key)) && user.role !== 'superadmin' && !hasPermission(user.permissions, PERMISSIONS.SETTINGS_AI_CHATBOT)) return jsonError('forbidden');

  if (hasOwn(body, 'siteName')) updates.siteName = String(body.siteName || '');
  if (hasOwn(body, 'siteIconUrl')) updates.siteIconUrl = sanitizeImageUrl(body.siteIconUrl);
  if (hasOwn(body, 'salespersonName')) updates.salespersonName = String(body.salespersonName || '');
  if (hasOwn(body, 'lineUrl')) updates.lineUrl = sanitizePublicHref(body.lineUrl);
  if (hasOwn(body, 'instagramUrl')) updates.instagramUrl = sanitizePublicHref(body.instagramUrl);
  if (hasOwn(body, 'facebookUrl')) updates.facebookUrl = sanitizePublicHref(body.facebookUrl);
  if (hasOwn(body, 'threadsUrl')) updates.threadsUrl = sanitizePublicHref(body.threadsUrl);
  if (hasOwn(body, 'tiktokUrl')) updates.tiktokUrl = sanitizePublicHref(body.tiktokUrl);
  if (hasOwn(body, 'phoneNumber')) updates.phoneNumber = String(body.phoneNumber || '');
  if (hasOwn(body, 'storeAddress')) updates.storeAddress = String(body.storeAddress || '');
  if (hasOwn(body, 'businessHours')) updates.businessHours = String(body.businessHours || '');
  if (hasOwn(body, 'homepageEyebrow')) updates.homepageEyebrow = String(body.homepageEyebrow || '');
  if (hasOwn(body, 'homepageTitle')) updates.homepageTitle = String(body.homepageTitle || '');
  if (hasOwn(body, 'homepageLead')) updates.homepageLead = String(body.homepageLead || '');
  if (hasOwn(body, 'homepageNote')) updates.homepageNote = String(body.homepageNote || '');
  if (hasOwn(body, 'homepageBadge')) updates.homepageBadge = String(body.homepageBadge || '');
  if (hasOwn(body, 'featuredEyebrow')) updates.featuredEyebrow = String(body.featuredEyebrow || '');
  if (hasOwn(body, 'featuredTitle')) updates.featuredTitle = String(body.featuredTitle || '');
  if (hasOwn(body, 'featuredCount')) {
    const n = Number.parseInt(String(body.featuredCount ?? ''), 10);
    updates.featuredCount = Number.isFinite(n) && n >= 1 && n <= 12 ? String(n) : '3';
  }
  if (hasOwn(body, 'listingEyebrow')) updates.listingEyebrow = String(body.listingEyebrow || '');
  if (hasOwn(body, 'listingTitle')) updates.listingTitle = String(body.listingTitle || '');
  if (hasOwn(body, 'listingLead')) updates.listingLead = String(body.listingLead || '');
  if (hasOwn(body, 'cardTitleTemplate')) updates.cardTitleTemplate = String(body.cardTitleTemplate || '');
  if (hasOwn(body, 'detailNotesEyebrow')) updates.detailNotesEyebrow = String(body.detailNotesEyebrow || '');
  if (hasOwn(body, 'detailNotesTitle')) updates.detailNotesTitle = String(body.detailNotesTitle || '');
  if (hasOwn(body, 'shareMessageTemplate')) updates.shareMessageTemplate = String(body.shareMessageTemplate || '');
  if (hasOwn(body, 'detailSpecFields')) {
    updates.detailSpecFields = Array.isArray(body.detailSpecFields)
      ? body.detailSpecFields.filter((field: unknown): field is string => typeof field === 'string' && allowedDetailSpecFields.has(field))
      : undefined;
  }
  if (hasOwn(body, 'footerDisclaimer')) updates.footerDisclaimer = String(body.footerDisclaimer || '');
  if (hasOwn(body, 'heroVehicleSlug')) updates.heroVehicleSlug = String(body.heroVehicleSlug || '');
  if (hasOwn(body, 'activeTemplate')) updates.activeTemplate = resolveTemplate(String(body.activeTemplate || ''));
  if (hasOwn(body, 'activeStyle')) updates.activeStyle = resolveStyle(String(body.activeStyle || ''));
  if (hasOwn(body, 'importBehavior')) updates.importBehavior = ['draft_first', 'auto_publish', 'import_only'].includes(String(body.importBehavior)) ? body.importBehavior : 'draft_first';
  if (hasOwn(body, 'showSoldVehicles')) updates.showSoldVehicles = body.showSoldVehicles === true;
  if (hasOwn(body, 'featureMask')) {
    if (user.role !== 'superadmin') return jsonError('forbidden');
    const n = Number.parseInt(String(body.featureMask ?? ''), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 1023) updates.featureMask = n;
  }
  if (hasOwn(body, 'featureLicenseMask')) {
    if (user.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
    const n = Number.parseInt(String(body.featureLicenseMask ?? ''), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 1023) {
      updates.featureLicenseMask = n;
      updates.featureMask = n;
    }
  }
  if (typeof updates.featureMask === 'number' && !hasOwn(body, 'featureLicenseMask')) {
    updates.featureMask = updates.featureMask & licenseMask;
  }
  if (hasOwn(body, 'socialIcons')) updates.socialIcons = parseSocialIcons(typeof body.socialIcons === 'string' ? body.socialIcons : JSON.stringify(body.socialIcons ?? {}));
  if (hasOwn(body, 'galleryMode')) {
    if (!galleryModes.has(body.galleryMode as GalleryMode)) {
      return new Response(JSON.stringify({ error: 'invalid galleryMode' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    updates.galleryMode = body.galleryMode;
  }
  if (hasOwn(body, 'notificationEmail')) updates.notificationEmail = String(body.notificationEmail || '');
  if (hasOwn(body, 'gmailUser')) updates.gmailUser = String(body.gmailUser || '');
  if (hasOwn(body, 'gmailAppPassword')) updates.gmailAppPassword = String(body.gmailAppPassword || '');
  if (hasOwn(body, 'aiChatOpening')) updates.aiChatOpening = String(body.aiChatOpening || '');
  if (hasOwn(body, 'aiChatTone')) updates.aiChatTone = String(body.aiChatTone || '');

  await setSettings(updates);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown';
  logAdminActivity({
    userId: user.id,
    username: user.username,
    action: 'settings_update',
    targetType: 'settings',
    details: { keys: Object.keys(updates) },
    ipHash: hashIp(ip),
  }).catch(() => {});

  return Response.json({ ok: true });
};
