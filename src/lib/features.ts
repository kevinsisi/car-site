export const FEATURE_COMPARE        = 1 << 0; // 1
export const FEATURE_SELL_INQUIRY   = 1 << 1; // 2
export const FEATURE_CONTACT_PAGE   = 1 << 2; // 4
export const FEATURE_ABOUT_PAGE     = 1 << 3; // 8
export const FEATURE_SOCIAL_ICONS   = 1 << 4; // 16
export const FEATURE_DIRECT_CONTACT = 1 << 5; // 32
export const FEATURE_HERO_VIDEOS    = 1 << 6; // 64
export const FEATURE_VIDEO_LINKS    = 1 << 7; // 128

export const FEATURE_OPTIONS = [
  { bit: FEATURE_COMPARE,        key: 'compare',       label: '比車功能', description: '車卡比較按鈕、浮動比車列、比較頁新增車輛' },
  { bit: FEATURE_SELL_INQUIRY,   key: 'sellInquiry',   label: '賣車詢問', description: '前台賣車詢問入口、線上表單與後台賣車通知' },
  { bit: FEATURE_CONTACT_PAGE,   key: 'contactPage',   label: '聯絡頁', description: '前台聯絡頁入口與門市資訊頁' },
  { bit: FEATURE_ABOUT_PAGE,     key: 'aboutPage',     label: '關於頁', description: '前台關於頁入口與品牌介紹頁' },
  { bit: FEATURE_SOCIAL_ICONS,   key: 'socialIcons',   label: '社群 icon', description: 'Instagram、Facebook、Threads、TikTok 等社群入口與自訂圖示' },
  { bit: FEATURE_DIRECT_CONTACT, key: 'directContact', label: '直接聯絡', description: 'LINE、電話與行動快速聯絡列' },
  { bit: FEATURE_HERO_VIDEOS,    key: 'heroVideos',    label: 'Hero 影片', description: '首頁 Hero 影片區與 banner 影片輪播' },
  { bit: FEATURE_VIDEO_LINKS,    key: 'videoLinks',    label: '影片連結', description: '前台精選影片連結區與後台影片連結管理' },
] as const;

export type FeatureKey = typeof FEATURE_OPTIONS[number]['key'];

/** Bits 0-5 on (first 6 features), bits 6-7 off (videos default disabled) */
export const DEFAULT_FEATURE_MASK   = 0b00111111; // 63

/** All 8 bits on — full license */
export const ALL_FEATURES_MASK      = 0b11111111; // 255

export function hasFeature(mask: number, bit: number): boolean {
  return (mask & bit) !== 0;
}

export function effectiveFeatureMask(featureMask: number, featureLicenseMask: number): number {
  return featureMask & featureLicenseMask & ALL_FEATURES_MASK;
}
