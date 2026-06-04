import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { updateVehicleStatus } from '@/lib/vehicles';
import { isVehicleStatus } from '@/lib/vehicle-status';

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.VEHICLES_EDIT);
  if (_auth instanceof Response) return _auth;
  const user = _auth;
  const body = await request.json();
  if (!params.id || !isVehicleStatus(body.status)) {
    return Response.json({ error: 'invalid status' }, { status: 400 });
  }
  await updateVehicleStatus(params.id, body.status);
  return Response.json({ ok: true });
};
