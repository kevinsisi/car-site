/** Bundled public assets work in both Workers and Node without database writes. */
const bundledIcons: Record<string, string> = {
  'alfa-romeo': 'alfa-romeo',
  'alfa-romeo-106': 'alfa-romeo',
  'aston-martin': 'aston-martin',
  bentley: 'bentley',
  ferrari: 'ferrari',
  lamborghini: 'lamborghini',
  lexus: 'lexus',
  mclaren: 'mclaren',
  'mercedes-benz': 'mercedes-benz',
  porsche: 'porsche',
  'rolls-royce': 'rolls-royce',
  toyota: 'toyota',
};

export function resolveBrandIcon(iconUrl: string | null | undefined, slug: string): string | null {
  if (iconUrl?.trim()) return iconUrl;
  const bundled = Object.hasOwn(bundledIcons, slug) ? bundledIcons[slug] : null;
  return bundled ? `/brand-icons/${bundled}.png` : null;
}
