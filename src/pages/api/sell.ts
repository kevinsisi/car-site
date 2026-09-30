import type { APIRoute } from 'astro';
import type { createSellInquiry } from '@/lib/sell-inquiries';
import type { getSettings } from '@/lib/settings';
import { createD1Db } from '@/db/d1';
import { hasFeature, FEATURE_SELL_INQUIRY } from '@/lib/features';
import { deleteMedia, putMedia, type R2MediaBucket } from '@/lib/r2-media';
import { consumeSharedAttempt, createD1RateLimiter } from '@/lib/shared-rate-limit';

// In-memory rate limit: max 5 per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PHOTOS = 10;
const MAX_PHOTO_SIZE = 12 * 1024 * 1024;
const allowedPhotoTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

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

type SellSettings = Awaited<ReturnType<typeof getSettings>>;

export async function handleSellInquiry(
  { request, locals }: { request: Request; locals?: { runtime?: { env?: { DB_PREVIEW?: import('@/lib/shared-rate-limit').D1RateLimitBinding; MEDIA_PREVIEW?: R2MediaBucket } } } },
  dependencies?: {
    getSettings?: () => Promise<SellSettings>;
    createSellInquiry?: (input: Parameters<typeof createSellInquiry>[0], adapter?: Awaited<ReturnType<typeof createD1Db>>) => Promise<string>;
    sendNotification?: (settings: SellSettings, values: SellNotificationValues) => Promise<void>;
    now?: () => number;
  },
): Promise<Response> {
  const workerRequest = Boolean(locals?.runtime);
  const env = locals?.runtime?.env;
  if (workerRequest && !env?.DB_PREVIEW) {
    return new Response(JSON.stringify({ success: false, error: '請稍後再試' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }
  const adapter = workerRequest ? await createD1Db(env!.DB_PREVIEW!) : undefined;
  const getSettingsFn = dependencies?.getSettings ?? (async () => (await import('@/lib/settings')).getSettings(adapter));
  const createSellInquiryFn = dependencies?.createSellInquiry ?? (async (input, db) => (await import('@/lib/sell-inquiries')).createSellInquiry(input, db));
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  const limiter = workerRequest ? createD1RateLimiter(env!.DB_PREVIEW!) : undefined;
  const rateLimited = workerRequest
    ? !(await consumeSharedAttempt(limiter, ip, dependencies?.now?.() ?? Date.now()))
    : !checkRateLimit(ip);
  if (rateLimited) {
    return new Response(JSON.stringify({ success: false, error: '請稍後再試' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }

  const settings = await getSettingsFn();
  if (!hasFeature(settings.featureLicenseMask & settings.featureMask, FEATURE_SELL_INQUIRY)) {
    return new Response(JSON.stringify({ success: false, error: '此功能目前未開放' }), {
      status: 403,
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
  if (workerRequest && (!contactInfo.startsWith('DEMO-') || !contactName.startsWith('DEMO-'))) {
    return Response.json({ success: false, error: '預覽聯絡資料格式錯誤' }, { status: 400 });
  }

  const brand = String(formData.get('brand') || '').trim();
  const model = String(formData.get('model') || '').trim();
  const yearRaw = Number.parseInt(String(formData.get('year') || ''), 10);
  const year = Number.isFinite(yearRaw) ? yearRaw : null;
  const mileageRaw = Number.parseInt(String(formData.get('mileage') || ''), 10);
  const mileage = Number.isFinite(mileageRaw) ? mileageRaw : null;
  const exteriorColor = String(formData.get('exteriorColor') || '').trim();
  const notes = String(formData.get('notes') || '').trim();

  // Validate every photo before the first storage write.
  const photoUrls: string[] = [];
  const photoFiles = formData.getAll('photos').filter((f) => f instanceof File && f.size > 0) as File[];
  const bucket = locals?.runtime?.env?.MEDIA_PREVIEW;
  const selectedFiles = photoFiles.slice(0, MAX_PHOTOS);
  if (workerRequest && photoFiles.length > 0 && !bucket) {
    return Response.json({ success: false, error: '照片服務暫時無法使用' }, { status: 503 });
  }
  if (bucket) {
    for (const file of selectedFiles) {
      if (!allowedPhotoTypes[file.type] || file.size > MAX_PHOTO_SIZE) {
        return Response.json({ success: false, error: '照片格式或大小不符合限制' }, { status: 400 });
      }
    }
    const createdIds: string[] = [];
    try {
      for (const file of selectedFiles) {
        const id = `${dependencies?.now?.() ?? Date.now()}-${crypto.randomUUID()}${allowedPhotoTypes[file.type]}`;
        await putMedia(bucket, 'sell-inquiry', id, file, { contentType: file.type });
        createdIds.push(id);
        photoUrls.push(`/media/sell-inquiry/${id}`);
      }
    } catch {
      await Promise.allSettled(createdIds.map((id) => deleteMedia(bucket, 'sell-inquiry', id)));
      return Response.json({ success: false, error: '圖片上傳失敗，請稍後再試' }, { status: 500 });
    }
    try {
      await createSellInquiryFn({ brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoUrls }, adapter);
    } catch (error) {
      await Promise.allSettled(createdIds.map((id) => deleteMedia(bucket, 'sell-inquiry', id)));
      throw error;
    }
  } else if (photoFiles.length > 0) {
    // Preserve the existing Node filesystem path when no preview R2 binding exists.
    const { mkdir, writeFile } = await import('fs/promises');
    const { join } = await import('path');
    const dateStr = new Date().toISOString().slice(0, 10);
    const dir = join(process.cwd(), 'data', 'media', 'sell-inquiries', dateStr);
    await mkdir(dir, { recursive: true });
    for (const file of selectedFiles) {
      if (file.size > MAX_PHOTO_SIZE) continue;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await writeFile(join(dir, safeName), Buffer.from(await file.arrayBuffer()));
      photoUrls.push(`/media/sell-inquiries/${dateStr}/${safeName}`);
    }
    await createSellInquiryFn({ brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoUrls }, adapter);
  } else {
    await createSellInquiryFn({ brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoUrls }, adapter);
  }

  if (!workerRequest) {
    const sendNotificationFn = dependencies?.sendNotification ?? sendNotification;
    await sendNotificationFn(settings, { brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoCount: photoUrls.length });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

interface SellNotificationValues {
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  exteriorColor: string;
  notes: string;
  contactInfo: string;
  contactName: string;
  photoCount: number;
}

async function sendNotification(settings: SellSettings, values: SellNotificationValues): Promise<void> {
  const { brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoCount } = values;
  const notifyTo = settings.notificationEmail || settings.gmailUser;
  if (settings.gmailUser && settings.gmailAppPassword && notifyTo) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: { user: settings.gmailUser, pass: settings.gmailAppPassword },
      });
      await transporter.sendMail({
        from: `"賣車通知" <${settings.gmailUser}>`,
        to: notifyTo,
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
          `附件照片：${photoCount} 張`,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[sell] email notification failed:', err);
    }
  }
}

export const POST: APIRoute = async ({ request, locals }) => handleSellInquiry({ request, locals });
