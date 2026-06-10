# Analytics Dashboard — Design Spec

**Date:** 2026-06-10  
**Status:** Approved (inline — user directive: 直接完成)

---

## Goal

Add two analytics dashboards to the admin backend:

1. **Admin dashboard** — ROI-focused metrics so the dealership client can see whether their investment is paying off (visitors, what they viewed, actions taken).
2. **Superadmin dashboard** — Operational metrics: system errors, slow requests, admin activity log, bot traffic.

---

## Data Storage

All analytics data is stored in the existing SQLite database via two new Drizzle tables.

### `page_views`

Tracks every public page request (server-side, via Astro middleware).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| path | TEXT | e.g. `/cars/bmw-530i` |
| vehicle_slug | TEXT nullable | populated for `/cars/:slug` pages |
| session_id | TEXT | 24h cookie UUID, set server-side |
| ip_hash | TEXT | SHA-256(IP + YYYY-MM-DD daily salt), privacy-safe |
| device_type | TEXT | `mobile` / `tablet` / `desktop` |
| referrer | TEXT nullable | HTTP Referer header, origin only |
| status_code | INTEGER | HTTP response code |
| duration_ms | INTEGER nullable | server response time |
| is_bot | INTEGER | 1 if known bot UA |
| created_at | TEXT | ISO timestamp |

Retention: 90 days. Auto-pruned at app startup.

### `admin_activity_log`

Tracks admin actions for auditing (superadmin only).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| user_id | TEXT | references admin_users |
| username | TEXT | denormalized for display |
| action | TEXT | e.g. `login`, `vehicle_status_change`, `settings_update` |
| target_type | TEXT nullable | `vehicle`, `brand`, `settings`, etc. |
| target_id | TEXT nullable | |
| details_json | TEXT | extra context as JSON |
| ip_hash | TEXT | same hash as page_views |
| created_at | TEXT | ISO timestamp |

Retention: 180 days.

---

## Tracking Mechanism

**Server-side only.** Astro middleware (`src/middleware.ts`) intercepts all public page requests:
- Filters: only `GET` requests for public routes (`/`, `/cars/*`, `/about`, `/sell`, `/contact`, `/price-doc`)
- Excludes: admin routes, API routes, media routes, static assets
- Sets a `car_site_session` cookie (24h TTL, httpOnly) as the session ID
- Hashes IP as SHA-256(IP + date-string) using Node crypto — no raw IP stored
- Detects bot from User-Agent string
- Records response time via `Date.now()` diff

---

## Permissions

New bit added to the permissions system:

```
ANALYTICS: 0x2000
```

ALL updated from `0x1FFF` → `0x3FFF`.

A superadmin can see all metrics including the activity log. A regular admin with `ANALYTICS` permission can see the client-facing ROI metrics only.

---

## Admin Dashboard (`/admin/analytics`)

Metrics shown to admin role (client ROI view):

- **本月瀏覽** — total page views this month
- **本月訪客** — unique session_ids this month
- **賣車申請** — count this month vs last month (from existing `sell_inquiries` table)
- **人氣車款 Top 10** — vehicle_slug → view count, last 30 days
- **30 天趨勢** — SVG bar chart (daily views), pure Svelte, no external library
- **裝置分布** — mobile / tablet / desktop breakdown

---

## Superadmin Extensions (visible when `role === 'superadmin'`)

Additional panels below the standard admin view:

- **系統錯誤** — 4xx / 5xx count today and this week
- **慢速請求** — responses > 2000ms count today
- **機器人流量** — bot view count this week
- **來源分析** — top 10 referrers last 30 days
- **管理員操作記錄** — paginated table of admin_activity_log, last 50 entries

---

## Files Changed

| File | Action |
|------|--------|
| `src/db/migrations/0011_analytics.sql` | New migration |
| `src/db/schema.ts` | Add pageViews, adminActivityLog tables |
| `src/db/migrate.ts` | Add 90/180-day cleanup on startup |
| `src/lib/permissions.ts` | Add ANALYTICS bit, update ALL |
| `src/lib/analytics.ts` | All query functions |
| `src/middleware.ts` | New — intercept public requests, log page_views |
| `src/pages/api/admin/analytics.ts` | New — API endpoint for dashboard data |
| `src/pages/admin/analytics.astro` | New — analytics page |
| `src/components/AdminAnalytics.svelte` | New — Svelte dashboard component |
| `src/layouts/AdminLayout.astro` | Add analytics nav link |

Admin activity logging calls added to:
- `src/pages/api/admin/login.ts`
- `src/pages/api/admin/vehicles/[id]/status.ts`
- `src/pages/api/admin/settings.ts`
- `src/pages/api/admin/users/index.ts`

---

## Data Retention Cleanup

At app startup (`src/db/migrate.ts`), run:
- DELETE FROM page_views WHERE created_at < (now - 90 days)
- DELETE FROM admin_activity_log WHERE created_at < (now - 180 days)
