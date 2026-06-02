import type { SiteSettings } from '@/lib/settings';
import { styles } from '@/lib/theme';

const DEFAULT_SITE_ICON_PATH = '/site-icon.svg';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function siteIconHref(settings: SiteSettings): string {
  return settings.siteIconUrl || DEFAULT_SITE_ICON_PATH;
}

export function buildDefaultSiteIconSvg(settings: SiteSettings): string {
  const tokens = styles[settings.activeStyle].tokens;
  const siteName = settings.siteName.trim();
  const mark = escapeXml(Array.from(siteName || 'C')[0] || 'C');
  const label = escapeXml(siteName || 'Car site');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="bg" x1="30" y1="20" x2="220" y2="238" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${tokens['--surface']}"/>
      <stop offset="1" stop-color="${tokens['--bg']}"/>
    </linearGradient>
    <radialGradient id="glow" cx="35%" cy="22%" r="65%">
      <stop offset="0" stop-color="${tokens['--accent']}" stop-opacity="0.36"/>
      <stop offset="1" stop-color="${tokens['--accent']}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" rx="58" fill="url(#bg)"/>
  <rect width="256" height="256" rx="58" fill="url(#glow)"/>
  <path d="M45 174c20-37 41-61 83-61s63 24 83 61" fill="none" stroke="${tokens['--accent']}" stroke-width="16" stroke-linecap="round"/>
  <path d="M67 170h24m65 0h24" stroke="${tokens['--accent-strong']}" stroke-width="13" stroke-linecap="round"/>
  <text x="128" y="104" text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="88" font-weight="900" fill="${tokens['--accent-strong']}">${mark}</text>
  <rect x="22" y="22" width="212" height="212" rx="44" fill="none" stroke="${tokens['--accent']}" stroke-opacity="0.28" stroke-width="6"/>
</svg>`;
}
