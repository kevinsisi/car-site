import type { VehicleStatus } from '@/db/schema';

export const vehicleStatuses: VehicleStatus[] = ['draft', 'published', 'incoming', 'reserved', 'special', 'unknown', 'unpublished', 'sold', 'archived'];
export const alwaysPublicVehicleStatuses: VehicleStatus[] = ['published', 'incoming', 'reserved', 'special', 'unknown'];

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  draft: '草稿',
  published: '在庫',
  incoming: '未到港',
  reserved: '收訂',
  special: '特殊',
  unknown: '狀態未確認',
  unpublished: '已下架',
  sold: '已售出',
  archived: '已封存',
};

export function isVehicleStatus(value: unknown): value is VehicleStatus {
  return typeof value === 'string' && vehicleStatuses.includes(value as VehicleStatus);
}

export function isPublicVehicleStatus(value: VehicleStatus, showSoldVehicles = false): boolean {
  return alwaysPublicVehicleStatuses.includes(value) || (showSoldVehicles && value === 'sold');
}

export function mapSourceInventoryStatus(value: unknown): VehicleStatus {
  const status = String(value || '').trim();
  if (status === '在庫') return 'published';
  if (status === '未到港') return 'incoming';
  if (status === '收訂') return 'reserved';
  if (status === '特殊') return 'special';
  if (status === '售出') return 'sold';
  if (!status || status.startsWith('#N/A')) return 'unknown';
  return 'unknown';
}
