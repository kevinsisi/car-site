import * as cheerio from 'cheerio';

const CARSMEET_HOST = 'carsmeet.tw';
const FETCH_TIMEOUT_MS = 15000;

export interface CarsmeetImportData {
  sourceUrl: string;
  externalId: string;
  title: string;
  brand: string;
  model: string;
  subModel: string;
  year: string;
  mileage: string;
  exteriorColor: string;
  interiorColor: string;
  condition: string;
  headline: string;
  description: string;
  features: string[];
  photos: string[];
}

export class CarsmeetImportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'CarsmeetImportError';
  }
}

export function parseCarsmeetUrl(input: string): { url: string; externalId: string } {
  let parsed: URL;
  try {
    parsed = new URL(String(input || '').trim());
  } catch {
    throw new CarsmeetImportError('請輸入有效的 Carsmeet 車輛網址');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== CARSMEET_HOST) {
    throw new CarsmeetImportError('目前只支援 https://carsmeet.tw/數字/ 的車輛網址');
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || !/^\d+$/.test(segments[0])) {
    throw new CarsmeetImportError('目前只支援 https://carsmeet.tw/數字/ 的車輛網址');
  }
  return { url: `https://${CARSMEET_HOST}/${segments[0]}/`, externalId: segments[0] };
}

export async function importableCarsmeetData(inputUrl: string): Promise<CarsmeetImportData> {
  const { url, externalId } = parseCarsmeetUrl(inputUrl);
  const html = await fetchCarsmeetHtml(url);
  return parseCarsmeetHtml(html, url, externalId);
}

async function fetchCarsmeetHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'car-site-admin-import/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) throw new CarsmeetImportError(`Carsmeet 回應 ${response.status}，無法匯入`, 502);
    return await response.text();
  } catch (error) {
    if (error instanceof CarsmeetImportError) throw error;
    const message = error instanceof Error && error.name === 'AbortError' ? '連線 Carsmeet 逾時，請稍後再試' : '無法連線 Carsmeet，請確認網址後再試';
    throw new CarsmeetImportError(message, 502);
  } finally {
    clearTimeout(timer);
  }
}

function parseCarsmeetHtml(html: string, sourceUrl: string, externalId: string): CarsmeetImportData {
  const $ = cheerio.load(html);
  const title = cleanText($('h1').first().text()) || cleanText($('meta[property="og:title"]').attr('content')).replace(/ - 遇見好車.*$/, '');
  if (!title) throw new CarsmeetImportError('Carsmeet 頁面缺少車輛標題，無法匯入', 422);

  const specs = extractSpecs($);
  const colors = extractColors($);
  const titleParts = parseTitleParts(title, specs.get('年式'));
  const photos = extractPhotos($, sourceUrl);
  if (photos.length === 0) throw new CarsmeetImportError('Carsmeet 頁面沒有可匯入的車輛圖片', 422);

  const engine = specs.get('引擎') || '';
  const features = [engine ? `引擎 ${engine}` : '', titleParts.subModel].map(cleanText).filter(Boolean);
  const description = cleanText($('meta[name="description"]').attr('content'));

  return {
    sourceUrl,
    externalId,
    title,
    brand: titleParts.brand,
    model: titleParts.model,
    subModel: titleParts.subModel,
    year: specs.get('年式') || titleParts.year,
    mileage: normalizeMileage(specs.get('里程') || ''),
    exteriorColor: colors.exterior,
    interiorColor: colors.interior,
    condition: '嚴選車況',
    headline: title,
    description,
    features: [...new Set(features)],
    photos,
  };
}

function extractSpecs($: cheerio.CheerioAPI): Map<string, string> {
  const specs = new Map<string, string>();
  $('#acf_spec .custom-grid-content').each((_, grid) => {
    const items = $(grid).children('item').toArray();
    for (let i = 0; i < items.length; i += 2) {
      const label = cleanText($(items[i]).text());
      const value = cleanText($(items[i + 1]).text());
      if (label && value) specs.set(label, value);
    }
  });
  return specs;
}

function extractColors($: cheerio.CheerioAPI): { exterior: string; interior: string } {
  let exterior = '';
  let interior = '';
  $('section').each((_, section) => {
    const label = cleanText($(section).find('.elementor-widget-heading').first().text());
    const value = cleanText($(section).find('.color-picker').first().text());
    if (!value) return;
    if (!exterior && label.includes('外觀')) exterior = value;
    if (!interior && (label.includes('內飾') || label.includes('內裝'))) interior = value;
  });
  return { exterior, interior };
}

function parseTitleParts(title: string, yearHint = ''): { year: string; brand: string; model: string; subModel: string } {
  const normalized = title.replace(/[“”″]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = normalized.split(' ').filter(Boolean);
  const yearMatch = normalized.match(/(?:19|20)\d{2}/);
  const year = yearHint || yearMatch?.[0] || '';
  const offset = tokens[0] === year ? 1 : 0;
  const brand = normalizeBrand(tokens[offset] || 'Carsmeet');
  const model = tokens[offset + 1] || title;
  const subModel = tokens.slice(offset + 2).join(' ');
  return { year, brand, model, subModel };
}

function extractPhotos($: cheerio.CheerioAPI, sourceUrl: string): string[] {
  const urls = new Set<string>();
  const add = (raw: string | undefined) => {
    const url = normalizeImageUrl(raw, sourceUrl);
    if (url) urls.add(url);
  };
  add($('meta[property="og:image"]').attr('content'));
  $('img').each((_, image) => {
    add($(image).attr('src'));
    add($(image).attr('data-src'));
    const srcset = $(image).attr('srcset') || $(image).attr('data-srcset') || '';
    for (const item of srcset.split(',')) add(item.trim().split(/\s+/)[0]);
  });
  return [...urls];
}

function normalizeImageUrl(raw: string | undefined, sourceUrl: string): string {
  const value = cleanText(raw);
  if (!value || value.startsWith('data:')) return '';
  let url: URL;
  try {
    url = new URL(value, sourceUrl);
  } catch {
    return '';
  }
  if (url.hostname !== CARSMEET_HOST || !url.pathname.includes('/wp-content/uploads/')) return '';
  if (!/\.(jpe?g|png|webp)$/i.test(url.pathname)) return '';
  if (/-(?:\d+)x(?:\d+)\.(jpe?g|png|webp)$/i.test(url.pathname)) return '';
  if (/favicon|logo|icon/i.test(url.pathname)) return '';
  return url.toString();
}

function normalizeMileage(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? `${Number(digits).toLocaleString('en-US')} km` : cleanText(value);
}

function normalizeBrand(value: string): string {
  const lower = value.toLowerCase();
  if (lower === 'bentley') return 'Bentley';
  if (lower === 'rolls-royce' || lower === 'rolls') return 'Rolls-Royce';
  if (lower === 'mercedes-benz' || lower === 'benz') return 'Mercedes-Benz';
  if (lower === 'porsche') return 'Porsche';
  if (lower === 'bmw') return 'BMW';
  return value;
}

function cleanText(value: string | undefined | null): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
