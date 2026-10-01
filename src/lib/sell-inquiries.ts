import { count, desc, eq, isNull } from 'drizzle-orm';
import type { createD1Db } from '@/db/d1';
import { sellInquiries } from '@/db/schema';

type SellInquiryDb = Awaited<ReturnType<typeof createD1Db>>;
const PREVIEW_INQUIRY_LIMIT = 100;

async function getDb(adapter?: SellInquiryDb): Promise<SellInquiryDb> {
  if (adapter) return adapter;
  const { db } = await import('@/db/connection');
  return db as unknown as SellInquiryDb;
}

export interface SellInquiryView {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  exteriorColor: string;
  notes: string;
  contactInfo: string;
  contactName: string;
  photoUrls: string[];
  createdAt: string;
  readAt: string | null;
}

function parsePhotoUrls(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function listSellInquiries(adapter?: SellInquiryDb): Promise<SellInquiryView[]> {
  const db = await getDb(adapter);
  const rows = adapter
    ? await db.select().from(sellInquiries).orderBy(desc(sellInquiries.createdAt)).limit(PREVIEW_INQUIRY_LIMIT)
    : await db.select().from(sellInquiries).orderBy(desc(sellInquiries.createdAt));
  return rows.map((row) => ({
    id: row.id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    mileage: row.mileage,
    exteriorColor: row.exteriorColor,
    notes: row.notes,
    contactInfo: row.contactInfo,
    contactName: row.contactName,
    photoUrls: parsePhotoUrls(row.photoUrls),
    createdAt: row.createdAt,
    readAt: row.readAt,
  }));
}

export async function createSellInquiry(input: Omit<SellInquiryView, 'id' | 'createdAt' | 'readAt'>, adapter?: SellInquiryDb): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await (await getDb(adapter)).insert(sellInquiries).values({
    id,
    brand: input.brand,
    model: input.model,
    year: input.year,
    mileage: input.mileage,
    exteriorColor: input.exteriorColor,
    notes: input.notes,
    contactInfo: input.contactInfo,
    contactName: input.contactName,
    photoUrls: JSON.stringify(input.photoUrls),
    createdAt: now,
    readAt: null,
  });
  return id;
}

export async function markSellInquiryRead(id: string, adapter?: SellInquiryDb): Promise<void> {
  await (await getDb(adapter)).update(sellInquiries).set({ readAt: new Date().toISOString() }).where(eq(sellInquiries.id, id));
}

export async function countUnreadSellInquiries(adapter?: SellInquiryDb): Promise<number> {
  const [result] = await (await getDb(adapter)).select({ value: count() }).from(sellInquiries).where(isNull(sellInquiries.readAt));
  return result.value;
}
