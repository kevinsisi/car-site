import type { APIRoute } from 'astro';
import { CarsmeetImportError, importableCarsmeetData } from '@/lib/carsmeet-import';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { importVehicle } from '@/lib/vehicles';

export const POST: APIRoute = async ({ request, cookies }) => {
  const _auth = await getPermittedOrResponse(cookies, PERMISSIONS.VEHICLES_EDIT);
  if (_auth instanceof Response) return _auth;

  try {
    const body = await request.json();
    const url = String(body.url || '');
    const data = await importableCarsmeetData(url);
    const result = await importVehicle({
      source: 'carsmeet',
      externalId: data.externalId,
      slug: data.externalId,
      title: data.title,
      brand: data.brand,
      model: data.model,
      subModel: data.subModel,
      year: data.year,
      mileage: data.mileage,
      exteriorColor: data.exteriorColor,
      interiorColor: data.interiorColor,
      condition: data.condition,
      headline: data.headline,
      description: data.description,
      features: data.features,
      photos: data.photos,
      publishMode: 'draft',
    });

    return Response.json({
      ok: true,
      vehicleId: result.vehicleId,
      status: result.status,
      source: 'carsmeet',
      externalId: data.externalId,
      title: data.title,
      imageCount: data.photos.length,
    });
  } catch (error) {
    if (error instanceof CarsmeetImportError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('Carsmeet import failed', error);
    return Response.json({ error: '匯入失敗，請稍後再試' }, { status: 500 });
  }
};
