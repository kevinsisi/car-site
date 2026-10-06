export const MAX_COMPARE_VEHICLES = 4;
export const COMPARE_SLUGS_KEY = 'compare_slugs';
export const COMPARE_META_KEY = 'compare_meta';

export interface CompareItem {
  slug: string;
  title: string;
  thumb: string;
  year: string;
}

export function normalizeCompareSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((slug): slug is string => typeof slug === 'string')
    .map((slug) => slug.trim()).filter(Boolean))].slice(0, MAX_COMPARE_VEHICLES);
}

export function comparisonHref(slugs: string[]): string {
  return `/cars/compare?${new URLSearchParams({ ids: normalizeCompareSlugs(slugs).join(',') })}`;
}

function imageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value, 'https://comparison.invalid');
    return ['http:', 'https:'].includes(url.protocol) ? value : '';
  } catch { return ''; }
}

export function normalizeCompareItems(slugs: unknown, metadata: unknown): CompareItem[] {
  const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, Partial<CompareItem>> : {};
  return normalizeCompareSlugs(slugs).map((slug) => {
    const item = Object.hasOwn(meta, slug) && meta[slug] && typeof meta[slug] === 'object' ? meta[slug] : {};
    return {
      slug,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : slug,
      thumb: imageUrl(item.thumb),
      year: typeof item.year === 'string' ? item.year.trim() : '',
    };
  });
}

type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Preserve the existing keys; unavailable storage stays usable for this page session. */
export function createCompareStore(storage?: StorageAccess) {
  let memory: CompareItem[] = [];
  let persistent = Boolean(storage);
  const parse = (value: string | null): unknown => {
    try { return JSON.parse(value || 'null'); } catch { return null; }
  };
  return {
    get persistent() { return persistent; },
    read(): CompareItem[] {
      if (persistent && storage) {
        try {
          memory = normalizeCompareItems(parse(storage.getItem(COMPARE_SLUGS_KEY)), parse(storage.getItem(COMPARE_META_KEY)));
        } catch { persistent = false; }
      }
      return memory.map((item) => ({ ...item }));
    },
    write(items: CompareItem[]): CompareItem[] {
      memory = normalizeCompareItems(items.map((item) => item.slug), Object.fromEntries(items.map((item) => [item.slug, item])));
      if (persistent && storage) {
        try {
          if (memory.length) {
            storage.setItem(COMPARE_META_KEY, JSON.stringify(Object.fromEntries(memory.map((item) => [item.slug, item]))));
            storage.setItem(COMPARE_SLUGS_KEY, JSON.stringify(memory.map((item) => item.slug)));
          } else {
            storage.removeItem(COMPARE_SLUGS_KEY);
            storage.removeItem(COMPARE_META_KEY);
          }
        } catch { persistent = false; }
      }
      return memory.map((item) => ({ ...item }));
    },
  };
}
