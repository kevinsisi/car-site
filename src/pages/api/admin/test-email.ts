import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { getAdminOrResponse } from '@/lib/auth';
import { getSettings } from '@/lib/settings';

export const POST: APIRoute = async ({ cookies }) => {
  const _auth = await getAdminOrResponse(cookies);
  if (_auth instanceof Response) return _auth;
  const settings = await getSettings();
  if (!settings.notificationEmail || !settings.smtpHost) {
    return Response.json({ ok: false, error: '請先設定 SMTP 和通知信箱' });
  }
  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number.parseInt(settings.smtpPort || '587', 10),
      secure: settings.smtpPort === '465',
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });
    await transporter.sendMail({
      from: settings.smtpUser,
      to: settings.notificationEmail,
      subject: '測試信 — 賣車通知',
      text: '這是來自您網站的測試通知信。',
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) });
  }
};
