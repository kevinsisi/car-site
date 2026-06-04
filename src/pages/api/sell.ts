import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createSellInquiry } from '@/lib/sell-inquiries';
import { getSettings } from '@/lib/settings';

// In-memory rate limit: max 5 per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ success: false, error: '請稍後再試' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ success: false, error: '請求格式錯誤' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const contactInfo = String(formData.get('contactInfo') || '').trim();
  const contactName = String(formData.get('contactName') || '').trim();
  if (!contactInfo) {
    return new Response(JSON.stringify({ success: false, error: '請填寫聯絡方式' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const brand = String(formData.get('brand') || '').trim();
  const model = String(formData.get('model') || '').trim();
  const yearRaw = Number.parseInt(String(formData.get('year') || ''), 10);
  const year = Number.isFinite(yearRaw) ? yearRaw : null;
  const mileageRaw = Number.parseInt(String(formData.get('mileage') || ''), 10);
  const mileage = Number.isFinite(mileageRaw) ? mileageRaw : null;
  const exteriorColor = String(formData.get('exteriorColor') || '').trim();
  const notes = String(formData.get('notes') || '').trim();

  // Save photos
  const photoUrls: string[] = [];
  const photoFiles = formData.getAll('photos').filter((f) => f instanceof File && f.size > 0) as File[];
  if (photoFiles.length > 0) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const dir = join(process.cwd(), 'data', 'media', 'sell-inquiries', dateStr);
    await mkdir(dir, { recursive: true });
    for (const file of photoFiles.slice(0, 10)) {
      if (file.size > 12 * 1024 * 1024) continue;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await writeFile(join(dir, safeName), Buffer.from(await file.arrayBuffer()));
      photoUrls.push(`/media/sell-inquiries/${dateStr}/${safeName}`);
    }
  }

  await createSellInquiry({ brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoUrls });

  // Send email notification (best-effort)
  const settings = await getSettings();
  if (settings.notificationEmail && settings.smtpHost && settings.smtpUser) {
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
        subject: `新賣車申請：${[brand, model, year].filter(Boolean).join(' ')}`,
        text: [
          `姓名：${contactName}`,
          `聯絡方式：${contactInfo}`,
          `品牌：${brand || '未填'}`,
          `型號：${model || '未填'}`,
          `年份：${year ?? '未填'}`,
          `里程：${mileage != null ? `${mileage} km` : '未填'}`,
          `外觀顏色：${exteriorColor || '未填'}`,
          `車況說明：${notes || '未填'}`,
          `附件照片：${photoUrls.length} 張`,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[sell] email notification failed:', err);
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
