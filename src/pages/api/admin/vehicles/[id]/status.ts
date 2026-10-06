import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { updateVehicleStatus } from '@/lib/vehicles';
import { isVehicleStatus } from '@/lib/vehicle-status';

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return new Response('Vehicle storage unavailable', { status: 503 });
  }
  const adapter = runtimeEnv?.DB_PREVIEW ? await createD1Db(runtimeEnv.DB_PREVIEW) : undefined;
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.VEHICLES_EDIT, {
    ...(adapter ? { db: adapter } : {}),
    ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
  });
  if (_auth instanceof Response) return _auth;
  const user = _auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!params.id || !isVehicleStatus(body.status)) {
    return Response.json({ error: 'invalid status' }, { status: 400 });
  }
  const updated = await updateVehicleStatus(params.id, body.status, adapter);
  if (!updated) {
    return Response.json({ error: 'vehicle not found' }, { status: 404 });
  }

  if (!locals.runtime) {
    const { hashIp, logAdminActivity } = await import('@/lib/analytics');
    logAdminActivity({
      userId: user.id,
      username: user.username,
      action: 'vehicle_status_change',
      targetType: 'vehicle',
      targetId: params.id,
      details: { status: body.status },
      ipHash: hashIp(getClientIp(request)),
    }).catch(() => {});
  }

  return Response.json({ ok: true });
};
