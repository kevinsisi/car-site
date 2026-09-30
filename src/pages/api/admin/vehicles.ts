import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { upsertVehicle } from '@/lib/vehicles';
import { isVehicleStatus } from '@/lib/vehicle-status';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
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
  const body = await request.json();
  if (!body.title || !body.brand || !body.model) {
    return Response.json({ error: 'title, brand, and model are required' }, { status: 400 });
  }
  const status = isVehicleStatus(body.status) ? body.status : 'draft';
  const vehicleId = await upsertVehicle({
    id: body.id ? String(body.id) : undefined,
    slug: body.slug ? String(body.slug) : undefined,
    title: String(body.title),
    cardTitleSupplement: body.cardTitleSupplement ? String(body.cardTitleSupplement) : '',
    brand: String(body.brand),
    model: String(body.model),
    subModel: body.subModel ? String(body.subModel) : undefined,
    year: body.year ? String(body.year) : undefined,
    mileage: body.mileage ? String(body.mileage) : undefined,
    exteriorColor: body.exteriorColor ? String(body.exteriorColor) : undefined,
    interiorColor: body.interiorColor ? String(body.interiorColor) : undefined,
    condition: body.condition ? String(body.condition) : undefined,
    status,
    headline: body.headline ? String(body.headline) : undefined,
    description: body.description ? String(body.description) : undefined,
    features: Array.isArray(body.features) ? body.features.map(String) : [],
    monthlyRecommended: body.monthlyRecommended === true,
    showSoldCase: body.showSoldCase === true,
    images: Array.isArray(body.images) ? body.images.map(String) : [],
  }, adapter);
  return Response.json({ ok: true, vehicleId });
};
