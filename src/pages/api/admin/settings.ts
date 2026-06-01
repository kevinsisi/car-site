import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { detailSpecFieldOptions } from '@/lib/detail-spec-fields';
import { setSettings } from '@/lib/settings';
import { resolveStyle, resolveTemplate } from '@/lib/theme';

const allowedDetailSpecFields = new Set<string>(detailSpecFieldOptions.map((field) => field.key));

export const POST: APIRoute = async ({ request, cookies }) => {
  await requireAdmin(cookies);
  const body = await request.json();
  await setSettings({
    siteName: String(body.siteName || ''),
    salespersonName: String(body.salespersonName || ''),
    lineUrl: String(body.lineUrl || ''),
    instagramUrl: String(body.instagramUrl || ''),
    facebookUrl: String(body.facebookUrl || ''),
    threadsUrl: String(body.threadsUrl || ''),
    tiktokUrl: String(body.tiktokUrl || ''),
    phoneNumber: String(body.phoneNumber || ''),
    storeAddress: String(body.storeAddress || ''),
    businessHours: String(body.businessHours || ''),
    homepageEyebrow: String(body.homepageEyebrow || ''),
    homepageTitle: String(body.homepageTitle || ''),
    homepageLead: String(body.homepageLead || ''),
    homepageNote: String(body.homepageNote || ''),
    homepageBadge: String(body.homepageBadge || ''),
    featuredEyebrow: String(body.featuredEyebrow || ''),
    featuredTitle: String(body.featuredTitle || ''),
    featuredCount: (() => {
      const n = Number.parseInt(String(body.featuredCount ?? ''), 10);
      return Number.isFinite(n) && n >= 1 && n <= 12 ? String(n) : '3';
    })(),
    listingEyebrow: String(body.listingEyebrow || ''),
    listingTitle: String(body.listingTitle || ''),
    listingLead: String(body.listingLead || ''),
    cardTitleTemplate: String(body.cardTitleTemplate || ''),
    detailNotesEyebrow: String(body.detailNotesEyebrow || ''),
    detailNotesTitle: String(body.detailNotesTitle || ''),
    shareMessageTemplate: String(body.shareMessageTemplate || ''),
    detailSpecFields: Array.isArray(body.detailSpecFields)
      ? body.detailSpecFields.filter((field: unknown): field is string => typeof field === 'string' && allowedDetailSpecFields.has(field))
      : undefined,
    footerDisclaimer: String(body.footerDisclaimer || ''),
    heroVehicleSlug: String(body.heroVehicleSlug || ''),
    activeTemplate: resolveTemplate(body.activeTemplate),
    activeStyle: resolveStyle(body.activeStyle),
    importBehavior: ['draft_first', 'auto_publish', 'import_only'].includes(body.importBehavior) ? body.importBehavior : 'draft_first',
    showSoldVehicles: body.showSoldVehicles === true,
  });
  return Response.json({ ok: true });
};
