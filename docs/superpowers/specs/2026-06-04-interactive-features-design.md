# Spec 2 — 互動功能：車輛比較 + 影片系列 + 賣車申請

**Date:** 2026-06-04  
**Status:** Approved  
**References:** hankbentleyrr.com compare-list, vipmotors.ae trade-in form, Instagram reel thumbnails

---

## Overview

Four new interactive features:
1. Vehicle comparison page (URL-parameter-based, unlimited vehicles)
2. Homepage video carousel + configurable position
3. Bottom video links section (Instagram reel thumbnails)
4. Sell my car inquiry form (public-facing, with optional photo upload)

---

## Feature 1: Vehicle Comparison

### Approach

No new DB table needed. Comparison state lives entirely in the URL:
- `/cars/compare?ids=slug-a,slug-b,slug-c`
- Shareable, bookmarkable, no session required

### New Page: `src/pages/cars/compare.astro`

**Layout:**
- Page title: "車輛比較"
- Horizontal columns, one per vehicle (no maximum enforced server-side)
- Mobile: horizontal scroll
- Each column contains:
  - Cover image (aspect 4:3)
  - Brand icon + brand name
  - Vehicle title (links to detail page)
  - "移除" button (removes this slug from URL, re-navigates)
  - Spec rows: year, mileage, condition, body type, fuel, exterior color, interior color, seats/doors, cylinders, horsepower, price (if set)
- "繼續加入車輛" button → navigates to `/cars`
- "清除全部" button → navigates to `/cars/compare` (empty)

**Empty state:**
- Message: "尚未選擇任何車輛"
- CTA button: "瀏覽庫存"

### Add-to-Compare on VehicleCard

`VehicleCard.astro` receives optional `compareIds: string[]` prop (current compared slugs from URL).

- Show "＋ 比較" button below the share button
- If vehicle slug is in `compareIds`: button shows "已加入 ✓", clicking removes it
- Clicking "＋ 比較": navigates to `/cars/compare?ids=<existing>,<new-slug>` or `/cars/compare?ids=<slug>` if none yet

On `/cars/index.astro` and `index.astro`, read `?compare[]=...` params and pass down to cards.

### Navigation Badge

Add "比較中 (N)" link in site header when `ids` param is present.

---

## Feature 2: Homepage Video Carousel

### Database Changes

New keys in `siteSettings`:
```
heroVideos          JSON  -- array of video objects
videoSectionEnabled BOOL  -- default false
videoSectionPosition TEXT -- 'below-hero' | 'below-featured' | 'above-footer'
```

Video object schema:
```json
{
  "id": "uuid",
  "url": "https://...",
  "type": "youtube | mp4",
  "thumbnailUrl": "/media/uploads/.../thumb.jpg",
  "label": "選填標題"
}
```

### New Component: `src/components/VideoCarousel.astro`

- Input: `videos[]`, `autoplay?: boolean`
- YouTube URL → extract video ID → `<iframe>` embed with `?autoplay=0&mute=1`
- mp4 URL → `<video controls preload="none" poster=thumbnailUrl>`
- Carousel: horizontal, left/right arrow buttons, keyboard navigation
- Thumbnail strip below player (click to jump to video)
- Mobile: swipe gesture support

### Admin UI

In `AdminDashboard.svelte` settings, new "Banner 影片" section:
- Toggle: videoSectionEnabled
- Position selector: videoSectionPosition (3 options)
- Video list: add/edit/remove/reorder
  - Per entry: URL input, type radio (YouTube/mp4), thumbnail upload, label input
- Drag-to-reorder

### Integration in `index.astro`

Render `<VideoCarousel>` at position determined by `videoSectionPosition` setting:
- `below-hero`: immediately after Hero section
- `below-featured`: after Featured Vehicles grid
- `above-footer`: just before Footer

Only renders when `videoSectionEnabled = true` and `heroVideos` is non-empty.

---

## Feature 3: Bottom Video Links Section (IG Reels)

### Database Changes

New table `siteVideoLinks`:
```sql
CREATE TABLE siteVideoLinks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnailUrl TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
```

Migration: `0008_video_links.sql`

New key in `siteSettings`:
- `videoLinksEnabled: boolean` (default false)
- `videoLinksSectionTitle: text` (default '精選影片')

### Thumbnail Fetching

When Admin saves a video link with a URL but no thumbnail:
1. Server attempts `og:image` fetch from the URL (server-side, 3s timeout)
2. If successful, download and store to `/media/uploads/video-thumbs/`
3. If failed, `thumbnailUrl` remains null (show placeholder)

Manual upload always wins over auto-fetch.

### New Component: `src/components/VideoLinksSection.astro`

- Input: `links[]`, `sectionTitle`
- Grid: 3-col desktop, 2-col mobile, 1-col small mobile
- Each cell: thumbnail image (16:9, object-cover) + title overlay or below
- Clicking: opens URL in new tab
- Play icon overlay on thumbnail

### Integration

Add `<VideoLinksSection>` near the bottom of `index.astro`, only when `videoLinksEnabled = true` and table has rows.

### Admin UI

In `AdminDashboard.svelte` settings, new "影片連結" section:
- Toggle: videoLinksEnabled
- Section title input
- Video links list: add/edit/remove/reorder
  - Per entry: title, URL, thumbnail (upload or auto-fetch from URL)
- Drag-to-reorder

---

## Feature 4: Sell My Car (賣車申請)

### New Public Page: `src/pages/sell.astro`

**Form fields:**
- 品牌 (brand) — text input
- 型號 (model) — text input
- 年份 (year) — number input
- 里程 (mileage, km) — number input
- 外觀顏色 (exterior color) — text input
- 車況描述 (condition/notes) — textarea
- 聯絡方式 (contact: phone or LINE) — text input
- 姓名 (name) — text input
- 照片上傳 (photos) — file input, multiple, optional, max 10 files, 12MB each, JPEG/PNG/WebP
- 隱私同意 checkbox — required

**Behavior:**
- Client-side validation before submit
- Submit to `POST /api/sell`
- On success: show thank-you message inline, do not redirect
- On failure: show error message

### New API Endpoint: `src/pages/api/sell.ts`

**Method:** POST, public (no auth)

**Processing:**
1. Parse form data (multipart for photo uploads)
2. Validate required fields
3. Save uploaded photos to `data/media/sell-inquiries/{date}/`
4. Save inquiry to new DB table `sellInquiries`
5. Send notification email if `notificationEmail` is configured in siteSettings (see below)
6. Return 200 JSON `{ success: true }`

**Rate limiting:** max 5 submissions per IP per hour (in-memory counter, reset on restart)

### Email Notification

New keys in `siteSettings`:
- `notificationEmail: text` — the address to send notifications to (nullable; if empty, no email sent)
- `smtpHost: text`, `smtpPort: text`, `smtpUser: text`, `smtpPass: text` — SMTP credentials

On new sell inquiry submission:
1. If `notificationEmail` is not set: skip silently
2. Compose email: subject "新賣車申請：{brand} {model} {year}", body lists all form fields + photo count
3. Send via configured SMTP; log failure to console but do not fail the API response (best-effort)

Admin UI: new "通知設定" subsection in settings:
- Notification email input
- SMTP host/port/user/password inputs
- "傳送測試信" button (sends test email to configured address)

### Database Changes

New table `sellInquiries`:
```sql
CREATE TABLE sellInquiries (
  id TEXT PRIMARY KEY,
  brand TEXT,
  model TEXT,
  year INTEGER,
  mileage INTEGER,
  exteriorColor TEXT,
  notes TEXT,
  contactInfo TEXT NOT NULL,
  contactName TEXT,
  photoUrls TEXT,   -- JSON array of file paths
  createdAt TEXT NOT NULL,
  readAt TEXT       -- null = unread
);
```

Migration: `0009_sell_inquiries.sql`

### Admin: Sell Inquiries List

In `AdminDashboard.svelte`, new "賣車申請" tab/section (overview mode):
- List all inquiries, newest first
- Each row: date, name, brand/model/year, contact info, photo count, read/unread indicator
- Click to expand: full details + photo thumbnails
- Mark as read button
- No delete (keep for records)

### Navigation

- Add "賣車詢問" link to public site header/footer
- Admin dashboard overview shows unread count badge

---

## Component/File Summary

New files:
- `src/db/migrations/0008_video_links.sql`
- `src/db/migrations/0009_sell_inquiries.sql`
- `src/pages/cars/compare.astro`
- `src/pages/sell.astro`
- `src/pages/api/sell.ts`
- `src/components/VideoCarousel.astro`
- `src/components/VideoLinksSection.astro`

Modified files:
- `src/db/schema.ts` — add siteVideoLinks, sellInquiries tables
- `src/components/VehicleCard.astro` — add compare button
- `src/pages/cars/index.astro` — pass compareIds to cards
- `src/pages/index.astro` — add VideoCarousel, VideoLinksSection
- `src/components/AdminDashboard.svelte` — video carousel settings, video links management, sell inquiries tab

---

## Error Handling

- Compare page with invalid slugs: silently skip unknown slugs, show valid ones
- Video carousel: if YouTube embed fails (blocked), show thumbnail + link fallback
- Video link og:image fetch timeout: proceed without thumbnail, show placeholder
- Sell form upload failure: save inquiry without photos, note error in response
- Rate limit exceeded: return 429 with message "請稍後再試"

---

## Out of Scope

- Email notification on new sell inquiry (future: can add SMTP later)
- Admin reply to inquiries
- Sell inquiry status workflow (pending/contacted/closed)
- Video carousel autoplay with sound
- Per-vehicle comparison permalink with pre-selected vehicles embedded in card
