import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { setSettings } from '@/lib/settings';
import { resolveStyle, resolveTemplate } from '@/lib/theme';

export const POST: APIRoute = async ({ request, cookies }) => {
  await requireAdmin(cookies);
  const body = await request.json();
  await setSettings({
    siteName: String(body.siteName || ''),
    salespersonName: String(body.salespersonName || ''),
    lineUrl: String(body.lineUrl || ''),
    phoneNumber: String(body.phoneNumber || ''),
    homepageEyebrow: String(body.homepageEyebrow || ''),
    homepageTitle: String(body.homepageTitle || ''),
    homepageLead: String(body.homepageLead || ''),
    homepageNote: String(body.homepageNote || ''),
    homepageBadge: String(body.homepageBadge || ''),
    featuredEyebrow: String(body.featuredEyebrow || ''),
    featuredTitle: String(body.featuredTitle || ''),
    listingEyebrow: String(body.listingEyebrow || ''),
    listingTitle: String(body.listingTitle || ''),
    listingLead: String(body.listingLead || ''),
    detailNotesEyebrow: String(body.detailNotesEyebrow || ''),
    detailNotesTitle: String(body.detailNotesTitle || ''),
    footerDisclaimer: String(body.footerDisclaimer || ''),
    activeTemplate: resolveTemplate(body.activeTemplate),
    activeStyle: resolveStyle(body.activeStyle),
    importBehavior: ['draft_first', 'auto_publish', 'import_only'].includes(body.importBehavior) ? body.importBehavior : 'draft_first',
    showSoldVehicles: body.showSoldVehicles === true,
  });
  return Response.json({ ok: true });
};
