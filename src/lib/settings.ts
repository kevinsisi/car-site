import { eq } from 'drizzle-orm';
import { db } from '@/db/connection';
import { siteSettings, type ImportBehavior } from '@/db/schema';
import { resolveStyle, resolveTemplate, type StyleId, type TemplateId } from './theme';

export interface SiteSettings {
  siteName: string;
  salespersonName: string;
  lineUrl: string;
  phoneNumber: string;
  homepageEyebrow: string;
  homepageTitle: string;
  homepageLead: string;
  homepageNote: string;
  homepageBadge: string;
  featuredEyebrow: string;
  featuredTitle: string;
  listingEyebrow: string;
  listingTitle: string;
  listingLead: string;
  detailNotesEyebrow: string;
  detailNotesTitle: string;
  shareMessageTemplate: string;
  footerDisclaimer: string;
  activeTemplate: TemplateId;
  activeStyle: StyleId;
  importBehavior: ImportBehavior;
  showSoldVehicles: boolean;
}

const defaults: SiteSettings = {
  siteName: 'Private Motor Salon',
  salespersonName: '私人車庫顧問',
  lineUrl: '#',
  phoneNumber: '+886900000000',
  homepageEyebrow: 'Private Premium Car Advisory',
  homepageTitle: '為成熟買家嚴選真正值得收藏的高級座駕',
  homepageLead: '不以價格吸引目光，而以車況、來源、配備與顧問判斷建立信任。每一台車都適合先聊過，再安排細看。',
  homepageNote: '這不是一般中古車網站。這是專為需要節省時間、重視風險控制與品味的買家整理的私人車庫。',
  homepageBadge: 'NT$20M+ Curated Selection',
  featuredEyebrow: 'Available Selection',
  featuredTitle: '近期嚴選車輛',
  listingEyebrow: 'Curated Inventory',
  listingTitle: '只放上值得親自介紹的車',
  listingLead: '所有價格採專人洽詢。若您正在尋找特定品牌、年份或配置，建議直接 LINE 聯絡。',
  detailNotesEyebrow: 'Advisor Notes',
  detailNotesTitle: '顧問觀點',
  shareMessageTemplate: '{車名}\n年份：{年份}\n品牌：{品牌}\n里程：{里程}\n價格請洽\n{網址}',
  footerDisclaimer: '所有車輛價格皆採專人洽詢，實際車況與配備以現場確認為準。',
  activeTemplate: 'private-salon',
  activeStyle: 'carsmeet-blue',
  importBehavior: 'draft_first',
  showSoldVehicles: false,
};

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.select().from(siteSettings);
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const importBehavior = map.get('importBehavior');
  return {
    siteName: map.get('siteName') || defaults.siteName,
    salespersonName: map.get('salespersonName') || defaults.salespersonName,
    lineUrl: map.get('lineUrl') || defaults.lineUrl,
    phoneNumber: map.get('phoneNumber') || defaults.phoneNumber,
    homepageEyebrow: map.get('homepageEyebrow') || defaults.homepageEyebrow,
    homepageTitle: map.get('homepageTitle') || defaults.homepageTitle,
    homepageLead: map.get('homepageLead') || defaults.homepageLead,
    homepageNote: map.get('homepageNote') || defaults.homepageNote,
    homepageBadge: map.get('homepageBadge') || defaults.homepageBadge,
    featuredEyebrow: map.get('featuredEyebrow') || defaults.featuredEyebrow,
    featuredTitle: map.get('featuredTitle') || defaults.featuredTitle,
    listingEyebrow: map.get('listingEyebrow') || defaults.listingEyebrow,
    listingTitle: map.get('listingTitle') || defaults.listingTitle,
    listingLead: map.get('listingLead') || defaults.listingLead,
    detailNotesEyebrow: map.get('detailNotesEyebrow') || defaults.detailNotesEyebrow,
    detailNotesTitle: map.get('detailNotesTitle') || defaults.detailNotesTitle,
    shareMessageTemplate: map.get('shareMessageTemplate') || defaults.shareMessageTemplate,
    footerDisclaimer: map.get('footerDisclaimer') || defaults.footerDisclaimer,
    activeTemplate: resolveTemplate(map.get('activeTemplate')),
    activeStyle: resolveStyle(map.get('activeStyle')),
    importBehavior:
      importBehavior === 'auto_publish' || importBehavior === 'import_only' || importBehavior === 'draft_first'
        ? importBehavior
        : defaults.importBehavior,
    showSoldVehicles: map.get('showSoldVehicles') === 'true',
  };
}

export async function setSettings(input: Partial<Record<keyof SiteSettings, string | boolean>>) {
  const now = new Date().toISOString();
  for (const [key, rawValue] of Object.entries(input)) {
    if (rawValue === undefined) continue;
    const value = String(rawValue);
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
