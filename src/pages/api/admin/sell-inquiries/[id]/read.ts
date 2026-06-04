import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { markSellInquiryRead } from '@/lib/sell-inquiries';

export const POST: APIRoute = async ({ params, cookies }) => {
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.SELL_INQUIRIES);
  if (_auth instanceof Response) return _auth;
  const user = _auth;
  await markSellInquiryRead(params.id!);
  return Response.json({ ok: true });
};
