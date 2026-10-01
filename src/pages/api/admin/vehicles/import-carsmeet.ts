import type { APIRoute } from 'astro';
import { CarsmeetImportError, importableCarsmeetData, parseCarsmeetUrl } from '@/lib/carsmeet-import';
import { createD1Db } from '@/db/d1';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { importVehicle } from '@/lib/vehicles';

const MAX_PRODUCTION_WORKER_CARSMEET_PHOTOS = 32;

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

  try {
    const body = await request.json();
    const url = String(body.url || '');
    if (locals.runtime) {
      parseCarsmeetUrl(url);
      const productionEnabled = runtimeEnv?.MITA_ENV === 'production' && runtimeEnv.MITA_PUBLIC_SYNC_ENABLED === 'true';
      if (!productionEnabled) {
        return Response.json({
          ok: false,
          previewOnly: true,
          error: 'Carsmeet import is disabled in preview; no vehicle was imported.',
        }, { status: 501 });
      }
    }

    const data = await importableCarsmeetData(url, locals.runtime ? { workerSafe: true } : undefined);
    if (locals.runtime && data.photos.length > MAX_PRODUCTION_WORKER_CARSMEET_PHOTOS) {
      throw new CarsmeetImportError(`Carsmeet 車輛照片最多可匯入 ${MAX_PRODUCTION_WORKER_CARSMEET_PHOTOS} 張，請調整來源頁面後再試`, 422);
    }
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
    }, adapter);

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
