import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { importVehicle } from '@/lib/vehicles';
import { isVehicleStatus } from '@/lib/vehicle-status';

function bearerToken(request: Request): string {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
}

export const POST: APIRoute = async ({ request, locals }) => {
  const workerRequest = Boolean(locals.runtime);
  const runtimeEnv = locals.runtime?.env;
  if (workerRequest && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.IMPORT_PREVIEW_TOKEN)) {
    return Response.json({ error: 'preview import unavailable' }, { status: 503 });
  }
  const expectedToken = workerRequest
    ? runtimeEnv!.IMPORT_PREVIEW_TOKEN
    : (await import('@/lib/config')).appConfig.importApiToken;
  if (!expectedToken || bearerToken(request) !== expectedToken) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  if (!body?.source || !body?.externalId || !body?.brand || !body?.model) {
    return Response.json({ error: 'source, externalId, brand, and model are required' }, { status: 400 });
  }
  const source = String(body.source);
  const externalId = String(body.externalId);
  const photos: string[] = Array.isArray(body.photos) ? body.photos.map(String) : [];
  if (workerRequest) {
    if (source !== 'preview' || !externalId.startsWith('DEMO-')) {
      return Response.json({ error: 'Worker imports must use preview source and DEMO- externalId' }, { status: 400 });
    }
    const requestOrigin = new URL(request.url).origin;
    if (photos.some((photo) => {
      try {
        return new URL(photo, request.url).origin !== requestOrigin;
      } catch {
        return true;
      }
    })) {
      return Response.json({ error: 'Worker imports cannot use external photo URLs' }, { status: 400 });
    }
  }
  const result = await importVehicle({
    source,
    externalId,
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
    photos,
    status: isVehicleStatus(body.status) ? body.status : undefined,
    sourceStatus: body.sourceStatus ? String(body.sourceStatus) : undefined,
    publishMode: ['use_default', 'draft', 'publish'].includes(body.publishMode) ? body.publishMode : 'use_default',
  }, workerRequest ? await createD1Db(runtimeEnv!.DB_PREVIEW!) : undefined);
  return Response.json({ ok: true, ...result });
};
