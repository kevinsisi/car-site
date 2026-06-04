# Interactive Features (Comparison + Video + Sell My Car) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vehicle comparison (URL-param-based), homepage video carousel, bottom IG video links section, and a public sell-my-car inquiry form with email notification.

**Architecture:** Comparison is stateless — the URL `?ids=slug1,slug2` is the full state. Video data lives in `siteSettings` (hero carousel) and a new `siteVideoLinks` table (bottom IG section). Sell inquiries go to a new `sellInquiries` table; email notifications use SMTP credentials stored in `siteSettings`. All admin management is in `AdminDashboard.svelte`.

**Tech Stack:** Astro 5 SSR, Svelte 5, SQLite + Drizzle ORM, TypeScript, `nodemailer` for SMTP. Build: `npm run build`.

**Dependency:** Plan 1 must be complete before this plan so `brandIconUrl` is available on `VehicleView` (used in comparison page).

---

## File Map

**New files:**
- `src/db/migrations/0008_video_links.sql`
- `src/db/migrations/0009_sell_inquiries.sql`
- `src/lib/video-links.ts`
- `src/lib/sell-inquiries.ts`
- `src/components/VideoCarousel.astro`
- `src/components/VideoLinksSection.astro`
- `src/pages/cars/compare.astro`
- `src/pages/sell.astro`
- `src/pages/api/sell.ts`

**Modified files:**
- `src/db/schema.ts` — add `siteVideoLinks` and `sellInquiries` tables
- `src/lib/settings.ts` — add `heroVideos`, `videoSectionEnabled`, `videoSectionPosition`, `notificationEmail`, SMTP keys
- `src/components/VehicleCard.astro` — add compare button
- `src/pages/cars/index.astro` — pass compareIds to cards, compare state from URL
- `src/pages/index.astro` — add VideoCarousel and VideoLinksSection
- `src/components/AdminDashboard.svelte` — video carousel settings, video links management, sell inquiries view, SMTP settings

---

### Task 1: DB Migrations + Schema

**Files:**
- Create: `src/db/migrations/0008_video_links.sql`
- Create: `src/db/migrations/0009_sell_inquiries.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Create migration 0008**

```sql
-- src/db/migrations/0008_video_links.sql
CREATE TABLE site_video_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 2: Create migration 0009**

```sql
-- src/db/migrations/0009_sell_inquiries.sql
CREATE TABLE sell_inquiries (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  year INTEGER,
  mileage INTEGER,
  exterior_color TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  contact_info TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  photo_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  read_at TEXT
);
```

- [ ] **Step 3: Update `src/db/schema.ts` — add both tables**

```ts
export const siteVideoLinks = sqliteTable('site_video_links', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const sellInquiries = sqliteTable('sell_inquiries', {
  id: text('id').primaryKey(),
  brand: text('brand').notNull().default(''),
  model: text('model').notNull().default(''),
  year: integer('year'),
  mileage: integer('mileage'),
  exteriorColor: text('exterior_color').notNull().default(''),
  notes: text('notes').notNull().default(''),
  contactInfo: text('contact_info').notNull(),
  contactName: text('contact_name').notNull().default(''),
  photoUrls: text('photo_urls').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  readAt: text('read_at'),
});
```

- [ ] **Step 4: Run migrations**

```bash
npx tsx src/db/migrate.ts
```

Expected: both tables created without error.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/0008_video_links.sql src/db/migrations/0009_sell_inquiries.sql src/db/schema.ts
git commit -m "feat: add siteVideoLinks and sellInquiries DB tables"
```

---

### Task 2: Create `lib/video-links.ts`

**Files:**
- Create: `src/lib/video-links.ts`

- [ ] **Step 1: Create the lib**

```ts
import { asc } from 'drizzle-orm';
import { db } from '@/db/connection';
import { siteVideoLinks } from '@/db/schema';

export interface VideoLinkView {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  sortOrder: number;
}

export async function listVideoLinks(): Promise<VideoLinkView[]> {
  const rows = await db.select().from(siteVideoLinks).orderBy(asc(siteVideoLinks.sortOrder));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl ?? null,
    sortOrder: row.sortOrder,
  }));
}

export async function setVideoLinks(input: Omit<VideoLinkView, 'id'>[]): Promise<void> {
  const now = new Date().toISOString();
  await db.delete(siteVideoLinks);
  for (const [i, item] of input.entries()) {
    if (!item.url) continue;
    await db.insert(siteVideoLinks).values({
      id: crypto.randomUUID(),
      title: item.title || '',
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? null,
      sortOrder: item.sortOrder ?? i,
      createdAt: now,
    });
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/video-links.ts
git commit -m "feat: add video-links lib"
```

---

### Task 3: Create `lib/sell-inquiries.ts`

**Files:**
- Create: `src/lib/sell-inquiries.ts`

- [ ] **Step 1: Create the lib**

```ts
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
  await db
    .update(sellInquiries)
    .set({ readAt: new Date().toISOString() })
    .where(eq(sellInquiries.id, id));
}

export async function countUnreadSellInquiries(): Promise<number> {
  const rows = await db.select({ id: sellInquiries.id }).from(sellInquiries).where(isNull(sellInquiries.readAt));
  return rows.length;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/sell-inquiries.ts
git commit -m "feat: add sell-inquiries lib"
```

---

### Task 4: Update `settings.ts` — Video and Email Settings

**Files:**
- Modify: `src/lib/settings.ts`

- [ ] **Step 1: Add `HeroVideo` type**

```ts
export interface HeroVideo {
  id: string;
  url: string;
  type: 'youtube' | 'mp4';
  thumbnailUrl: string;
  label: string;
}
export type VideoSectionPosition = 'below-hero' | 'below-featured' | 'above-footer';
```

- [ ] **Step 2: Add new fields to `SiteSettings` interface**

```ts
heroVideos: HeroVideo[];
videoSectionEnabled: boolean;
videoSectionPosition: VideoSectionPosition;
videoLinksEnabled: boolean;
videoLinksSectionTitle: string;
notificationEmail: string;
smtpHost: string;
smtpPort: string;
smtpUser: string;
smtpPass: string;
```

- [ ] **Step 3: Add defaults**

```ts
heroVideos: [],
videoSectionEnabled: false,
videoSectionPosition: 'below-hero',
videoLinksEnabled: false,
videoLinksSectionTitle: '精選影片',
notificationEmail: '',
smtpHost: '',
smtpPort: '587',
smtpUser: '',
smtpPass: '',
```

- [ ] **Step 4: Add resolvers in `getSettings()`**

```ts
heroVideos: (() => {
  try {
    const parsed = JSON.parse(map.get('heroVideos') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
})(),
videoSectionEnabled: map.get('videoSectionEnabled') === 'true',
videoSectionPosition: (() => {
  const v = map.get('videoSectionPosition');
  if (v === 'below-featured' || v === 'above-footer') return v;
  return 'below-hero';
})(),
videoLinksEnabled: map.get('videoLinksEnabled') === 'true',
videoLinksSectionTitle: map.get('videoLinksSectionTitle') || defaults.videoLinksSectionTitle,
notificationEmail: map.get('notificationEmail') || '',
smtpHost: map.get('smtpHost') || '',
smtpPort: map.get('smtpPort') || '587',
smtpUser: map.get('smtpUser') || '',
smtpPass: map.get('smtpPass') || '',
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts
git commit -m "feat: add video and email settings to SiteSettings"
```

---

### Task 5: Create Vehicle Comparison Page

**Files:**
- Create: `src/pages/cars/compare.astro`

- [ ] **Step 1: Create the page**

```astro
---
import PublicLayout from '@/layouts/PublicLayout.astro';
import BrandIcon from '@/components/BrandIcon.astro';
import { getSettings } from '@/lib/settings';
import { getVehicleBySlug } from '@/lib/vehicles';

const settings = await getSettings();
const idsParam = Astro.url.searchParams.get('ids') || '';
const slugs = idsParam.split(',').map((s) => s.trim()).filter(Boolean);

const vehicles = (await Promise.all(slugs.map((slug) => getVehicleBySlug(slug)))).filter(Boolean);

const specRows: { key: string; label: string }[] = [
  { key: 'year',          label: '年份' },
  { key: 'mileage',       label: '里程' },
  { key: 'condition',     label: '車況' },
  { key: 'exteriorColor', label: '外觀顏色' },
  { key: 'interiorColor', label: '內裝顏色' },
  { key: 'brand',         label: '品牌' },
  { key: 'model',         label: '型號' },
  { key: 'subModel',      label: '規格' },
];

function removeSlug(slug: string): string {
  const remaining = slugs.filter((s) => s !== slug);
  return remaining.length ? `/cars/compare?ids=${remaining.join(',')}` : '/cars/compare';
}
---

<PublicLayout title={`車輛比較｜${settings.siteName}`} description="比較多款車輛規格">
  <div class="compare-page">
    <div class="compare-page__header">
      <h1>車輛比較</h1>
      {vehicles.length > 0 && (
        <a href="/cars/compare" class="btn-secondary">清除全部</a>
      )}
    </div>

    {vehicles.length === 0 ? (
      <div class="compare-empty">
        <p>尚未選擇任何車輛</p>
        <a href="/cars" class="btn-primary">瀏覽庫存</a>
      </div>
    ) : (
      <div class="compare-table-wrapper">
        <table class="compare-table">
          <thead>
            <tr>
              <th class="compare-table__label-col"></th>
              {vehicles.map((v) => (
                <th class="compare-table__vehicle-col">
                  <div class="compare-vehicle-header">
                    <a href={`/cars/${v!.slug}`}>
                      {v!.coverImage && <img src={v!.coverImage.url} alt={v!.title} loading="lazy" />}
                    </a>
                    <div class="compare-vehicle-title">
                      <BrandIcon iconUrl={v!.brandIconUrl} alt={v!.brandDisplayName} size={20} />
                      <a href={`/cars/${v!.slug}`}>{v!.cardTitle}</a>
                    </div>
                    <a href={removeSlug(v!.slug)} class="compare-remove" aria-label={`移除 ${v!.title}`}>✕ 移除</a>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {specRows.map((row) => (
              <tr>
                <td class="compare-table__label">{row.label}</td>
                {vehicles.map((v) => (
                  <td class="compare-table__value">
                    {(v as Record<string, unknown>)[row.key] as string || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <div class="compare-page__footer">
      <a href="/cars" class="btn-secondary">繼續加入車輛</a>
    </div>
  </div>
</PublicLayout>

<style>
.compare-page { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
.compare-page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
.compare-empty { text-align: center; padding: 4rem; }
.compare-table-wrapper { overflow-x: auto; }
.compare-table { width: 100%; border-collapse: collapse; }
.compare-table th, .compare-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border, #e5e5e5); vertical-align: top; }
.compare-table__label-col { width: 120px; }
.compare-table__vehicle-col { min-width: 200px; }
.compare-table__label { font-weight: 600; font-size: 0.85rem; color: var(--muted, #777); }
.compare-vehicle-header { display: flex; flex-direction: column; gap: 0.5rem; }
.compare-vehicle-header img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 4px; }
.compare-vehicle-title { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; font-weight: 600; }
.compare-remove { font-size: 0.8rem; color: var(--muted, #777); text-decoration: none; }
.compare-remove:hover { color: var(--danger, #c00); }
.compare-page__footer { margin-top: 2rem; }
</style>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Manual test**

Open `http://localhost:4321/cars/compare?ids=<a-real-slug>` (replace with an actual vehicle slug from your DB). Verify the comparison table renders with vehicle data.

- [ ] **Step 4: Commit**

```bash
git add src/pages/cars/compare.astro
git commit -m "feat: add vehicle comparison page"
```

---

### Task 6: Add Compare Button to `VehicleCard.astro` and `cars/index.astro`

**Files:**
- Modify: `src/components/VehicleCard.astro`
- Modify: `src/pages/cars/index.astro`

- [ ] **Step 1: Update `VehicleCard.astro` — add compare button prop and UI**

Add `compareIds` prop to the Props interface:

```ts
interface Props {
  vehicle: VehicleView;
  shareText?: string;
  compareIds?: string[];
}
const { vehicle, shareText, compareIds = [] } = Astro.props;
const isComparing = compareIds.includes(vehicle.slug);
const newIds = isComparing
  ? compareIds.filter((id) => id !== vehicle.slug)
  : [...compareIds, vehicle.slug];
const compareHref = newIds.length ? `/cars/compare?ids=${newIds.join(',')}` : '/cars/compare';
```

In the card footer (after the share button), add:

```astro
<a href={compareHref} class={`compare-btn${isComparing ? ' is-comparing' : ''}`}>
  {isComparing ? '✓ 已加入比較' : '＋ 比較'}
</a>
```

CSS:
```css
.compare-btn {
  font-size: 0.75rem;
  padding: 4px 10px;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 4px;
  text-decoration: none;
  color: var(--muted, #777);
  transition: all 0.15s;
}
.compare-btn.is-comparing {
  border-color: var(--accent, #0066cc);
  color: var(--accent, #0066cc);
  background: var(--accent-subtle, #e8f0fc);
}
```

- [ ] **Step 2: Update `cars/index.astro` — read compare state from URL**

In the frontmatter:
```ts
const compareIdsParam = Astro.url.searchParams.get('ids') || '';
const compareIds = compareIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
```

When rendering `<VehicleCard>`, pass `compareIds`:
```astro
<VehicleCard vehicle={vehicle} shareText={shareText} compareIds={compareIds} />
```

- [ ] **Step 3: Add compare status bar when vehicles are in compare list**

In `cars/index.astro` template, add above the vehicle grid:

```astro
{compareIds.length > 0 && (
  <div class="compare-bar">
    <span>已選擇 {compareIds.length} 輛車進行比較</span>
    <a href={`/cars/compare?ids=${compareIds.join(',')}`} class="btn-primary">查看比較</a>
    <a href="/cars" class="btn-secondary">清除</a>
  </div>
)}
```

CSS:
```css
.compare-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--accent-subtle, #e8f0fc);
  border-radius: 8px;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Manual test**

Browse `/cars`, click "＋ 比較" on two vehicles. Verify the URL updates to `/cars?ids=slug1,slug2` and the compare bar appears. Click "查看比較" to verify the comparison page loads with both vehicles.

- [ ] **Step 6: Commit**

```bash
git add src/components/VehicleCard.astro src/pages/cars/index.astro
git commit -m "feat: add compare button to vehicle cards and compare bar"
```

---

### Task 7: Create `VideoCarousel.astro`

**Files:**
- Create: `src/components/VideoCarousel.astro`

- [ ] **Step 1: Create the component**

```astro
---
import type { HeroVideo } from '@/lib/settings';
interface Props {
  videos: HeroVideo[];
  title?: string;
}
const { videos, title } = Astro.props;
if (!videos.length) return;

function youtubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return match?.[1] ?? null;
}
---
{videos.length > 0 && (
  <section class="video-carousel reveal-section">
    {title && <h2 class="video-carousel__title">{title}</h2>}
    <div class="video-carousel__stage" data-carousel>
      {videos.map((video, index) => (
        <div class={`video-carousel__item${index === 0 ? ' is-active' : ''}`} data-item={index}>
          {video.type === 'youtube' && youtubeId(video.url) ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId(video.url)}?rel=0`}
              title={video.label || `影片 ${index + 1}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              loading="lazy"
            ></iframe>
          ) : (
            <video
              src={video.url}
              poster={video.thumbnailUrl || undefined}
              controls
              preload="none"
              title={video.label || `影片 ${index + 1}`}
            ></video>
          )}
        </div>
      ))}
    </div>

    {videos.length > 1 && (
      <div class="video-carousel__controls">
        <button type="button" data-carousel-prev aria-label="上一段影片">‹</button>
        <div class="video-carousel__dots">
          {videos.map((_, i) => (
            <button type="button" class={`dot${i === 0 ? ' is-active' : ''}`} data-carousel-dot={i} aria-label={`跳到影片 ${i + 1}`}></button>
          ))}
        </div>
        <button type="button" data-carousel-next aria-label="下一段影片">›</button>
      </div>
    )}
  </section>
)}

<script>
  document.querySelectorAll<HTMLElement>('[data-carousel]').forEach((carousel) => {
    const items = Array.from(carousel.querySelectorAll<HTMLElement>('[data-item]'));
    const section = carousel.closest('.video-carousel');
    const dots = Array.from(section?.querySelectorAll<HTMLElement>('[data-carousel-dot]') ?? []);
    let current = 0;

    const show = (index: number) => {
      items[current]?.classList.remove('is-active');
      dots[current]?.classList.remove('is-active');
      current = (index + items.length) % items.length;
      items[current]?.classList.add('is-active');
      dots[current]?.classList.add('is-active');
    };

    section?.querySelector('[data-carousel-prev]')?.addEventListener('click', () => show(current - 1));
    section?.querySelector('[data-carousel-next]')?.addEventListener('click', () => show(current + 1));
    dots.forEach((dot, i) => dot.addEventListener('click', () => show(i)));
  });
</script>

<style>
.video-carousel { width: 100%; }
.video-carousel__title { text-align: center; margin-bottom: 1rem; }
.video-carousel__stage { position: relative; width: 100%; }
.video-carousel__item { display: none; }
.video-carousel__item.is-active { display: block; }
.video-carousel__item iframe,
.video-carousel__item video {
  width: 100%;
  aspect-ratio: 16/9;
  border: 0;
  border-radius: var(--card-radius, 8px);
  background: #000;
}
.video-carousel__controls { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1rem; }
.video-carousel__controls button { background: none; border: 0; font-size: 1.5rem; cursor: pointer; padding: 0.25em 0.5em; color: inherit; }
.video-carousel__dots { display: flex; gap: 0.5rem; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted, #aaa); border: 0; padding: 0; cursor: pointer; transition: background 0.15s; }
.dot.is-active { background: var(--accent, #0066cc); }
</style>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoCarousel.astro
git commit -m "feat: add VideoCarousel component"
```

---

### Task 8: Create `VideoLinksSection.astro`

**Files:**
- Create: `src/components/VideoLinksSection.astro`

- [ ] **Step 1: Create the component**

```astro
---
import type { VideoLinkView } from '@/lib/video-links';
interface Props {
  links: VideoLinkView[];
  sectionTitle?: string;
}
const { links, sectionTitle = '精選影片' } = Astro.props;
---
{links.length > 0 && (
  <section class="video-links reveal-section">
    <p class="eyebrow">{sectionTitle}</p>
    <ul class="video-links__grid" role="list">
      {links.map((link) => (
        <li>
          <a href={link.url} target="_blank" rel="noopener noreferrer" class="video-links__item">
            <div class="video-links__thumb">
              {link.thumbnailUrl ? (
                <img src={link.thumbnailUrl} alt={link.title} loading="lazy" decoding="async" />
              ) : (
                <div class="video-links__thumb-placeholder">
                  <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M5 3l14 9-14 9V3z" fill="currentColor" /></svg>
                </div>
              )}
              <span class="video-links__play" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="36" height="36"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.5)"/><path d="M10 8l6 4-6 4V8z" fill="#fff" /></svg>
              </span>
            </div>
            {link.title && <p class="video-links__title">{link.title}</p>}
          </a>
        </li>
      ))}
    </ul>
  </section>
)}

<style>
.video-links { margin: var(--section-gap, 4rem) 0; }
.video-links .eyebrow { margin-bottom: 1.5rem; }
.video-links__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
  list-style: none;
  padding: 0; margin: 0;
}
@media (max-width: 640px) {
  .video-links__grid { grid-template-columns: repeat(2, 1fr); }
}
.video-links__item { display: block; text-decoration: none; color: inherit; }
.video-links__thumb {
  position: relative;
  aspect-ratio: 16/9;
  overflow: hidden;
  border-radius: var(--card-radius, 8px);
  background: var(--image-bg, #111);
}
.video-links__thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
.video-links__item:hover .video-links__thumb img { transform: scale(1.04); }
.video-links__thumb-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--muted, #777); }
.video-links__play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.video-links__title { margin-top: 0.5rem; font-size: 0.85rem; font-weight: 500; }
</style>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoLinksSection.astro
git commit -m "feat: add VideoLinksSection component"
```

---

### Task 9: Update `index.astro` — Add Video Sections

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add imports and fetch calls**

In frontmatter:
```ts
import VideoCarousel from '@/components/VideoCarousel.astro';
import VideoLinksSection from '@/components/VideoLinksSection.astro';
import { listVideoLinks } from '@/lib/video-links';
// Add to existing fetches:
const videoLinks = await listVideoLinks();
```

`settings.heroVideos`, `settings.videoSectionEnabled`, `settings.videoSectionPosition`, `settings.videoLinksEnabled`, `settings.videoLinksSectionTitle` are already available via `getSettings()`.

- [ ] **Step 2: Add VideoCarousel in position based on setting**

The homepage template has sections: Hero → (featured) → (sold cases) → Footer.

Structure the video carousel insertion like this:

```astro
{/* After Hero section */}
{settings.videoSectionEnabled && settings.videoSectionPosition === 'below-hero' && settings.heroVideos.length > 0 && (
  <VideoCarousel videos={settings.heroVideos} />
)}

{/* Featured vehicles section ... */}

{settings.videoSectionEnabled && settings.videoSectionPosition === 'below-featured' && settings.heroVideos.length > 0 && (
  <VideoCarousel videos={settings.heroVideos} />
)}

{/* Brand strip, sold cases ... */}

{settings.videoSectionEnabled && settings.videoSectionPosition === 'above-footer' && settings.heroVideos.length > 0 && (
  <VideoCarousel videos={settings.heroVideos} />
)}

{/* VideoLinksSection — always at bottom before footer */}
{settings.videoLinksEnabled && videoLinks.length > 0 && (
  <VideoLinksSection links={videoLinks} sectionTitle={settings.videoLinksSectionTitle} />
)}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: integrate video carousel and video links into homepage"
```

---

### Task 10: Create Sell My Car Page and API

**Files:**
- Create: `src/pages/sell.astro`
- Create: `src/pages/api/sell.ts`

- [ ] **Step 1: Create `src/pages/sell.astro`**

```astro
---
import PublicLayout from '@/layouts/PublicLayout.astro';
import { getSettings } from '@/lib/settings';
const settings = await getSettings();
---
<PublicLayout title={`賣車詢問｜${settings.siteName}`} description="填寫車輛資訊，讓我們為您評估">
  <div class="sell-page">
    <div class="sell-page__header">
      <p class="eyebrow">賣車詢問</p>
      <h1>我想賣車</h1>
      <p>填寫以下資訊，我們會盡快與您聯絡評估。</p>
    </div>

    <form class="sell-form" id="sell-form" enctype="multipart/form-data">
      <div class="form-grid">
        <div class="form-group">
          <label for="contactName">姓名 <span aria-hidden="true">*</span></label>
          <input type="text" id="contactName" name="contactName" required autocomplete="name" />
        </div>
        <div class="form-group">
          <label for="contactInfo">聯絡方式（手機 / LINE）<span aria-hidden="true">*</span></label>
          <input type="text" id="contactInfo" name="contactInfo" required placeholder="09xxxxxxxx 或 LINE ID" />
        </div>
        <div class="form-group">
          <label for="brand">品牌</label>
          <input type="text" id="brand" name="brand" placeholder="例：BMW" />
        </div>
        <div class="form-group">
          <label for="model">型號</label>
          <input type="text" id="model" name="model" placeholder="例：M3" />
        </div>
        <div class="form-group">
          <label for="year">年份</label>
          <input type="number" id="year" name="year" min="1980" max="2030" placeholder="例：2020" />
        </div>
        <div class="form-group">
          <label for="mileage">里程（km）</label>
          <input type="number" id="mileage" name="mileage" min="0" placeholder="例：30000" />
        </div>
        <div class="form-group">
          <label for="exteriorColor">外觀顏色</label>
          <input type="text" id="exteriorColor" name="exteriorColor" placeholder="例：珍珠白" />
        </div>
        <div class="form-group form-group--full">
          <label for="notes">車況描述</label>
          <textarea id="notes" name="notes" rows="4" placeholder="請描述車況、保養記錄、特殊配備等"></textarea>
        </div>
        <div class="form-group form-group--full">
          <label for="photos">照片（可選，最多 10 張）</label>
          <input type="file" id="photos" name="photos" multiple accept="image/jpeg,image/png,image/webp" />
          <small>JPEG / PNG / WebP，單檔最大 12MB</small>
        </div>
        <div class="form-group form-group--full">
          <label class="checkbox-label">
            <input type="checkbox" name="consent" required />
            我同意本站收集並使用上述資訊以便聯絡評估
          </label>
        </div>
      </div>

      <button type="submit" class="btn-primary sell-form__submit">送出詢問</button>
      <p class="sell-form__status" id="sell-status" aria-live="polite"></p>
    </form>
  </div>
</PublicLayout>

<script>
  const form = document.getElementById('sell-form') as HTMLFormElement | null;
  const status = document.getElementById('sell-status');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form) return;
    const submitBtn = form.querySelector<HTMLButtonElement>('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    if (status) status.textContent = '送出中...';

    try {
      const res = await fetch('/api/sell', { method: 'POST', body: new FormData(form) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '送出失敗');
      if (status) status.textContent = '✓ 已收到您的詢問，我們會盡快聯絡您！';
      form.reset();
    } catch (err) {
      if (status) status.textContent = `送出失敗：${(err as Error).message}`;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
</script>

<style>
.sell-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
.sell-page__header { margin-bottom: 2rem; }
.sell-form { }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
@media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
.form-group { display: flex; flex-direction: column; gap: 0.35rem; }
.form-group--full { grid-column: 1 / -1; }
.form-group label { font-size: 0.875rem; font-weight: 600; }
.form-group input, .form-group textarea, .form-group select {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  font-size: 1rem;
  background: var(--input-bg, #fff);
}
.form-group textarea { resize: vertical; }
.checkbox-label { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.875rem; cursor: pointer; }
.sell-form__submit { margin-top: 1.5rem; }
.sell-form__status { margin-top: 0.75rem; font-size: 0.9rem; }
</style>
```

- [ ] **Step 2: Create `src/pages/api/sell.ts`**

First install nodemailer:
```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Then create the endpoint:

```ts
import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createSellInquiry } from '@/lib/sell-inquiries';
import { getSettings } from '@/lib/settings';

// In-memory rate limit: max 5 per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ success: false, error: '請稍後再試' }), { status: 429, headers: { 'content-type': 'application/json' } });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ success: false, error: '請求格式錯誤' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const contactInfo = String(formData.get('contactInfo') || '').trim();
  const contactName = String(formData.get('contactName') || '').trim();
  if (!contactInfo) {
    return new Response(JSON.stringify({ success: false, error: '請填寫聯絡方式' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const brand = String(formData.get('brand') || '').trim();
  const model = String(formData.get('model') || '').trim();
  const yearRaw = Number.parseInt(String(formData.get('year') || ''), 10);
  const year = Number.isFinite(yearRaw) ? yearRaw : null;
  const mileageRaw = Number.parseInt(String(formData.get('mileage') || ''), 10);
  const mileage = Number.isFinite(mileageRaw) ? mileageRaw : null;
  const exteriorColor = String(formData.get('exteriorColor') || '').trim();
  const notes = String(formData.get('notes') || '').trim();

  // Save photos
  const photoUrls: string[] = [];
  const photoFiles = formData.getAll('photos').filter((f) => f instanceof File && f.size > 0) as File[];
  if (photoFiles.length > 0) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const dir = join(process.cwd(), 'data', 'media', 'sell-inquiries', dateStr);
    await mkdir(dir, { recursive: true });
    for (const file of photoFiles.slice(0, 10)) {
      if (file.size > 12 * 1024 * 1024) continue;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await writeFile(join(dir, safeName), Buffer.from(await file.arrayBuffer()));
      photoUrls.push(`/media/sell-inquiries/${dateStr}/${safeName}`);
    }
  }

  await createSellInquiry({ brand, model, year, mileage, exteriorColor, notes, contactInfo, contactName, photoUrls });

  // Send email notification (best-effort)
  const settings = await getSettings();
  if (settings.notificationEmail && settings.smtpHost && settings.smtpUser) {
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: Number.parseInt(settings.smtpPort || '587', 10),
        secure: settings.smtpPort === '465',
        auth: { user: settings.smtpUser, pass: settings.smtpPass },
      });
      await transporter.sendMail({
        from: settings.smtpUser,
        to: settings.notificationEmail,
        subject: `新賣車申請：${[brand, model, year].filter(Boolean).join(' ')}`,
        text: [
          `姓名：${contactName}`,
          `聯絡方式：${contactInfo}`,
          `品牌：${brand}`,
          `型號：${model}`,
          `年份：${year ?? '未填'}`,
          `里程：${mileage ?? '未填'} km`,
          `外觀顏色：${exteriorColor}`,
          `車況說明：${notes}`,
          `附件照片：${photoUrls.length} 張`,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[sell] email notification failed:', err);
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Manual test**

Start dev server. Open `http://localhost:4321/sell`. Fill out the form and submit. Check DB has a new row in `sell_inquiries`. If SMTP is configured, check inbox.

- [ ] **Step 5: Commit**

```bash
git add src/pages/sell.astro src/pages/api/sell.ts package.json package-lock.json
git commit -m "feat: add sell my car page and API endpoint"
```

---

### Task 11: Update `AdminDashboard.svelte` — Video, Sell Inquiries, SMTP

**Files:**
- Modify: `src/components/AdminDashboard.svelte`

- [ ] **Step 1: Add video carousel settings in the Settings tab**

In the Settings section, add a new collapsible block "Banner 影片輪播":

```svelte
<section class="settings-section">
  <h3>Banner 影片輪播</h3>
  <label class="toggle-label">
    <input type="checkbox" bind:checked={settings.videoSectionEnabled} on:change={markDirty} />
    啟用影片輪播區塊
  </label>
  {#if settings.videoSectionEnabled}
    <div class="form-group">
      <label>顯示位置</label>
      <select bind:value={settings.videoSectionPosition} on:change={markDirty}>
        <option value="below-hero">Hero 下方</option>
        <option value="below-featured">精選車輛下方</option>
        <option value="above-footer">頁尾上方</option>
      </select>
    </div>
    <div class="video-list">
      {#each settings.heroVideos as video, i}
        <div class="video-item">
          <input type="text" bind:value={video.url} placeholder="YouTube URL 或 MP4 URL" on:input={markDirty} />
          <select bind:value={video.type} on:change={markDirty}>
            <option value="youtube">YouTube</option>
            <option value="mp4">MP4</option>
          </select>
          <input type="text" bind:value={video.label} placeholder="標題（選填）" on:input={markDirty} />
          <label class="btn-upload-small">
            縮圖
            <input type="file" accept="image/*" style="display:none" on:change={(e) => handleVideoThumbUpload(e, video)} />
          </label>
          {#if video.thumbnailUrl}<img src={video.thumbnailUrl} alt="" width="60" style="object-fit:cover;aspect-ratio:16/9;" />{/if}
          <button type="button" on:click={() => { settings.heroVideos.splice(i, 1); settings.heroVideos = settings.heroVideos; markDirty(); }}>✕</button>
        </div>
      {/each}
      <button type="button" on:click={() => { settings.heroVideos = [...settings.heroVideos, { id: crypto.randomUUID(), url: '', type: 'youtube', thumbnailUrl: '', label: '' }]; markDirty(); }}>＋ 新增影片</button>
    </div>
  {/if}
</section>
```

- [ ] **Step 2: Add IG video links settings section**

```svelte
<section class="settings-section">
  <h3>底部影片連結區</h3>
  <label class="toggle-label">
    <input type="checkbox" bind:checked={settings.videoLinksEnabled} on:change={markDirty} />
    啟用影片連結區塊
  </label>
  {#if settings.videoLinksEnabled}
    <div class="form-group">
      <label>區塊標題</label>
      <input type="text" bind:value={settings.videoLinksSectionTitle} on:input={markDirty} />
    </div>
    <!-- Separate video links management via dedicated API -->
    <p><a href="#video-links-tab">在「影片連結」頁籤管理連結</a></p>
  {/if}
</section>
```

Add a "影片連結" tab/section that uses CRUD for `siteVideoLinks` via a new API endpoint `/api/admin/video-links`:

```svelte
<!-- In the mode === 'video-links' section: -->
<div class="video-links-manager">
  {#each videoLinks as link, i}
    <div class="video-link-item">
      <input type="text" bind:value={link.title} placeholder="標題" on:input={markDirty} />
      <input type="text" bind:value={link.url} placeholder="IG Reel URL / YouTube URL" on:input={markDirty} />
      <label class="btn-upload-small">
        縮圖
        <input type="file" accept="image/*" style="display:none" on:change={(e) => handleVideoLinkThumbUpload(e, link)} />
      </label>
      {#if link.thumbnailUrl}<img src={link.thumbnailUrl} alt="" width="60" style="object-fit:cover;aspect-ratio:16/9;border-radius:4px;" />{/if}
      <button type="button" on:click={() => { videoLinks.splice(i, 1); videoLinks = videoLinks; markDirty(); }}>✕</button>
    </div>
  {/each}
  <button type="button" on:click={() => { videoLinks = [...videoLinks, { id: '', title: '', url: '', thumbnailUrl: null, sortOrder: videoLinks.length }]; markDirty(); }}>＋ 新增連結</button>
  <button type="button" on:click={saveVideoLinks}>儲存影片連結</button>
</div>
```

- [ ] **Step 3: Add API endpoint for video links CRUD**

Create `src/pages/api/admin/video-links.ts`:

```ts
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { setVideoLinks } from '@/lib/video-links';

export const POST: APIRoute = async ({ request, cookies }) => {
  await requireAdmin(cookies);
  const body = await request.json();
  if (!Array.isArray(body)) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
  await setVideoLinks(body);
  return new Response(JSON.stringify({ ok: true }));
};
```

- [ ] **Step 4: Add sell inquiries view**

In overview or a new "賣車申請" section, load and display inquiries:

```svelte
<!-- In the inquiries section: -->
{#if sellInquiries.length === 0}
  <p>尚無申請</p>
{:else}
  <ul class="inquiry-list">
    {#each sellInquiries as inq}
      <li class={`inquiry-item${!inq.readAt ? ' is-unread' : ''}`}>
        <div class="inquiry-header">
          <span class="inquiry-date">{new Date(inq.createdAt).toLocaleDateString('zh-TW')}</span>
          <span class="inquiry-name">{inq.contactName}</span>
          <span class="inquiry-vehicle">{[inq.brand, inq.model, inq.year].filter(Boolean).join(' ')}</span>
          {#if !inq.readAt}<span class="badge badge--new">未讀</span>{/if}
        </div>
        <details>
          <summary>查看詳情</summary>
          <dl>
            <dt>聯絡方式</dt><dd>{inq.contactInfo}</dd>
            <dt>里程</dt><dd>{inq.mileage ?? '—'} km</dd>
            <dt>外觀顏色</dt><dd>{inq.exteriorColor || '—'}</dd>
            <dt>說明</dt><dd>{inq.notes || '—'}</dd>
            {#if inq.photoUrls.length > 0}
              <dt>照片</dt>
              <dd class="inquiry-photos">
                {#each inq.photoUrls as url}<a href={url} target="_blank"><img src={url} alt="" width="80" /></a>{/each}
              </dd>
            {/if}
          </dl>
          {#if !inq.readAt}
            <button type="button" on:click={() => markInquiryRead(inq.id)}>標記為已讀</button>
          {/if}
        </details>
      </li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 5: Add SMTP settings in Settings tab**

```svelte
<section class="settings-section">
  <h3>Email 通知設定</h3>
  <div class="form-group">
    <label>通知信箱</label>
    <input type="email" bind:value={settings.notificationEmail} placeholder="接收賣車通知的 Email" on:input={markDirty} />
  </div>
  <div class="form-grid-2">
    <div class="form-group">
      <label>SMTP Host</label>
      <input type="text" bind:value={settings.smtpHost} placeholder="smtp.gmail.com" on:input={markDirty} />
    </div>
    <div class="form-group">
      <label>SMTP Port</label>
      <input type="text" bind:value={settings.smtpPort} placeholder="587" on:input={markDirty} />
    </div>
    <div class="form-group">
      <label>SMTP 帳號</label>
      <input type="text" bind:value={settings.smtpUser} on:input={markDirty} />
    </div>
    <div class="form-group">
      <label>SMTP 密碼</label>
      <input type="password" bind:value={settings.smtpPass} on:input={markDirty} />
    </div>
  </div>
  <button type="button" on:click={sendTestEmail}>傳送測試信</button>
</section>
```

Add `sendTestEmail` handler:
```ts
async function sendTestEmail() {
  const res = await fetch('/api/admin/test-email', { method: 'POST' });
  const json = await res.json();
  showToast(json.ok ? '測試信已送出' : `失敗：${json.error}`, json.ok ? 'success' : 'error');
}
```

Create `src/pages/api/admin/test-email.ts`:
```ts
import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { requireAdmin } from '@/lib/auth';
import { getSettings } from '@/lib/settings';

export const POST: APIRoute = async ({ cookies }) => {
  await requireAdmin(cookies);
  const settings = await getSettings();
  if (!settings.notificationEmail || !settings.smtpHost) {
    return new Response(JSON.stringify({ ok: false, error: '請先設定 SMTP 和通知信箱' }));
  }
  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number.parseInt(settings.smtpPort || '587', 10),
      secure: settings.smtpPort === '465',
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    });
    await transporter.sendMail({ from: settings.smtpUser, to: settings.notificationEmail, subject: '測試信 — 賣車通知', text: '這是來自您網站的測試通知信。' });
    return new Response(JSON.stringify({ ok: true }));
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }));
  }
};
```

- [ ] **Step 6: Add mark-read API endpoint**

Create `src/pages/api/admin/sell-inquiries/[id]/read.ts`:
```ts
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { markSellInquiryRead } from '@/lib/sell-inquiries';

export const POST: APIRoute = async ({ params, cookies }) => {
  await requireAdminSession(cookies);
  await markSellInquiryRead(params.id!);
  return new Response(JSON.stringify({ ok: true }));
};
```

- [ ] **Step 7: Ensure save functions include new settings keys**

In the AdminDashboard settings save payload, include:
```ts
videoSectionEnabled: settings.videoSectionEnabled,
videoSectionPosition: settings.videoSectionPosition,
heroVideos: JSON.stringify(settings.heroVideos),
videoLinksEnabled: settings.videoLinksEnabled,
videoLinksSectionTitle: settings.videoLinksSectionTitle,
notificationEmail: settings.notificationEmail,
smtpHost: settings.smtpHost,
smtpPort: settings.smtpPort,
smtpUser: settings.smtpUser,
smtpPass: settings.smtpPass,
```

- [ ] **Step 8: Verify build**

```bash
npm run build
```

- [ ] **Step 9: Manual test**

Test each section:
1. Admin → Settings → enable video carousel, add a YouTube URL → save → homepage shows carousel
2. Admin → Video Links → add an IG URL + thumbnail → save → homepage bottom shows video grid
3. Open `/sell`, submit form → Admin shows new unread inquiry
4. Admin → Settings → fill SMTP → "傳送測試信" → check inbox

- [ ] **Step 10: Commit**

```bash
git add src/components/AdminDashboard.svelte src/pages/api/admin/video-links.ts src/pages/api/admin/test-email.ts src/pages/api/admin/sell-inquiries/
git commit -m "feat: add admin UI for video carousel, video links, sell inquiries, and SMTP"
```

---

### Task 12: Add Navigation Links

**Files:**
- Modify: site header/navigation layout files (check `src/layouts/PublicLayout.astro` or similar)

- [ ] **Step 1: Find the navigation template**

```bash
grep -r "href=\"/cars\"" src/layouts/ src/components/
```

- [ ] **Step 2: Add links for sell and compare**

In the navigation component, add:
- `<a href="/sell">賣車詢問</a>`
- A "比較中 (N)" link that appears when the URL has `ids` parameter (handle via client-side JS since the nav is shared)

For the compare nav indicator, add client-side script to the layout:

```html
<script>
  const ids = new URLSearchParams(location.search).get('ids');
  if (ids) {
    const compareCount = ids.split(',').filter(Boolean).length;
    const nav = document.querySelector('.site-nav'); // adjust selector
    if (nav && compareCount > 0) {
      const link = document.createElement('a');
      link.href = `/cars/compare?ids=${ids}`;
      link.textContent = `比較 (${compareCount})`;
      link.className = 'nav-compare-badge';
      nav.appendChild(link);
    }
  }
</script>
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/layouts/ src/components/
git commit -m "feat: add sell and compare navigation links"
```

---

### Task 13: Push

- [ ] **Push all commits**

```bash
git push
```

Expected: CI passes, all commits pushed.
