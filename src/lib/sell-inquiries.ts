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

export async function listSellInquiries(): Promise<SellInquiryView[]> {
  return [];
}

export async function countUnreadSellInquiries(): Promise<number> {
  return 0;
}
