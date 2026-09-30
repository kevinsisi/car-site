import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { markSellInquiryRead } from '@/lib/sell-inquiries';
import { createD1Db } from '@/db/d1';

export const POST: APIRoute = async ({ params, cookies, locals }) => {
  const runtime = locals.runtime;
  const binding = runtime?.env?.DB_PREVIEW;
  const sessionSecret = runtime?.env?.SESSION_SECRET;
  if (runtime && (!binding || !sessionSecret)) return new Response('Preview database unavailable', { status: 503 });
  const adapter = binding ? await createD1Db(binding) : undefined;
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.SELL_INQUIRIES, { db: adapter, sessionSecret });
  if (_auth instanceof Response) return _auth;
  await markSellInquiryRead(params.id!, adapter);
  return Response.json({ ok: true });
};
