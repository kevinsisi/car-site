export const FEATURE_COMPARE        = 1 << 0; // 1
export const FEATURE_SELL_INQUIRY   = 1 << 1; // 2
export const FEATURE_CONTACT_PAGE   = 1 << 2; // 4
export const FEATURE_ABOUT_PAGE     = 1 << 3; // 8
export const FEATURE_SOCIAL_ICONS   = 1 << 4; // 16
export const FEATURE_DIRECT_CONTACT = 1 << 5; // 32
export const FEATURE_HERO_VIDEOS    = 1 << 6; // 64
export const FEATURE_VIDEO_LINKS    = 1 << 7; // 128

/** Bits 0-5 on (first 6 features), bits 6-7 off (videos default disabled) */
export const DEFAULT_FEATURE_MASK   = 0b00111111; // 63

/** All 8 bits on — full license */
export const ALL_FEATURES_MASK      = 0b11111111; // 255

export function hasFeature(mask: number, bit: number): boolean {
  return (mask & bit) !== 0;
}
