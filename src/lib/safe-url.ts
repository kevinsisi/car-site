const SAFE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'tel:', 'mailto:']);
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);

function safeRelativePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

export function sanitizePublicHref(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === '#') return raw;
  if (safeRelativePath(raw)) return raw;

  try {
    const url = new URL(raw);
    return SAFE_HREF_PROTOCOLS.has(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

export function sanitizeImageUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === '/site-icon.svg' || raw.startsWith('/media/')) return raw;

  try {
    const url = new URL(raw);
    return SAFE_IMAGE_PROTOCOLS.has(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}
