import type { VehicleView } from './vehicles';

const fallback = '請洽詢';

export function vehicleShareUrl(vehicle: VehicleView, origin = '') {
  return `${origin}/cars/${vehicle.slug}`;
}

export function shareOriginFromRequest(request: Request, fallback: URL) {
  const forwardedProto = request.headers.get('x-forwarded-proto') || fallback.protocol.replace(':', '');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || fallback.host;
  return `${forwardedProto}://${forwardedHost}`;
}

export function formatVehicleShareText(vehicle: VehicleView, template: string, url: string) {
  const values: Record<string, string> = {
    車名: vehicle.title,
    年份: vehicle.year || fallback,
    品牌: vehicle.brandDisplayName || vehicle.brand || fallback,
    里程: vehicle.mileage || fallback,
    外觀色: vehicle.exteriorColor || fallback,
    內裝色: vehicle.interiorColor || fallback,
    車況: vehicle.condition || fallback,
    價格: '價格請洽',
    網址: url,
    title: vehicle.title,
    year: vehicle.year || fallback,
    brand: vehicle.brandDisplayName || vehicle.brand || fallback,
    mileage: vehicle.mileage || fallback,
    exteriorColor: vehicle.exteriorColor || fallback,
    interiorColor: vehicle.interiorColor || fallback,
    condition: vehicle.condition || fallback,
    price: '價格請洽',
    url,
  };
  return template.replace(/\{([^{}]+)\}/g, (_, key: string) => values[key] ?? '');
}
