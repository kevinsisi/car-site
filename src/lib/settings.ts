import { eq } from 'drizzle-orm';
import { db } from '@/db/connection';
import { siteSettings, type ImportBehavior } from '@/db/schema';
import { defaultDetailSpecFields } from './detail-spec-fields';
import { sanitizeImageUrl, sanitizePublicHref } from './safe-url';
import { resolveStyle, resolveTemplate, type StyleId, type TemplateId } from './theme';

export type GalleryMode = 'lightbox' | 'slider' | 'thumbnail-strip' | 'grid';

export interface HeroVideo {
  id: string;
  url: string;
  type: 'youtube' | 'mp4';
  thumbnailUrl: string;
  label: string;
}

export type VideoSectionPosition = 'below-hero' | 'below-featured' | 'above-footer';

export type SocialPlatform = 'line' | 'instagram' | 'facebook' | 'threads' | 'tiktok' | 'phone' | 'share';

export interface SocialIconConfig {
  url: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  bgColor: string;
}

export type SocialIconsMap = Partial<Record<SocialPlatform, SocialIconConfig>>;

const SOCIAL_PLATFORMS: SocialPlatform[] = ['line', 'instagram', 'facebook', 'threads', 'tiktok', 'phone', 'share'];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

export function parseSocialIcons(raw: string | undefined | null): SocialIconsMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: SocialIconsMap = {};
    for (const platform of SOCIAL_PLATFORMS) {
      const entry = (parsed as Record<string, unknown>)[platform];
      if (!entry || typeof entry !== 'object') continue;
      const cfg = entry as Record<string, unknown>;
      const url = sanitizeImageUrl(cfg.url);
      if (!url) continue;
      const bgColor = typeof cfg.bgColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cfg.bgColor.trim()) ? cfg.bgColor.trim() : '';
      result[platform] = {
        url,
        zoom: clampNumber(cfg.zoom, ZOOM_MIN, ZOOM_MAX, 1),
        offsetX: clampNumber(cfg.offsetX, 0, 100, 50),
        offsetY: clampNumber(cfg.offsetY, 0, 100, 50),
        bgColor,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeSocialIcons(map: SocialIconsMap): string {
  const clean: SocialIconsMap = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const cfg = map[platform];
    if (!cfg?.url) continue;
    const url = sanitizeImageUrl(cfg.url);
    if (!url) continue;
    clean[platform] = {
      url,
      zoom: clampNumber(cfg.zoom, ZOOM_MIN, ZOOM_MAX, 1),
      offsetX: clampNumber(cfg.offsetX, 0, 100, 50),
      offsetY: clampNumber(cfg.offsetY, 0, 100, 50),
      bgColor: cfg.bgColor || '',
    };
  }
  return JSON.stringify(clean);
}

export interface SiteSettings {
  siteName: string;
  siteIconUrl: string;
  salespersonName: string;
  lineUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  threadsUrl: string;
  tiktokUrl: string;
  phoneNumber: string;
  storeAddress: string;
  businessHours: string;
  homepageEyebrow: string;
  homepageTitle: string;
  homepageLead: string;
  homepageNote: string;
  homepageBadge: string;
  featuredEyebrow: string;
  featuredTitle: string;
  featuredCount: number;
  listingEyebrow: string;
  listingTitle: string;
  listingLead: string;
  cardTitleTemplate: string;
  detailNotesEyebrow: string;
  detailNotesTitle: string;
  shareMessageTemplate: string;
  detailSpecFields: string[];
  footerDisclaimer: string;
  heroVehicleSlug: string;
  activeTemplate: TemplateId;
  activeStyle: StyleId;
  importBehavior: ImportBehavior;
  showSoldVehicles: boolean;
  socialIcons: SocialIconsMap;
  galleryMode: GalleryMode;
  heroVideos: HeroVideo[];
  videoSectionEnabled: boolean;
  videoSectionPosition: VideoSectionPosition;
  videoLinksEnabled: boolean;
  videoLinksSectionTitle: string;
  notificationEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
}

const defaults: SiteSettings = {
  siteName: '私人精品車展',
  siteIconUrl: '',
  salespersonName: '私人車庫顧問',
  lineUrl: '#',
  instagramUrl: 'https://www.instagram.com/',
  facebookUrl: 'https://www.facebook.com/',
  threadsUrl: 'https://www.threads.net/',
  tiktokUrl: 'https://www.tiktok.com/',
  phoneNumber: '+886900000000',
  storeAddress: '台北市信義區範例路 00 號 0 樓',
  businessHours: '週一至週六 10:00-19:00，採預約賞車',
  homepageEyebrow: '私人高級車顧問',
  homepageTitle: '為成熟買家嚴選真正值得收藏的高級座駕',
  homepageLead: '不以價格吸引目光，而以車況、來源、配備與顧問判斷建立信任。每一台車都適合先聊過，再安排細看。',
  homepageNote: '這不是一般中古車網站。這是專為需要節省時間、重視風險控制與品味的買家整理的私人車庫。',
  homepageBadge: 'NT$20M+ 嚴選典藏',
  featuredEyebrow: '近期庫存',
  featuredTitle: '近期嚴選車輛',
  featuredCount: 3,
  listingEyebrow: '嚴選車庫',
  listingTitle: '只放上值得親自介紹的車',
  listingLead: '所有價格採專人洽詢。若您正在尋找特定品牌、年份或配置，建議直接 LINE 聯絡。',
  cardTitleTemplate: '{年份} {品牌} {型號} {規格}\n{補充}',
  detailNotesEyebrow: '顧問筆記',
  detailNotesTitle: '顧問觀點',
  shareMessageTemplate: '憶文豪車，推薦給您\n{車名}\n年份：{年份}\n品牌：{品牌}\n里程：{里程}\n實拍現車，專人介紹車況與配備\n{網址}',
  detailSpecFields: defaultDetailSpecFields,
  footerDisclaimer: '所有價格皆採專人洽詢；實際車況與配備以現場為準，歡迎預約賞車。',
  heroVehicleSlug: '',
  activeTemplate: 'private-salon',
  activeStyle: 'carsmeet-blue',
  importBehavior: 'draft_first',
  showSoldVehicles: false,
  socialIcons: {},
  galleryMode: 'lightbox',
  heroVideos: [],
  videoSectionEnabled: false,
  videoSectionPosition: 'below-hero',
  videoLinksEnabled: false,
  videoLinksSectionTitle: '精選影片',
  notificationEmail: '',
  smtpHost: '',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
};

function resolveDetailSpecFields(value: string | undefined): string[] {
  if (!value) return defaults.detailSpecFields;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return defaults.detailSpecFields;
    const allowed = new Set<string>(defaultDetailSpecFields);
    const fields = parsed.filter((field): field is string => typeof field === 'string' && allowed.has(field));
    return fields.length ? fields : defaults.detailSpecFields;
  } catch {
    return defaults.detailSpecFields;
  }
}

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.select().from(siteSettings);
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const importBehavior = map.get('importBehavior');
  const settingValue = (key: keyof SiteSettings, fallback: string) => (map.has(key) ? map.get(key) || '' : fallback);
  return {
    siteName: map.get('siteName') || defaults.siteName,
    siteIconUrl: sanitizeImageUrl(settingValue('siteIconUrl', defaults.siteIconUrl)),
    salespersonName: map.get('salespersonName') || defaults.salespersonName,
    lineUrl: sanitizePublicHref(map.get('lineUrl') || defaults.lineUrl) || defaults.lineUrl,
    instagramUrl: sanitizePublicHref(settingValue('instagramUrl', defaults.instagramUrl)),
    facebookUrl: sanitizePublicHref(settingValue('facebookUrl', defaults.facebookUrl)),
    threadsUrl: sanitizePublicHref(settingValue('threadsUrl', defaults.threadsUrl)),
    tiktokUrl: sanitizePublicHref(settingValue('tiktokUrl', defaults.tiktokUrl)),
    phoneNumber: map.get('phoneNumber') || defaults.phoneNumber,
    storeAddress: settingValue('storeAddress', defaults.storeAddress),
    businessHours: settingValue('businessHours', defaults.businessHours),
    homepageEyebrow: map.get('homepageEyebrow') || defaults.homepageEyebrow,
    homepageTitle: map.get('homepageTitle') || defaults.homepageTitle,
    homepageLead: map.get('homepageLead') || defaults.homepageLead,
    homepageNote: map.get('homepageNote') || defaults.homepageNote,
    homepageBadge: map.get('homepageBadge') || defaults.homepageBadge,
    featuredEyebrow: map.get('featuredEyebrow') || defaults.featuredEyebrow,
    featuredTitle: map.get('featuredTitle') || defaults.featuredTitle,
    featuredCount: (() => {
      const raw = Number.parseInt(map.get('featuredCount') ?? '', 10);
      return Number.isFinite(raw) && raw >= 1 && raw <= 12 ? raw : defaults.featuredCount;
    })(),
    listingEyebrow: map.get('listingEyebrow') || defaults.listingEyebrow,
    listingTitle: map.get('listingTitle') || defaults.listingTitle,
    listingLead: map.get('listingLead') || defaults.listingLead,
    cardTitleTemplate: map.get('cardTitleTemplate') || defaults.cardTitleTemplate,
    detailNotesEyebrow: map.get('detailNotesEyebrow') || defaults.detailNotesEyebrow,
    detailNotesTitle: map.get('detailNotesTitle') || defaults.detailNotesTitle,
    shareMessageTemplate: map.get('shareMessageTemplate') || defaults.shareMessageTemplate,
    detailSpecFields: resolveDetailSpecFields(map.get('detailSpecFields')),
    footerDisclaimer: map.get('footerDisclaimer') || defaults.footerDisclaimer,
    heroVehicleSlug: settingValue('heroVehicleSlug', defaults.heroVehicleSlug),
    activeTemplate: resolveTemplate(map.get('activeTemplate')),
    activeStyle: resolveStyle(map.get('activeStyle')),
    importBehavior:
      importBehavior === 'auto_publish' || importBehavior === 'import_only' || importBehavior === 'draft_first'
        ? importBehavior
        : defaults.importBehavior,
    showSoldVehicles: map.get('showSoldVehicles') === 'true',
    socialIcons: parseSocialIcons(map.get('socialIcons')),
    galleryMode: (() => {
      const v = map.get('galleryMode');
      if (v === 'slider' || v === 'thumbnail-strip' || v === 'grid') return v;
      return 'lightbox';
    })(),
    heroVideos: (() => {
      try {
        const parsed = JSON.parse(map.get('heroVideos') || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    videoSectionEnabled: map.get('videoSectionEnabled') === 'true',
    videoSectionPosition: (() => {
      const v = map.get('videoSectionPosition');
      if (v === 'below-featured' || v === 'above-footer') return v as VideoSectionPosition;
      return 'below-hero' as VideoSectionPosition;
    })(),
    videoLinksEnabled: map.get('videoLinksEnabled') === 'true',
    videoLinksSectionTitle: map.get('videoLinksSectionTitle') || defaults.videoLinksSectionTitle,
    notificationEmail: map.get('notificationEmail') || '',
    smtpHost: map.get('smtpHost') || '',
    smtpPort: map.get('smtpPort') || '587',
    smtpUser: map.get('smtpUser') || '',
    smtpPass: map.get('smtpPass') || '',
  };
}

export async function setSettings(input: Partial<Record<keyof SiteSettings, string | number | boolean | string[] | SocialIconsMap>>) {
  const now = new Date().toISOString();
  for (const [key, rawValue] of Object.entries(input)) {
    if (rawValue === undefined) continue;
    let value: string;
    if (Array.isArray(rawValue)) value = JSON.stringify(rawValue);
    else if (rawValue && typeof rawValue === 'object') value = JSON.stringify(rawValue);
    else value = String(rawValue);
    await db
      .insert(siteSettings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: now } });
  }
}

export async function getSettingValue(key: string): Promise<string | null> {
  const row = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return row[0]?.value ?? null;
}
