import type { APIRoute } from 'astro';
import { appConfig } from '@/lib/config';
import { importVehicle } from '@/lib/vehicles';
import { isVehicleStatus } from '@/lib/vehicle-status';

function bearerToken(request: Request): string {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
}

export const POST: APIRoute = async ({ request }) => {
  if (!appConfig.importApiToken || bearerToken(request) !== appConfig.importApiToken) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  if (!body?.source || !body?.externalId || !body?.brand || !body?.model) {
    return Response.json({ error: 'source, externalId, brand, and model are required' }, { status: 400 });
  }
  const result = await importVehicle({
    source: String(body.source),
    externalId: String(body.externalId),
    slug: body.slug ? String(body.slug) : undefined,
    title: body.title ? String(body.title) : undefined,
    brand: String(body.brand),
    model: String(body.model),
    subModel: body.subModel ? String(body.subModel) : undefined,
    year: body.year ? String(body.year) : undefined,
    mileage: body.mileage ? String(body.mileage) : undefined,
    exteriorColor: body.exteriorColor ? String(body.exteriorColor) : undefined,
    interiorColor: body.interiorColor ? String(body.interiorColor) : undefined,
    condition: body.condition ? String(body.condition) : undefined,
    headline: body.headline ? String(body.headline) : undefined,
    description: body.description ? String(body.description) : undefined,
    features: Array.isArray(body.features) ? body.features.map(String) : [],
    monthlyRecommended: body.monthlyRecommended === true ? true : undefined,
    photos: Array.isArray(body.photos) ? body.photos.map(String) : [],
    status: isVehicleStatus(body.status) ? body.status : undefined,
    sourceStatus: body.sourceStatus ? String(body.sourceStatus) : undefined,
    publishMode: ['use_default', 'draft', 'publish'].includes(body.publishMode) ? body.publishMode : 'use_default',
  });
  return Response.json({ ok: true, ...result });
};
