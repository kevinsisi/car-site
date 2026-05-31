import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { upsertVehicle } from '@/lib/vehicles';
import type { VehicleStatus } from '@/db/schema';

const statuses: VehicleStatus[] = ['draft', 'published', 'unpublished', 'sold', 'archived'];

export const POST: APIRoute = async ({ request, cookies }) => {
  await requireAdmin(cookies);
  const body = await request.json();
  if (!body.title || !body.brand || !body.model) {
    return Response.json({ error: 'title, brand, and model are required' }, { status: 400 });
  }
  const status = statuses.includes(body.status) ? body.status : 'draft';
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
    images: Array.isArray(body.images) ? body.images.map(String) : [],
  });
  return Response.json({ ok: true, vehicleId });
};
