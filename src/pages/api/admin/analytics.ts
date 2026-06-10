import type { APIRoute } from 'astro';
import { getPermittedOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import {
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
} from '@/lib/analytics';

export const GET: APIRoute = async ({ cookies }) => {
  const auth = await getPermittedOrResponse(cookies, PERMISSIONS.ANALYTICS);
  if (auth instanceof Response) return auth;
  const isSuperAdmin = auth.role === 'superadmin';

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
