# Visual Enhancement (Brand Icons + Gallery Modes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add brand icon support to all vehicle display locations and add four selectable photo gallery display modes to the vehicle detail page.

**Architecture:** Brand icons are stored as `iconUrl` on `brandAliases`, propagated through `getBrandAliasMap()` into `VehicleView.brandIconUrl`, and rendered via a shared `BrandIcon.astro` component. Gallery modes are stored as a `galleryMode` site setting; the detail page renders one of four gallery component variants based on this value while keeping the existing lightbox JS untouched.

**Tech Stack:** Astro 5 SSR, Svelte 5, SQLite + Drizzle ORM, TypeScript. Build: `npm run build` (includes `astro check`).

---

## File Map

**New files:**
- `src/db/migrations/0007_brand_icon.sql` — ALTER TABLE
- `src/components/BrandIcon.astro` — shared brand logo renderer
- `src/components/BrandStrip.astro` — homepage brand logo row
- `src/components/gallery/GallerySlider.astro` — full-width slider mode
- `src/components/gallery/GalleryThumbnailStrip.astro` — main image + thumbnail row mode
- `src/components/gallery/GalleryGrid.astro` — all-images grid mode

**Modified files:**
- `src/db/schema.ts` — add `iconUrl` to `brandAliases`
- `src/lib/brand-aliases.ts` — include `iconUrl` in all read/write paths
- `src/lib/vehicles.ts` — add `brandIconUrl` to `VehicleView` and `listPublicBrands`
- `src/lib/settings.ts` — add `galleryMode` to `SiteSettings`
- `src/components/VehicleCard.astro` — brand icon overlay on card image
- `src/pages/index.astro` — add `<BrandStrip>`
- `src/pages/cars/index.astro` — brand icon next to filter sidebar brand names
- `src/pages/cars/[slug].astro` — brand icon in spec section + gallery mode switch
- `src/components/AdminDashboard.svelte` — brand icon upload UI + gallery mode selector

---

### Task 1: DB Migration — Add `iconUrl` to `brandAliases`

**Files:**
- Create: `src/db/migrations/0007_brand_icon.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Create migration file**

```sql
-- src/db/migrations/0007_brand_icon.sql
ALTER TABLE brand_aliases ADD COLUMN icon_url TEXT;
```

- [ ] **Step 2: Update schema.ts — add iconUrl field to brandAliases**

In `src/db/schema.ts`, find the `brandAliases` table and add the new column:

```ts
export const brandAliases = sqliteTable('brand_aliases', {
  sourceBrand: text('source_brand').primaryKey(),
  displayName: text('display_name').notNull(),
  urlSlug: text('url_slug').notNull().default(''),
  iconUrl: text('icon_url'),          // ← add this line
  updatedAt: text('updated_at').notNull(),
});
```

- [ ] **Step 3: Run migration**

```bash
npx tsx src/db/migrate.ts
```

Expected: runs without error, `brand_aliases` table now has `icon_url` column.

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/0007_brand_icon.sql src/db/schema.ts
git commit -m "feat: add iconUrl column to brandAliases"
```

---

### Task 2: Update `brand-aliases.ts` — Propagate `iconUrl`

**Files:**
- Modify: `src/lib/brand-aliases.ts`

- [ ] **Step 1: Update `BrandAliasView` interface**

In `src/lib/brand-aliases.ts`, update the interface:

```ts
export interface BrandAliasView {
  sourceBrand: string;
  displayName: string;
  urlSlug: string;
  iconUrl: string | null;
}
```

- [ ] **Step 2: Update `listBrandAliases()`**

```ts
export async function listBrandAliases(): Promise<BrandAliasView[]> {
  const rows = await db.select().from(brandAliases).orderBy(asc(brandAliases.sourceBrand));
  return rows.map((row) => ({
    sourceBrand: row.sourceBrand,
    displayName: row.displayName,
    urlSlug: row.urlSlug || brandUrlSlug(row.displayName),
    iconUrl: row.iconUrl ?? null,
  }));
}
```

- [ ] **Step 3: Update `getBrandAliasMap()` return type and implementation**

```ts
export async function getBrandAliasMap(): Promise<Map<string, { displayName: string; urlSlug: string; iconUrl: string | null }>> {
  return new Map(
    (await listBrandAliases()).map((row) => [
      row.sourceBrand,
      { displayName: row.displayName, urlSlug: row.urlSlug, iconUrl: row.iconUrl },
    ])
  );
}
```

- [ ] **Step 4: Update `setBrandAliases()` to persist `iconUrl`**

```ts
export async function setBrandAliases(input: BrandAliasView[]) {
  const now = new Date().toISOString();
  await db.delete(brandAliases);
  for (const row of input) {
    const sourceBrand = row.sourceBrand.trim();
    const displayName = row.displayName.trim();
    const urlSlug = brandUrlSlug(row.urlSlug || displayName);
    if (!sourceBrand || !displayName) continue;
    await db.insert(brandAliases).values({
      sourceBrand,
      displayName,
      urlSlug,
      iconUrl: row.iconUrl ?? null,
      updatedAt: now,
    });
  }
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npm run build
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brand-aliases.ts
git commit -m "feat: propagate iconUrl through brand-aliases lib"
```

---

### Task 3: Update `vehicles.ts` — Add `brandIconUrl` to `VehicleView`

**Files:**
- Modify: `src/lib/vehicles.ts`

- [ ] **Step 1: Add `brandIconUrl` to `VehicleView` interface**

In the `VehicleView` interface, add after `brandUrlSlug`:

```ts
brandIconUrl: string | null;
```

- [ ] **Step 2: Update `attachImages()` to populate `brandIconUrl`**

In `attachImages()`, find where `brandAlias` is looked up and update:

```ts
return rows.map((row) => {
  const rowImages = imageMap.get(row.id) || [];
  const brandAlias = brandAliasMap.get(row.brand);
  const brandDisplayName = brandAlias?.displayName || row.brand;
  return {
    // ... all existing fields ...
    brandIconUrl: brandAlias?.iconUrl ?? null,   // ← add this
    // ... rest of fields ...
  };
});
```

- [ ] **Step 3: Update `listPublicBrands()` to return `iconUrl`**

```ts
export async function listPublicBrands(): Promise<{ displayName: string; urlSlug: string; count: number; iconUrl: string | null }[]> {
  const allVehicles = await listPublicInventoryVehicles();
  const countMap = new Map<string, { displayName: string; urlSlug: string; count: number; iconUrl: string | null }>();
  for (const vehicle of allVehicles) {
    if (!vehicle.brandUrlSlug) continue;
    const key = vehicle.brandUrlSlug;
    const current = countMap.get(key) || {
      displayName: vehicle.brandDisplayName,
      urlSlug: vehicle.brandUrlSlug,
      count: 0,
      iconUrl: vehicle.brandIconUrl,
    };
    current.count += 1;
    countMap.set(key, current);
  }
  return [...countMap.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vehicles.ts
git commit -m "feat: add brandIconUrl to VehicleView and listPublicBrands"
```

---

### Task 4: Create `BrandIcon.astro` Component

**Files:**
- Create: `src/components/BrandIcon.astro`

- [ ] **Step 1: Create the component**

```astro
---
interface Props {
  iconUrl: string | null | undefined;
  alt?: string;
  size?: number;
  class?: string;
}
const { iconUrl, alt = '', size = 24, class: className = '' } = Astro.props;
---
{iconUrl && (
  <img
    src={iconUrl}
    alt={alt}
    width={size}
    height={size}
    class={`brand-icon ${className}`.trim()}
    loading="lazy"
    decoding="async"
  />
)}

<style>
.brand-icon {
  display: inline-block;
  object-fit: contain;
  flex-shrink: 0;
}
</style>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BrandIcon.astro
git commit -m "feat: add BrandIcon component"
```

---

### Task 5: Update `VehicleCard.astro` — Brand Icon Overlay

**Files:**
- Modify: `src/components/VehicleCard.astro`

- [ ] **Step 1: Import BrandIcon and add overlay to card media**

At top of frontmatter, add import:
```ts
import BrandIcon from './BrandIcon.astro';
```

In the template, inside `.vehicle-card__media` div, after the `<img>` or placeholder div, add:

```astro
{vehicle.brandIconUrl && (
  <span class="vehicle-card__brand-badge" aria-hidden="true">
    <BrandIcon iconUrl={vehicle.brandIconUrl} alt={vehicle.brandDisplayName} size={32} />
  </span>
)}
```

- [ ] **Step 2: Add CSS for the brand badge**

In the `<style>` section of `VehicleCard.astro`:

```css
.vehicle-card__media {
  position: relative; /* ensure this exists or add it */
}
.vehicle-card__brand-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  padding: 4px;
}
.vehicle-card__brand-badge .brand-icon {
  width: 28px;
  height: 28px;
}
```

- [ ] **Step 3: Verify build and visual check**

```bash
npm run build
```

Start dev server and open a vehicle card. When `brandIconUrl` is set for a brand, the logo appears bottom-right of the card image.

- [ ] **Step 4: Commit**

```bash
git add src/components/VehicleCard.astro
git commit -m "feat: add brand icon overlay to VehicleCard"
```

---

### Task 6: Update `cars/index.astro` — Brand Icon in Filter Sidebar

**Files:**
- Modify: `src/pages/cars/index.astro`

- [ ] **Step 1: Import BrandIcon**

In the frontmatter:
```ts
import BrandIcon from '@/components/BrandIcon.astro';
```

- [ ] **Step 2: Update brand filter list items to show icon**

Find the brand filter list in the template (look for the section rendering `brands` array). Update each brand `<a>` or `<li>` to include BrandIcon:

```astro
{brands.map((brand) => (
  <li>
    <a
      href={`/cars?brand=${brand.urlSlug}`}
      class={`brand-filter-item${activeBrand === brand.urlSlug ? ' is-active' : ''}`}
    >
      <BrandIcon iconUrl={brand.iconUrl} alt="" size={20} class="brand-filter-icon" />
      <span>{brand.displayName}</span>
      <span class="brand-count">{brand.count}</span>
    </a>
  </li>
))}
```

- [ ] **Step 3: Add CSS**

```css
.brand-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-filter-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/cars/index.astro
git commit -m "feat: add brand icons to filter sidebar"
```

---

### Task 7: Update `cars/[slug].astro` — Brand Icon in Spec Section

**Files:**
- Modify: `src/pages/cars/[slug].astro`

- [ ] **Step 1: Import BrandIcon**

```ts
import BrandIcon from '@/components/BrandIcon.astro';
```

- [ ] **Step 2: Find the brand display in the spec section and add icon**

Find where `vehicle.brandDisplayName` is shown in the spec area (usually near the vehicle title or in the spec table). Add:

```astro
<span class="detail-brand">
  <BrandIcon iconUrl={vehicle.brandIconUrl} alt="" size={24} class="detail-brand-icon" />
  {vehicle.brandDisplayName}
</span>
```

- [ ] **Step 3: Add CSS**

```css
.detail-brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.detail-brand-icon {
  width: 24px;
  height: 24px;
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/cars/[slug].astro
git commit -m "feat: add brand icon to vehicle detail page"
```

---

### Task 8: Create `BrandStrip.astro` and Update `index.astro`

**Files:**
- Create: `src/components/BrandStrip.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create BrandStrip.astro**

```astro
---
interface BrandItem {
  displayName: string;
  urlSlug: string;
  iconUrl: string | null;
  count: number;
}
interface Props {
  brands: BrandItem[];
  eyebrow?: string;
}
const { brands, eyebrow = '車系品牌' } = Astro.props;
const brandsWithIcons = brands.filter((b) => b.iconUrl);
if (!brandsWithIcons.length) return;
---
{brandsWithIcons.length > 0 && (
  <section class="brand-strip reveal-section">
    <p class="eyebrow">{eyebrow}</p>
    <ul class="brand-strip__list" role="list">
      {brandsWithIcons.map((brand) => (
        <li>
          <a href={`/cars?brand=${brand.urlSlug}`} class="brand-strip__item">
            <span class="brand-strip__logo">
              <img src={brand.iconUrl!} alt={brand.displayName} width="48" height="48" loading="lazy" />
            </span>
            <span class="brand-strip__name">{brand.displayName}</span>
          </a>
        </li>
      ))}
    </ul>
  </section>
)}

<style>
.brand-strip { margin: var(--section-gap, 4rem) 0; }
.brand-strip .eyebrow { text-align: center; margin-bottom: 1.5rem; }
.brand-strip__list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}
.brand-strip__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: inherit;
  transition: opacity 0.2s;
}
.brand-strip__item:hover { opacity: 0.7; }
.brand-strip__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--card-bg, #fff);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  padding: 8px;
}
.brand-strip__logo img { width: 48px; height: 48px; object-fit: contain; }
.brand-strip__name { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; }
</style>
```

- [ ] **Step 2: Import BrandStrip in index.astro and add `listPublicBrands` call**

In `src/pages/index.astro` frontmatter:
```ts
import BrandStrip from '@/components/BrandStrip.astro';
import { listPublicBrands } from '@/lib/vehicles';
// Add to existing fetches:
const brands = await listPublicBrands();
```

- [ ] **Step 3: Add BrandStrip to template**

After the featured vehicles grid section and before the sold cases section:

```astro
<BrandStrip brands={brands} eyebrow="車系品牌" />
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/BrandStrip.astro src/pages/index.astro
git commit -m "feat: add BrandStrip component to homepage"
```

---

### Task 9: Add `galleryMode` to `SiteSettings`

**Files:**
- Modify: `src/lib/settings.ts`

- [ ] **Step 1: Add `GalleryMode` type and `galleryMode` to `SiteSettings`**

After the existing type imports at the top of settings.ts, add:

```ts
export type GalleryMode = 'lightbox' | 'slider' | 'thumbnail-strip' | 'grid';
```

In the `SiteSettings` interface, add:
```ts
galleryMode: GalleryMode;
```

In `defaults`, add:
```ts
galleryMode: 'lightbox',
```

In `getSettings()`, add to the return object:
```ts
galleryMode: (() => {
  const v = map.get('galleryMode');
  if (v === 'slider' || v === 'thumbnail-strip' || v === 'grid') return v;
  return 'lightbox';
})(),
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/settings.ts
git commit -m "feat: add galleryMode to SiteSettings"
```

---

### Task 10: Create Gallery Mode Components

**Files:**
- Create: `src/components/gallery/GallerySlider.astro`
- Create: `src/components/gallery/GalleryThumbnailStrip.astro`
- Create: `src/components/gallery/GalleryGrid.astro`

All three components receive the same props and emit `data-gallery-index` on every image so the existing lightbox JS in `[slug].astro` works without changes.

- [ ] **Step 1: Create `GallerySlider.astro`**

```astro
---
import type { VehicleImageView } from '@/lib/vehicles';
interface Props {
  images: VehicleImageView[];
  title: string;
  coverImageIndex?: number;
}
const { images, title, coverImageIndex = 0 } = Astro.props;
---
{images.length > 0 && (
  <div class="gallery-slider reveal-section" data-slider>
    <div class="gallery-slider__stage">
      {images.map((image, index) => (
        <button
          class={`gallery-slider__slide${index === coverImageIndex ? ' is-active' : ''}`}
          type="button"
          data-gallery-index={index}
          data-slide={index}
          aria-label={`開啟第 ${index + 1} 張大圖`}
        >
          <img
            src={image.url}
            alt={image.alt || `${title} 圖片 ${index + 1}`}
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchpriority={index === 0 ? 'high' : undefined}
            decoding="async"
          />
        </button>
      ))}
    </div>
    {images.length > 1 && (
      <>
        <button class="gallery-slider__arrow gallery-slider__arrow--prev" type="button" aria-label="上一張" data-slider-prev>‹</button>
        <button class="gallery-slider__arrow gallery-slider__arrow--next" type="button" aria-label="下一張" data-slider-next>›</button>
        <span class="gallery-slider__counter" aria-live="polite" data-slider-counter>{coverImageIndex + 1} / {images.length}</span>
      </>
    )}
  </div>
)}

<script>
  document.querySelectorAll<HTMLElement>('[data-slider]').forEach((slider) => {
    const slides = Array.from(slider.querySelectorAll<HTMLElement>('[data-slide]'));
    const counter = slider.querySelector<HTMLElement>('[data-slider-counter]');
    let current = slides.findIndex((s) => s.classList.contains('is-active'));
    if (current < 0) current = 0;

    const show = (index: number) => {
      slides[current]?.classList.remove('is-active');
      current = (index + slides.length) % slides.length;
      slides[current]?.classList.add('is-active');
      if (counter) counter.textContent = `${current + 1} / ${slides.length}`;
    };

    slider.querySelector('[data-slider-prev]')?.addEventListener('click', () => show(current - 1));
    slider.querySelector('[data-slider-next]')?.addEventListener('click', () => show(current + 1));
  });
</script>

<style>
.gallery-slider { position: relative; width: 100%; }
.gallery-slider__stage { position: relative; aspect-ratio: 16/9; overflow: hidden; background: var(--image-bg, #111); border-radius: var(--card-radius, 8px); }
.gallery-slider__slide { display: none; width: 100%; height: 100%; border: 0; padding: 0; background: none; cursor: zoom-in; }
.gallery-slider__slide.is-active { display: block; }
.gallery-slider__slide img { width: 100%; height: 100%; object-fit: cover; }
.gallery-slider__arrow {
  position: absolute; top: 50%; transform: translateY(-50%);
  background: rgba(0,0,0,0.5); color: #fff; border: 0;
  font-size: 2rem; line-height: 1; padding: 0.25em 0.5em;
  cursor: pointer; border-radius: 4px; z-index: 2;
}
.gallery-slider__arrow--prev { left: 1rem; }
.gallery-slider__arrow--next { right: 1rem; }
.gallery-slider__counter { position: absolute; bottom: 1rem; right: 1rem; background: rgba(0,0,0,0.5); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
</style>
```

- [ ] **Step 2: Create `GalleryThumbnailStrip.astro`**

```astro
---
import type { VehicleImageView } from '@/lib/vehicles';
interface Props {
  images: VehicleImageView[];
  title: string;
  coverImageIndex?: number;
}
const { images, title, coverImageIndex = 0 } = Astro.props;
---
{images.length > 0 && (
  <div class="gallery-strip reveal-section" data-strip>
    <button
      class="gallery-strip__main"
      type="button"
      data-gallery-index={coverImageIndex}
      data-strip-main
      aria-label="開啟封面大圖"
    >
      <img
        src={images[coverImageIndex]?.url || images[0].url}
        alt={images[coverImageIndex]?.alt || `${title} 封面照`}
        fetchpriority="high"
        decoding="async"
      />
    </button>
    {images.length > 1 && (
      <div class="gallery-strip__thumbs" role="list" aria-label="縮圖列表">
        {images.map((image, index) => (
          <button
            class={`gallery-strip__thumb${index === coverImageIndex ? ' is-active' : ''}`}
            type="button"
            data-gallery-index={index}
            data-strip-thumb={index}
            role="listitem"
            aria-label={`查看第 ${index + 1} 張`}
          >
            <img src={image.url} alt={image.alt || `${title} 第 ${index + 1} 張`} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
    )}
  </div>
)}

<script>
  document.querySelectorAll<HTMLElement>('[data-strip]').forEach((strip) => {
    const main = strip.querySelector<HTMLButtonElement>('[data-strip-main]');
    const mainImg = main?.querySelector('img');
    const thumbs = Array.from(strip.querySelectorAll<HTMLButtonElement>('[data-strip-thumb]'));
    let active = thumbs.findIndex((t) => t.classList.contains('is-active'));
    if (active < 0) active = 0;

    thumbs.forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        thumbs[active]?.classList.remove('is-active');
        active = i;
        thumb.classList.add('is-active');
        if (mainImg && thumb.querySelector('img')?.src) {
          mainImg.src = thumb.querySelector('img')!.src;
          mainImg.alt = thumb.querySelector('img')!.alt;
        }
        if (main) main.dataset.galleryIndex = String(i);
      });
    });
  });
</script>

<style>
.gallery-strip { display: flex; flex-direction: column; gap: 0.75rem; }
.gallery-strip__main { display: block; width: 100%; aspect-ratio: 16/9; overflow: hidden; background: var(--image-bg, #111); border-radius: var(--card-radius, 8px); border: 0; padding: 0; cursor: zoom-in; }
.gallery-strip__main img { width: 100%; height: 100%; object-fit: cover; }
.gallery-strip__thumbs { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.gallery-strip__thumb { flex-shrink: 0; width: 100px; aspect-ratio: 16/9; overflow: hidden; border-radius: 4px; border: 2px solid transparent; padding: 0; background: none; cursor: pointer; transition: border-color 0.15s; }
.gallery-strip__thumb.is-active, .gallery-strip__thumb:hover { border-color: var(--accent, #0066cc); }
.gallery-strip__thumb img { width: 100%; height: 100%; object-fit: cover; }
</style>
```

- [ ] **Step 3: Create `GalleryGrid.astro`**

```astro
---
import type { VehicleImageView } from '@/lib/vehicles';
interface Props {
  images: VehicleImageView[];
  title: string;
}
const { images, title } = Astro.props;
---
{images.length > 0 && (
  <section class="gallery-grid reveal-section" aria-label="車輛照片">
    <p class="gallery-grid__count eyebrow">共 {images.length} 張</p>
    <div class="gallery-grid__list">
      {images.map((image, index) => (
        <button
          class="gallery-grid__item"
          type="button"
          data-gallery-index={index}
          aria-label={`開啟第 ${index + 1} 張大圖`}
        >
          <img
            src={image.url}
            alt={image.alt || `${title} 圖片 ${index + 1} / ${images.length}`}
            loading={index < 6 ? 'eager' : 'lazy'}
            decoding="async"
          />
          <span class="gallery-grid__zoom" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" stroke-width="2" fill="none" /></svg>
          </span>
        </button>
      ))}
    </div>
  </section>
)}

<style>
.gallery-grid__count { margin-bottom: 1rem; }
.gallery-grid__list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
@media (max-width: 640px) {
  .gallery-grid__list { grid-template-columns: repeat(2, 1fr); }
}
.gallery-grid__item { position: relative; aspect-ratio: 4/3; overflow: hidden; border-radius: 4px; border: 0; padding: 0; background: var(--image-bg, #111); cursor: zoom-in; }
.gallery-grid__item img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
.gallery-grid__item:hover img { transform: scale(1.04); }
.gallery-grid__zoom { position: absolute; bottom: 6px; right: 6px; color: #fff; opacity: 0.8; }
</style>
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/gallery/
git commit -m "feat: add gallery mode components (slider, thumbnail-strip, grid)"
```

---

### Task 11: Update `cars/[slug].astro` — Gallery Mode Switch

**Files:**
- Modify: `src/pages/cars/[slug].astro`

- [ ] **Step 1: Import gallery components and read `galleryMode` from settings**

In frontmatter, add imports:
```ts
import GallerySlider from '@/components/gallery/GallerySlider.astro';
import GalleryThumbnailStrip from '@/components/gallery/GalleryThumbnailStrip.astro';
import GalleryGrid from '@/components/gallery/GalleryGrid.astro';
```

`settings.galleryMode` is already available via `const settings = await getSettings()`.

- [ ] **Step 2: Replace the cover + gallery section with a mode switch**

Find the section in the template that contains `detail-cover` and the `gallery` section. Replace them with:

```astro
{settings.galleryMode === 'slider' ? (
  <GallerySlider images={vehicle.images} title={vehicle.title} coverImageIndex={coverImageIndex} />
) : settings.galleryMode === 'thumbnail-strip' ? (
  <GalleryThumbnailStrip images={vehicle.images} title={vehicle.title} coverImageIndex={coverImageIndex} />
) : settings.galleryMode === 'grid' ? (
  <>
    {vehicle.coverImage && (
      <button class="detail-cover" type="button" data-gallery-index={coverImageIndex} aria-label="開啟封面大圖">
        <img src={vehicle.coverImage.url} alt={vehicle.coverImage.alt || `${vehicle.title} 封面照`} fetchpriority="high" decoding="async" />
      </button>
    )}
    <GalleryGrid images={vehicle.images} title={vehicle.title} />
  </>
) : (
  <>
    {/* default lightbox mode — existing markup unchanged */}
    {vehicle.coverImage ? (
      <button class="detail-cover" type="button" data-gallery-index={coverImageIndex} aria-label="開啟封面大圖">
        <img src={vehicle.coverImage.url} alt={vehicle.coverImage.alt || `${vehicle.title} 封面照`} fetchpriority="high" decoding="async" />
      </button>
    ) : (
      <div class="detail-cover"></div>
    )}
    {vehicle.images.length > 0 && (
      <div class="gallery-header reveal-section">
        <span>車輛實拍</span>
        <span>共 {vehicle.images.length} 張</span>
      </div>
    )}
    <section class="gallery reveal-section">
      {vehicle.images.map((image, index) => (
        <button class="gallery-item" type="button" data-gallery-index={index} aria-label={`開啟第 ${index + 1} 張大圖`}>
          <img src={image.url} alt={image.alt || `${vehicle.title} 圖片 ${index + 1} / ${vehicle.images.length}`} loading="lazy" decoding="async" />
          <span class="gallery-item__zoom" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" stroke-width="2" fill="none" /></svg>
          </span>
          <span class="gallery-item__index" aria-hidden="true">{index + 1} / {vehicle.images.length}</span>
        </button>
      ))}
    </section>
  </>
)}
```

The lightbox `<div>` and `<script>` blocks remain unchanged below this section — they work with all modes via `data-gallery-index`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Visual check**

Start dev server (`npm run dev`), open a vehicle detail page. Default mode is `lightbox` — should look identical to before. Test changing `galleryMode` in DB to `thumbnail-strip` and verify the main image + thumbnail row renders correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/cars/[slug].astro
git commit -m "feat: add gallery mode switch to vehicle detail page"
```

---

### Task 12: Update `AdminDashboard.svelte` — Brand Icon Upload + Gallery Mode Selector

**Files:**
- Modify: `src/components/AdminDashboard.svelte`

- [ ] **Step 1: Add brand icon upload to the brand aliases section**

In the brand aliases table/list in the Svelte component, for each brand row add:

```svelte
<!-- After the displayName and urlSlug inputs, add: -->
<div class="brand-icon-upload">
  {#if alias.iconUrl}
    <img src={alias.iconUrl} alt={alias.displayName} width="32" height="32" style="object-fit:contain;border-radius:50%;background:#fff;" />
    <button type="button" on:click={() => { alias.iconUrl = null; markDirty(); }} class="btn-icon-remove" title="移除圖示">✕</button>
  {:else}
    <label class="btn-upload-icon">
      圖示
      <input type="file" accept="image/*" style="display:none" on:change={(e) => handleBrandIconUpload(e, alias)} />
    </label>
  {/if}
</div>
```

- [ ] **Step 2: Add `handleBrandIconUpload` handler in the script section**

```ts
async function handleBrandIconUpload(e: Event, alias: { sourceBrand: string; displayName: string; urlSlug: string; iconUrl: string | null }) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('files', file);
  const res = await fetch('/api/admin/media', { method: 'POST', body: formData });
  if (!res.ok) { showToast('上傳失敗', 'error'); return; }
  const json = await res.json();
  alias.iconUrl = json.urls?.[0] ?? null;
  markDirty();
}
```

- [ ] **Step 3: Ensure `iconUrl` is included in brand alias save payload**

When the brand aliases are saved (find the existing save function that calls `/api/admin/brand-aliases`), ensure the payload includes `iconUrl`:

```ts
const payload = brandAliases.map((a) => ({
  sourceBrand: a.sourceBrand,
  displayName: a.displayName,
  urlSlug: a.urlSlug,
  iconUrl: a.iconUrl ?? null,
}));
```

- [ ] **Step 4: Update the brand aliases API handler to persist `iconUrl`**

In `src/pages/api/admin/brand-aliases.ts`, update the existing handler to pass `iconUrl` through. The file currently maps `sourceBrand, displayName, urlSlug`. Add `iconUrl`:

```ts
await setBrandAliases(
  body.aliases.map((item: Record<string, unknown>) => ({
    sourceBrand: String(item.sourceBrand || ''),
    displayName: String(item.displayName || ''),
    urlSlug: String(item.urlSlug || ''),
    iconUrl: typeof item.iconUrl === 'string' && item.iconUrl ? item.iconUrl : null,
  })),
);
```

- [ ] **Step 5: Add gallery mode selector to the settings section**

In the settings section of `AdminDashboard.svelte`, add a radio/select for gallery mode:

```svelte
<fieldset>
  <legend>照片展示模式</legend>
  {#each [
    { value: 'lightbox', label: '展開式 Lightbox（預設）', desc: '點擊縮圖開啟全屏大圖' },
    { value: 'slider', label: '全寬輪播 Slider', desc: '左右箭頭切換，一次一張' },
    { value: 'thumbnail-strip', label: '主圖 + 縮圖列', desc: '參考 vipmotors.ae' },
    { value: 'grid', label: '瀑布格 Grid', desc: '所有照片同時展示' },
  ] as mode}
    <label class="radio-option">
      <input type="radio" name="galleryMode" value={mode.value} bind:group={settings.galleryMode} on:change={markDirty} />
      <span>
        <strong>{mode.label}</strong>
        <small>{mode.desc}</small>
      </span>
    </label>
  {/each}
</fieldset>
```

Ensure `settings.galleryMode` is included in the settings save payload:
```ts
galleryMode: settings.galleryMode || 'lightbox',
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Manual test**

Start dev server. Go to Admin → Settings → confirm gallery mode selector renders and saves. Go to Admin → Brand Aliases → confirm icon upload button appears, upload a PNG logo, verify it saves and shows as a preview. Browse to homepage and vehicle cards to confirm icons appear.

- [ ] **Step 8: Commit**

```bash
git add src/components/AdminDashboard.svelte src/pages/api/admin/brand-aliases.ts
git commit -m "feat: add brand icon upload and gallery mode selector to admin"
```

---

### Task 13: Push

- [ ] **Push all commits**

```bash
git push
```

Expected: CI passes, all commits pushed.
