import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/connection';
import { siteSettings } from '@/db/schema';
import {
  FEATURE_COMPARE, FEATURE_SELL_INQUIRY, FEATURE_CONTACT_PAGE,
  FEATURE_ABOUT_PAGE, FEATURE_SOCIAL_ICONS, FEATURE_DIRECT_CONTACT,
  FEATURE_HERO_VIDEOS, FEATURE_VIDEO_LINKS,
  DEFAULT_FEATURE_MASK, ALL_FEATURES_MASK,
} from './features';

const OLD_KEYS = [
  'featureCompareEnabled',
  'featureSellInquiryEnabled',
  'featureContactPageEnabled',
  'featureAboutPageEnabled',
  'featureSocialIconsEnabled',
  'featureDirectContactEnabled',
  'videoSectionEnabled',
  'videoLinksEnabled',
] as const;

const KEY_TO_BIT: Record<string, number> = {
  featureCompareEnabled:       FEATURE_COMPARE,
  featureSellInquiryEnabled:   FEATURE_SELL_INQUIRY,
  featureContactPageEnabled:   FEATURE_CONTACT_PAGE,
  featureAboutPageEnabled:     FEATURE_ABOUT_PAGE,
  featureSocialIconsEnabled:   FEATURE_SOCIAL_ICONS,
  featureDirectContactEnabled: FEATURE_DIRECT_CONTACT,
  videoSectionEnabled:         FEATURE_HERO_VIDEOS,
  videoLinksEnabled:           FEATURE_VIDEO_LINKS,
};

export async function migrateFeatures(): Promise<void> {
  // Idempotent: skip if already migrated
  const existing = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, 'featureMask'))
    .limit(1);
  if (existing.length > 0) return;

  // Read old boolean keys
  const rows = await db
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, [...OLD_KEYS]));
  const map = new Map(rows.map((r) => [r.key, r.value]));

  // Compute featureMask from old values
  let mask = DEFAULT_FEATURE_MASK;
  for (const [key, bit] of Object.entries(KEY_TO_BIT)) {
    if (!map.has(key)) continue;
    if (map.get(key) === 'true') {
      mask = mask | bit;
    } else if (map.get(key) === 'false') {
      mask = mask & ~bit;
    }
  }

  const now = new Date().toISOString();
  await db
    .insert(siteSettings)
    .values({ key: 'featureMask', value: String(mask), updatedAt: now });
  await db
    .insert(siteSettings)
    .values({ key: 'featureLicenseMask', value: String(ALL_FEATURES_MASK), updatedAt: now });

  // Remove old boolean keys
  await db
    .delete(siteSettings)
    .where(inArray(siteSettings.key, [...OLD_KEYS]));
}
