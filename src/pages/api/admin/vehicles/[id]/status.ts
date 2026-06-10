import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { updateVehicleStatus } from '@/lib/vehicles';
import { isVehicleStatus } from '@/lib/vehicle-status';
import { hashIp, logAdminActivity } from '@/lib/analytics';

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.VEHICLES_EDIT);
  if (_auth instanceof Response) return _auth;
  const user = _auth;
  const body = await request.json();
  if (!params.id || !isVehicleStatus(body.status)) {
    return Response.json({ error: 'invalid status' }, { status: 400 });
  }
  await updateVehicleStatus(params.id, body.status);

  logAdminActivity({
    userId: user.id,
    username: user.username,
    action: 'vehicle_status_change',
    targetType: 'vehicle',
    targetId: params.id,
    details: { status: body.status },
    ipHash: hashIp(getClientIp(request)),
  }).catch(() => {});

  return Response.json({ ok: true });
};
