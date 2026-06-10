export const PERMISSIONS = {
  VEHICLES_VIEW:     0x0001,
  VEHICLES_EDIT:     0x0002,
  BRANDS_VIEW:       0x0004,
  BRANDS_ICON:       0x0008,
  VIDEOS_CAROUSEL:   0x0010,
  VIDEOS_LINKS:      0x0020,
  SELL_INQUIRIES:    0x0040,
  SETTINGS_BASIC:    0x0080,
  SETTINGS_LAYOUT:   0x0100,
  SETTINGS_GALLERY:  0x0200,
  USERS_MANAGE:      0x0800,
  IMPORT_API:        0x1000,
  ANALYTICS:         0x2000,
  ALL:               0x3FFF,
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function hasPermission(userPermissions: number, required: number): boolean {
  return (userPermissions & required) === required;
}

export function isSuperAdmin(role: string): boolean {
  return role === 'superadmin';
}

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  VEHICLES_VIEW:    '車輛管理 — 檢視',
  VEHICLES_EDIT:    '車輛管理 — 編輯/新增/刪除',
  BRANDS_VIEW:      '品牌管理 — 檢視',
  BRANDS_ICON:      '品牌管理 — 上傳圖示',
  VIDEOS_CAROUSEL:  '影片輪播設定',
  VIDEOS_LINKS:     '影片連結管理',
  SELL_INQUIRIES:   '賣車申請 — 查看',
  SETTINGS_BASIC:   '設定 — 基本資訊',
  SETTINGS_LAYOUT:  '設定 — 版型樣式',
  SETTINGS_GALLERY: '設定 — 照片展示模式',
  USERS_MANAGE:     '用戶管理',
  IMPORT_API:       '外部 API 匯入',
  ANALYTICS:        '流量分析儀表板',
  ALL:              '全部權限',
};
