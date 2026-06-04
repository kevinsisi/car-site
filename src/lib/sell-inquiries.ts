import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/connection';
import { sellInquiries } from '@/db/schema';

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

export async function listSellInquiries(): Promise<SellInquiryView[]> {
  const rows = await db.select().from(sellInquiries).orderBy(desc(sellInquiries.createdAt));
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

export async function createSellInquiry(input: Omit<SellInquiryView, 'id' | 'createdAt' | 'readAt'>): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(sellInquiries).values({
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

export async function markSellInquiryRead(id: string): Promise<void> {
  await db.update(sellInquiries).set({ readAt: new Date().toISOString() }).where(eq(sellInquiries.id, id));
}

export async function countUnreadSellInquiries(): Promise<number> {
  const rows = await db.select({ id: sellInquiries.id }).from(sellInquiries).where(isNull(sellInquiries.readAt));
  return rows.length;
}
