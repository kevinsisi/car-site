import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { getAdminOrResponse } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { resolveFrontFeatures } from '@/lib/front-features';
import { getSettings } from '@/lib/settings';

export const POST: APIRoute = async ({ cookies }) => {
  const _auth = await getAdminOrResponse(cookies);
  if (_auth instanceof Response) return _auth;
  if (_auth.role !== 'superadmin' && (_auth.permissions & PERMISSIONS.SETTINGS_SMTP) === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const settings = await getSettings();
  const features = resolveFrontFeatures(settings);
  if (!features.sellInquiry) {
    return new Response(JSON.stringify({ ok: false, error: 'sell inquiry feature disabled' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  if (!settings.gmailUser || !settings.gmailAppPassword) {
    return Response.json({ ok: false, error: '請先設定 Gmail 帳號和應用程式密碼' });
  }
  const to = settings.notificationEmail || settings.gmailUser;
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: settings.gmailUser, pass: settings.gmailAppPassword },
    });
    await transporter.sendMail({
      from: `"賣車通知" <${settings.gmailUser}>`,
      to,
      subject: '測試信 — 賣車通知',
      text: '這是來自您網站的測試通知信。',
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) });
  }
};
