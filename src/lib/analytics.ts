import { createHash } from 'node:crypto';
import { and, count, desc, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db/connection';
import { adminActivityLog, pageViews, sellInquiries } from '@/db/schema';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

const BOT_UA_PATTERNS = [
  'bot', 'spider', 'crawler', 'slurp', 'googlebot', 'bingbot', 'yandex',
  'baiduspider', 'duckduckbot', 'facebot', 'ia_archiver', 'semrush',
  'ahrefsbot', 'mj12bot', 'prerender', 'lighthouse', 'headlesschrome',
  'pingdom', 'uptimerobot',
];

export function detectDeviceType(ua: string): DeviceType {
  const lower = ua.toLowerCase();
  if (lower.includes('ipad') || (lower.includes('android') && !lower.includes('mobile'))) return 'tablet';
  if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) return 'mobile';
  return 'desktop';
}

export function detectBot(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BOT_UA_PATTERNS.some((p) => lower.includes(p));
}

export function hashIp(ip: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return createHash('sha256').update(`${ip}:${date}`).digest('hex').slice(0, 16);
}

export function normalizeReferrer(referrer: string | null, siteOrigin: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    const origin = `${url.protocol}//${url.host}`;
    if (origin === siteOrigin) return null;
    return origin;
  } catch {
    return null;
  }
}

export async function logPageView(data: {
  path: string;
  vehicleSlug: string | null;
  sessionId: string;
  ipHash: string;
  deviceType: DeviceType;
  referrer: string | null;
  statusCode: number;
  durationMs: number | null;
  isBot: boolean;
}): Promise<void> {
  await db.insert(pageViews).values({
    id: crypto.randomUUID(),
    path: data.path,
    vehicleSlug: data.vehicleSlug,
    sessionId: data.sessionId,
    ipHash: data.ipHash,
    deviceType: data.deviceType,
    referrer: data.referrer,
    statusCode: data.statusCode,
    durationMs: data.durationMs,
    isBot: data.isBot,
    createdAt: new Date().toISOString(),
  });
}

export async function logAdminActivity(data: {
  userId: string;
  username: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipHash: string;
}): Promise<void> {
  await db.insert(adminActivityLog).values({
    id: crypto.randomUUID(),
    userId: data.userId,
    username: data.username,
    action: data.action,
    targetType: data.targetType ?? null,
    targetId: data.targetId ?? null,
    detailsJson: JSON.stringify(data.details ?? {}),
    ipHash: data.ipHash,
    createdAt: new Date().toISOString(),
  });
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function startOfLastMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString();
}

export async function getViewStats() {
  const monthStart = startOfMonthIso();
  const lastMonthStart = startOfLastMonthIso();

  const [thisMonth] = await db
    .select({ views: count(), sessions: sql<number>`count(distinct ${pageViews.sessionId})` })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, monthStart), sql`${pageViews.isBot} = 0`));

  const [last30] = await db
    .select({ views: count(), sessions: sql<number>`count(distinct ${pageViews.sessionId})` })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, daysAgoIso(30)), sql`${pageViews.isBot} = 0`));

  const [lastMonth] = await db
    .select({ views: count(), sessions: sql<number>`count(distinct ${pageViews.sessionId})` })
    .from(pageViews)
    .where(and(
      gte(pageViews.createdAt, lastMonthStart),
      lt(pageViews.createdAt, monthStart),
      sql`${pageViews.isBot} = 0`,
    ));

  return {
    thisMonthViews: thisMonth?.views ?? 0,
    thisMonthSessions: thisMonth?.sessions ?? 0,
    last30Views: last30?.views ?? 0,
    last30Sessions: last30?.sessions ?? 0,
    lastMonthViews: lastMonth?.views ?? 0,
    lastMonthSessions: lastMonth?.sessions ?? 0,
  };
}

export async function getDailyTrend(days = 30): Promise<{ date: string; count: number }[]> {
  const since = daysAgoIso(days);
  const rows = await db
    .select({
      date: sql<string>`strftime('%Y-%m-%d', ${pageViews.createdAt})`,
      count: count(),
    })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, since), sql`${pageViews.isBot} = 0`))
    .groupBy(sql`strftime('%Y-%m-%d', ${pageViews.createdAt})`)
    .orderBy(sql`strftime('%Y-%m-%d', ${pageViews.createdAt})`);

  // Fill in missing dates with zero
  const map = new Map(rows.map((r) => [r.date, r.count]));
  const result: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, count: map.get(dateStr) ?? 0 });
  }
  return result;
}

export async function getTopVehicles(days = 30, limit = 10): Promise<{ vehicleSlug: string; count: number }[]> {
  const since = daysAgoIso(days);
  return db
    .select({ vehicleSlug: pageViews.vehicleSlug, count: count() })
    .from(pageViews)
    .where(and(
      gte(pageViews.createdAt, since),
      sql`${pageViews.vehicleSlug} IS NOT NULL`,
      sql`${pageViews.isBot} = 0`,
    ))
    .groupBy(pageViews.vehicleSlug)
    .orderBy(desc(count()))
    .limit(limit) as Promise<{ vehicleSlug: string; count: number }[]>;
}

export async function getDeviceBreakdown(days = 30): Promise<{ mobile: number; tablet: number; desktop: number }> {
  const since = daysAgoIso(days);
  const rows = await db
    .select({ deviceType: pageViews.deviceType, count: count() })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, since), sql`${pageViews.isBot} = 0`))
    .groupBy(pageViews.deviceType);

  const result = { mobile: 0, tablet: 0, desktop: 0 };
  for (const row of rows) {
    if (row.deviceType === 'mobile') result.mobile = row.count;
    else if (row.deviceType === 'tablet') result.tablet = row.count;
    else result.desktop = row.count;
  }
  return result;
}

export async function getSellInquiryStats() {
  const monthStart = startOfMonthIso();
  const lastMonthStart = startOfLastMonthIso();

  const [thisMonth] = await db
    .select({ count: count() })
    .from(sellInquiries)
    .where(gte(sellInquiries.createdAt, monthStart));

  const [lastMonth] = await db
    .select({ count: count() })
    .from(sellInquiries)
    .where(and(gte(sellInquiries.createdAt, lastMonthStart), lt(sellInquiries.createdAt, monthStart)));

  return {
    thisMonth: thisMonth?.count ?? 0,
    lastMonth: lastMonth?.count ?? 0,
  };
}

export async function getErrorStats(days = 7): Promise<{ errors4xx: number; errors5xx: number; errorsToday: number }> {
  const since = daysAgoIso(days);
  const todayStart = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({ statusCode: pageViews.statusCode, count: count() })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since))
    .groupBy(pageViews.statusCode);

  let errors4xx = 0;
  let errors5xx = 0;
  for (const row of rows) {
    if (row.statusCode >= 400 && row.statusCode < 500) errors4xx += row.count;
    if (row.statusCode >= 500) errors5xx += row.count;
  }

  const [today] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(and(
      gte(pageViews.createdAt, `${todayStart}T00:00:00.000Z`),
      sql`${pageViews.statusCode} >= 400`,
    ));

  return { errors4xx, errors5xx, errorsToday: today?.count ?? 0 };
}

export async function getSlowRequestStats(days = 7, thresholdMs = 2000): Promise<{ count: number }> {
  const since = daysAgoIso(days);
  const [row] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(and(
      gte(pageViews.createdAt, since),
      sql`${pageViews.durationMs} > ${thresholdMs}`,
    ));
  return { count: row?.count ?? 0 };
}

export async function getBotStats(days = 7): Promise<{ count: number }> {
  const since = daysAgoIso(days);
  const [row] = await db
    .select({ count: count() })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, since), sql`${pageViews.isBot} = 1`));
  return { count: row?.count ?? 0 };
}

export async function getTopReferrers(days = 30, limit = 10): Promise<{ referrer: string; count: number }[]> {
  const since = daysAgoIso(days);
  return db
    .select({ referrer: pageViews.referrer, count: count() })
    .from(pageViews)
    .where(and(
      gte(pageViews.createdAt, since),
      sql`${pageViews.referrer} IS NOT NULL`,
      sql`${pageViews.isBot} = 0`,
    ))
    .groupBy(pageViews.referrer)
    .orderBy(desc(count()))
    .limit(limit) as Promise<{ referrer: string; count: number }[]>;
}

export async function getAdminActivityLogEntries(limit = 50) {
  const rows = await db
    .select()
    .from(adminActivityLog)
    .orderBy(desc(adminActivityLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    details: JSON.parse(r.detailsJson) as Record<string, unknown>,
  }));
}

export async function pruneOldAnalytics(): Promise<void> {
  const pageViewCutoff = daysAgoIso(90);
  const activityCutoff = daysAgoIso(180);
  await db.delete(pageViews).where(lt(pageViews.createdAt, pageViewCutoff));
  await db.delete(adminActivityLog).where(lt(adminActivityLog.createdAt, activityCutoff));
}
