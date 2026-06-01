export type TemplateId = 'private-salon' | 'heritage-gallery' | 'executive-showroom';
export type StyleId = 'carsmeet-blue' | 'champagne-black' | 'warm-gallery' | 'executive-slate' | 'classic-burgundy';

export const templates: Record<TemplateId, { label: string; description: string; layoutClass: string }> = {
  'private-salon': {
    label: '私人會所',
    description: '私人會所感，大圖與直接洽詢路徑。',
    layoutClass: 'template-private-salon',
  },
  'heritage-gallery': {
    label: '典藏藝廊',
    description: '藝廊式留白，適合典藏車與稀有車。',
    layoutClass: 'template-heritage-gallery',
  },
  'executive-showroom': {
    label: '行政展廳',
    description: '清楚穩重，適合快速查看與成交導向。',
    layoutClass: 'template-executive-showroom',
  },
};

export const styles: Record<StyleId, { label: string; className: string; tokens: Record<string, string> }> = {
  'carsmeet-blue': {
    label: '都會藍',
    className: 'style-carsmeet-blue',
    tokens: {
      '--bg': '#f7f8fa',
      '--surface': '#ffffff',
      '--surface-soft': '#e9edf3',
      '--text': '#20242a',
      '--muted': '#5f6670',
      '--accent': '#2f66ad',
      '--accent-strong': '#184f97',
      '--line': 'rgba(47, 102, 173, 0.22)',
    },
  },
  'champagne-black': {
    label: '香檳黑',
    className: 'style-champagne-black',
    tokens: {
      '--bg': '#070605',
      '--surface': '#12100d',
      '--surface-soft': '#1f1a14',
      '--text': '#fbf4e8',
      '--muted': '#c8bda9',
      '--accent': '#d7b56d',
      '--accent-strong': '#f1d58c',
      '--line': 'rgba(215, 181, 109, 0.28)',
    },
  },
  'warm-gallery': {
    label: '暖光藝廊',
    className: 'style-warm-gallery',
    tokens: {
      '--bg': '#f4efe6',
      '--surface': '#fffaf0',
      '--surface-soft': '#e6d8c3',
      '--text': '#231b15',
      '--muted': '#6d5c4c',
      '--accent': '#9c7443',
      '--accent-strong': '#6f4f2c',
      '--line': 'rgba(80, 56, 34, 0.18)',
    },
  },
  'executive-slate': {
    label: '行政石墨',
    className: 'style-executive-slate',
    tokens: {
      '--bg': '#10151a',
      '--surface': '#182028',
      '--surface-soft': '#25313c',
      '--text': '#f6f1e8',
      '--muted': '#b8c0c6',
      '--accent': '#d9c28d',
      '--accent-strong': '#f0d99b',
      '--line': 'rgba(217, 194, 141, 0.2)',
    },
  },
  'classic-burgundy': {
    label: '經典酒紅',
    className: 'style-classic-burgundy',
    tokens: {
      '--bg': '#120609',
      '--surface': '#241015',
      '--surface-soft': '#371923',
      '--text': '#fff2df',
      '--muted': '#d8c4b3',
      '--accent': '#b88a4d',
      '--accent-strong': '#e1bd78',
      '--line': 'rgba(184, 138, 77, 0.28)',
    },
  },
};

export function resolveTemplate(value: string | undefined | null): TemplateId {
  return value && value in templates ? (value as TemplateId) : 'private-salon';
}

export function resolveStyle(value: string | undefined | null): StyleId {
  return value && value in styles ? (value as StyleId) : 'carsmeet-blue';
}

export function styleVars(styleId: StyleId): string {
  return Object.entries(styles[styleId].tokens)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}
