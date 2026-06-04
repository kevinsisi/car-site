import type { APIRoute } from 'astro';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { markSellInquiryRead } from '@/lib/sell-inquiries';

export const POST: APIRoute = async ({ params, cookies }) => {
  await requirePermission(cookies, PERMISSIONS.SELL_INQUIRIES);
  await markSellInquiryRead(params.id!);
  return Response.json({ ok: true });
};
