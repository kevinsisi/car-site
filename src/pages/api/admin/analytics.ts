import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createD1Db } from '@/db/d1';

export const GET: APIRoute = async ({ cookies, locals }) => {
  const runtime = locals.runtime;
  const workerPreview = Boolean(runtime);
  const env = runtime?.env as { DB_PREVIEW?: Parameters<typeof createD1Db>[0]; SESSION_SECRET?: string } | undefined;
  if (workerPreview && (!env?.DB_PREVIEW || !env.SESSION_SECRET)) {
    return Response.json({ error: 'preview_unavailable', message: 'Required preview bindings are missing.' }, { status: 503 });
  }

  const options = workerPreview
    ? { db: await createD1Db(env!.DB_PREVIEW!), sessionSecret: env!.SESSION_SECRET! }
    : {};
  const auth = await getPermittedOrResponse(cookies, PERMISSIONS.ANALYTICS, options);
  if (auth instanceof Response) return auth;
  if (workerPreview) {
    return Response.json({ error: 'preview_unavailable', message: 'Analytics are unavailable in Worker preview.' }, { status: 501 });
  }

  const isSuperAdmin = auth.role === 'superadmin';
  const {
    getAdminActivityLogEntries,
    getBotStats,
    getDailyTrend,
    getDeviceBreakdown,
    getErrorStats,
    getSlowRequestStats,
    getSellInquiryStats,
    getTopReferrers,
    getTopVehicles,
    getViewStats,
  } = await import('@/lib/analytics');

  const [viewStats, dailyTrend, topVehicles, deviceBreakdown, sellStats] = await Promise.all([
    getViewStats(),
    getDailyTrend(30),
    getTopVehicles(30, 10),
    getDeviceBreakdown(30),
    getSellInquiryStats(),
  ]);

  const superAdminData = isSuperAdmin
    ? await Promise.all([
        getErrorStats(7),
        getSlowRequestStats(7, 2000),
        getBotStats(7),
        getTopReferrers(30, 10),
        getAdminActivityLogEntries(50),
      ]).then(([errorStats, slowStats, botStats, topReferrers, activityLog]) => ({
        errorStats,
        slowStats,
        botStats,
        topReferrers,
        activityLog,
      }))
    : null;

  return Response.json({
    viewStats,
    dailyTrend,
    topVehicles,
    deviceBreakdown,
    sellStats,
    superAdmin: superAdminData,
  });
};
