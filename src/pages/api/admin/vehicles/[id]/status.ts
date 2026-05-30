import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { updateVehicleStatus } from '@/lib/vehicles';
import type { VehicleStatus } from '@/db/schema';

const statuses: VehicleStatus[] = ['draft', 'published', 'unpublished', 'sold', 'archived'];

export const POST: APIRoute = async ({ params, request, cookies }) => {
  await requireAdmin(cookies);
  const body = await request.json();
  if (!params.id || !statuses.includes(body.status)) {
    return Response.json({ error: 'invalid status' }, { status: 400 });
  }
  await updateVehicleStatus(params.id, body.status);
  return Response.json({ ok: true });
};
