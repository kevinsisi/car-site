# Spec 1 — 視覺強化：品牌 Icon + 照片展示模式

**Date:** 2026-06-04  
**Status:** Approved  
**References:** vipmotors.ae photo gallery, hankbentleyrr.com brand logo display

---

## Overview

Enhance the site's visual presentation with two features:
1. Brand icon/logo system across all vehicle display locations
2. Four selectable photo gallery display modes for vehicle detail pages

---

## Feature 1: Brand Icon System

### Database Changes

Migration: `0007_brand_icon.sql`

```sql
ALTER TABLE brandAliases ADD COLUMN iconUrl TEXT;
```

### Admin UI (`AdminDashboard.svelte` — brand aliases section)

- Each brand alias row gains an "Upload Icon" button
- Uses existing `/api/admin/media` endpoint, stores returned URL in `iconUrl`
- Preview thumbnail shown after upload (32×32px)
- Clear/remove icon button

### Display Locations

Brand icons are shown everywhere a brand name appears:

| Location | Implementation |
|----------|----------------|
| `VehicleCard.astro` | Brand logo overlaid bottom-right of image (32×32px, white circle bg, drop shadow) |
| Homepage brand strip (new) | Horizontal row of brand logos + names, each links to `/cars?brand=<slug>` |
| `cars/index.astro` filter sidebar | Brand name with 20×20px logo to the left |
| `cars/[slug].astro` spec section | Brand name with 24×24px logo inline |
| Compare page (`/cars/compare`) | Per-vehicle column header includes brand logo |

### Fallback

If `iconUrl` is null for a brand, display nothing (no broken image, no placeholder).

### Homepage Brand Strip

New section in `index.astro` between featured vehicles grid and any other sections:
- Eyebrow: "車系品牌 BRANDS"  
- Horizontal flex/scroll row, each item: circular logo (48px) + brand name below
- Only shows brands with `iconUrl` set and at least one published vehicle
- Clicking a brand navigates to `/cars?brand=<urlSlug>`

---

## Feature 2: Photo Gallery Display Modes

### Database Changes

New key in `siteSettings`:
- `key: 'galleryMode'`, `value: 'lightbox' | 'slider' | 'thumbnail-strip' | 'grid'`
- Default: `'lightbox'` (preserves existing behavior)

### Mode Descriptions

| Mode | Behavior | Reference |
|------|----------|-----------|
| `lightbox` | Existing: images shown as cover + expandable gallery, click opens fullscreen lightbox | Current behavior |
| `slider` | Full-width single-image carousel with left/right arrow navigation; click opens lightbox | Standard |
| `thumbnail-strip` | Large main image (16:9) + horizontal scrollable thumbnail row below; clicking thumbnail updates main image; click main image opens lightbox | vipmotors.ae |
| `grid` | Equal-size grid of all images (3-col desktop, 2-col mobile); click any image opens lightbox | Instagram-style |

### Implementation in `cars/[slug].astro`

- Read `galleryMode` from site settings at render time
- Conditionally render one of four gallery markup blocks
- All modes: lightbox functionality retained (click → fullscreen)
- `thumbnail-strip` and `slider` replace the current cover + expandable gallery structure at the top of the detail page
- `grid` renders below the vehicle info section, replacing the current gallery

### Admin UI (`admin/settings`)

- New "照片展示模式" radio/select in the "外觀設定" section
- Options: 展開式 Lightbox (預設) | 全寬輪播 Slider | 主圖 + 縮圖列 | 瀑布格 Grid
- Live description text under each option

---

## Component Breakdown

New/modified files:
- `src/db/migrations/0007_brand_icon.sql` — ALTER TABLE
- `src/components/BrandIcon.astro` — reusable brand icon component (props: brand slug, size)
- `src/components/gallery/GallerySlider.astro` — slider mode
- `src/components/gallery/GalleryThumbnailStrip.astro` — thumbnail-strip mode  
- `src/components/gallery/GalleryGrid.astro` — grid mode
- `src/components/BrandStrip.astro` — homepage brand strip section
- `src/components/VehicleCard.astro` — add brand icon overlay
- `src/pages/cars/[slug].astro` — switch gallery component by mode
- `src/pages/index.astro` — add BrandStrip
- `src/pages/cars/index.astro` — add brand icons to filter sidebar
- `src/components/AdminDashboard.svelte` — brand icon upload + gallery mode setting

---

## Error Handling

- Failed icon upload: show error toast, do not update `iconUrl`
- Missing `iconUrl`: silently omit icon (no fallback image)
- Invalid `galleryMode` value in DB: default to `'lightbox'`

---

## Out of Scope

- Per-vehicle gallery mode override (site-wide setting only)
- Animated transitions between gallery slides (basic only)
- Brand icon CDN or automatic logo fetching
