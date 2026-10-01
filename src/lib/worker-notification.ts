import type { SiteSettings } from './settings';

export interface WorkerSellNotificationValues {
  brand: string; model: string; year: number | null; mileage: number | null;
  exteriorColor: string; notes: string; contactInfo: string; contactName: string; photoCount: number;
}

export interface WorkerSmtpOptions {
  host: string; port: number; secure: boolean;
  connectionTimeout: number; greetingTimeout: number; socketTimeout: number;
  auth: { user: string; pass: string };
  tls: { rejectUnauthorized: true };
}

const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 15_000;

export async function createWorkerNotification(
  settings: Pick<SiteSettings, 'notificationEmail' | 'gmailUser' | 'gmailAppPassword'>,
  values: WorkerSellNotificationValues,
  deliver: (options: WorkerSmtpOptions, message: { from: string; to: string; subject: string; text: string }) => Promise<void>,
): Promise<{ outcome: 'unconfigured' | 'failed' | 'sent' }> {
  const recipient = settings.notificationEmail || settings.gmailUser;
  if (!settings.gmailUser || !settings.gmailAppPassword || !recipient) return { outcome: 'unconfigured' };
  const { brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoCount } = values;
  const message = {
    from: `"賣車通知" <${settings.gmailUser}>`,
    to: recipient,
    subject: `新賣車申請：${[brand, model, year].filter(Boolean).join(' ')}`,
    text: [
      `姓名：${contactName}`, `聯絡方式：${contactInfo}`, `品牌：${brand || '未填'}`,
      `型號：${model || '未填'}`, `年份：${year ?? '未填'}`,
      `里程：${mileage != null ? `${mileage} km` : '未填'}`, `外觀顏色：${exteriorColor || '未填'}`,
      `車況說明：${notes || '未填'}`, `附件照片：${photoCount} 張`,
    ].join('\n'),
  };
  const options: WorkerSmtpOptions = {
    host: 'smtp.gmail.com', port: 465, secure: true,
    connectionTimeout: CONNECTION_TIMEOUT_MS, greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    auth: { user: settings.gmailUser, pass: settings.gmailAppPassword },
    tls: { rejectUnauthorized: true },
  };
  try {
    await deliver(options, message);
    return { outcome: 'sent' };
  } catch {
    console.error('[sell] Worker email notification failed');
    return { outcome: 'failed' };
  }
}

export async function sendWorkerSellNotification(
  settings: Pick<SiteSettings, 'notificationEmail' | 'gmailUser' | 'gmailAppPassword'>,
  values: WorkerSellNotificationValues,
): Promise<{ outcome: 'unconfigured' | 'failed' | 'sent' }> {
  return createWorkerNotification(settings, values, async (options, message) => {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport(options);
    await transporter.sendMail(message);
  });
}
