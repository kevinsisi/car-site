# Superadmin Feature Bitmask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 8 separate boolean feature settings with a two-layer bitmask system — `featureMask` (admin-controlled) AND `featureLicenseMask` (superadmin-only) — so every public page button and nav item is gated by the effective mask with zero UI changes outside the admin panel.

**Architecture:** A new `src/lib/features.ts` defines 8 named bit constants and `hasFeature(mask, bit)`. `resolveFrontFeatures()` computes `effectiveMask = featureLicenseMask & featureMask` and maps each bit to the existing `FrontFeatures` interface — all public pages remain untouched. A one-time migration on first request converts old boolean settings to `featureMask`. The settings API protects `featureLicenseMask` behind a superadmin role check.

**Tech Stack:** Astro 5 SSR, Svelte 5 (SettingsLayout) / Svelte 4 (Videos), Drizzle ORM + SQLite, Playwright for E2E tests.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/features.ts` | CREATE | 8 bit constants, `hasFeature()`, `DEFAULT_FEATURE_MASK`, `ALL_FEATURES_MASK` |
| `src/lib/migrate-features.ts` | CREATE | One-time idempotent migration: old boolean keys → `featureMask` |
| `src/lib/settings.ts` | MODIFY | Remove 8 boolean fields; add `featureMask` + `featureLicenseMask` (integer) |
| `src/lib/front-features.ts` | MODIFY | `resolveFrontFeatures()` uses AND of both masks |
| `src/middleware.ts` | MODIFY | Call `migrateFeatures()` once on first request (Promise caching) |
| `src/pages/api/admin/settings.ts` | MODIFY | Handle `featureMask` (any admin) + `featureLicenseMask` (superadmin only → 403) |
| `src/pages/api/admin/video-settings.ts` | MODIFY | Remove `videoSectionEnabled`/`videoLinksEnabled` — now in `featureMask` |
| `src/pages/api/sell.ts` | MODIFY | Gate POST on `FEATURE_SELL_INQUIRY` bit |
| `src/components/admin/SettingsLayout.svelte` | MODIFY | Bitmask checkboxes with lock UI; superadmin license section |
| `src/pages/admin/settings/layout.astro` | MODIFY | Pass `isSuperadmin` prop to `SettingsLayout` |
| `src/components/admin/Videos.svelte` | MODIFY | Remove `videoSectionEnabled`/`videoLinksEnabled` local state and UI |

---

## Task 1: Create `src/lib/features.ts`

**Files:**
- Create: `src/lib/features.ts`

- [ ] **Step 1: Create the file**

```ts
export const FEATURE_COMPARE        = 1 << 0; // 1
export const FEATURE_SELL_INQUIRY   = 1 << 1; // 2
export const FEATURE_CONTACT_PAGE   = 1 << 2; // 4
export const FEATURE_ABOUT_PAGE     = 1 << 3; // 8
export const FEATURE_SOCIAL_ICONS   = 1 << 4; // 16
export const FEATURE_DIRECT_CONTACT = 1 << 5; // 32
export const FEATURE_HERO_VIDEOS    = 1 << 6; // 64
export const FEATURE_VIDEO_LINKS    = 1 << 7; // 128

/** Bits 0-5 on (first 6 features), bits 6-7 off (videos default disabled) */
export const DEFAULT_FEATURE_MASK   = 0b00111111; // 63

/** All 8 bits on — full license */
export const ALL_FEATURES_MASK      = 0b11111111; // 255

export function hasFeature(mask: number, bit: number): boolean {
  return (mask & bit) !== 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/features.ts
git commit -m "feat: add feature bitmask constants and hasFeature helper"
```

---

## Task 2: Update `src/lib/settings.ts`

**Files:**
- Modify: `src/lib/settings.ts`

- [ ] **Step 1: Add import at top of file**

After the existing imports, add:
```ts
import { DEFAULT_FEATURE_MASK, ALL_FEATURES_MASK } from './features';
```

- [ ] **Step 2: Update `SiteSettings` interface**

Remove these 8 fields from the interface (lines ~129-139):
```ts
videoSectionEnabled: boolean;
videoLinksEnabled: boolean;
featureCompareEnabled: boolean;
featureSellInquiryEnabled: boolean;
featureContactPageEnabled: boolean;
featureAboutPageEnabled: boolean;
featureSocialIconsEnabled: boolean;
featureDirectContactEnabled: boolean;
```

Add these 2 fields in their place (after `videoLinksSectionTitle`):
```ts
featureMask: number;
featureLicenseMask: number;
```

- [ ] **Step 3: Update `defaults` object**

Remove from defaults:
```ts
featureCompareEnabled: true,
featureSellInquiryEnabled: true,
featureContactPageEnabled: true,
featureAboutPageEnabled: true,
featureSocialIconsEnabled: true,
featureDirectContactEnabled: true,
videoSectionEnabled: false,
videoLinksEnabled: false,
```

Add in their place:
```ts
featureMask: DEFAULT_FEATURE_MASK,
featureLicenseMask: ALL_FEATURES_MASK,
```

- [ ] **Step 4: Update `getSettings()` return value**

Remove these lines from the return object (inside `getSettings()`):
```ts
videoSectionEnabled: map.get('videoSectionEnabled') === 'true',
videoLinksEnabled: map.get('videoLinksEnabled') === 'true',
featureCompareEnabled: map.get('featureCompareEnabled') !== 'false',
featureSellInquiryEnabled: map.get('featureSellInquiryEnabled') !== 'false',
featureContactPageEnabled: map.get('featureContactPageEnabled') !== 'false',
featureAboutPageEnabled: map.get('featureAboutPageEnabled') !== 'false',
featureSocialIconsEnabled: map.get('featureSocialIconsEnabled') !== 'false',
featureDirectContactEnabled: map.get('featureDirectContactEnabled') !== 'false',
```

Add in their place:
```ts
featureMask: (() => {
  const raw = Number.parseInt(map.get('featureMask') ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_FEATURE_MASK;
})(),
featureLicenseMask: (() => {
  const raw = Number.parseInt(map.get('featureLicenseMask') ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : ALL_FEATURES_MASK;
})(),
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts
git commit -m "feat: replace boolean feature settings with featureMask and featureLicenseMask"
```

---

## Task 3: Update `src/lib/front-features.ts`

**Files:**
- Modify: `src/lib/front-features.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import type { SiteSettings } from './settings';
import {
  hasFeature,
  FEATURE_COMPARE, FEATURE_SELL_INQUIRY, FEATURE_CONTACT_PAGE,
  FEATURE_ABOUT_PAGE, FEATURE_SOCIAL_ICONS, FEATURE_DIRECT_CONTACT,
  FEATURE_HERO_VIDEOS, FEATURE_VIDEO_LINKS,
  DEFAULT_FEATURE_MASK, ALL_FEATURES_MASK,
} from './features';

export interface FrontFeatures {
  compare: boolean;
  sellInquiry: boolean;
  contactPage: boolean;
  aboutPage: boolean;
  socialIcons: boolean;
  directContact: boolean;
  heroVideos: boolean;
  videoLinks: boolean;
}

export interface PublicNavItem {
  href: string;
  label: string;
  activeMatch: string;
}

export function resolveFrontFeatures(settings: SiteSettings): FrontFeatures {
  const license = settings.featureLicenseMask ?? ALL_FEATURES_MASK;
  const admin   = settings.featureMask ?? DEFAULT_FEATURE_MASK;
  const mask    = license & admin;
  return {
    compare:       hasFeature(mask, FEATURE_COMPARE),
    sellInquiry:   hasFeature(mask, FEATURE_SELL_INQUIRY),
    contactPage:   hasFeature(mask, FEATURE_CONTACT_PAGE),
    aboutPage:     hasFeature(mask, FEATURE_ABOUT_PAGE),
    socialIcons:   hasFeature(mask, FEATURE_SOCIAL_ICONS),
    directContact: hasFeature(mask, FEATURE_DIRECT_CONTACT),
    heroVideos:    hasFeature(mask, FEATURE_HERO_VIDEOS),
    videoLinks:    hasFeature(mask, FEATURE_VIDEO_LINKS),
  };
}

export function getPublicNavItems(features: FrontFeatures): PublicNavItem[] {
  return [
    { href: '/', label: '新進車輛', activeMatch: '/' },
    { href: '/cars', label: '全部車輛與找車', activeMatch: '/cars' },
    ...(features.sellInquiry ? [{ href: '/sell', label: '賣車詢問', activeMatch: '/sell' }] : []),
    ...(features.aboutPage ? [{ href: '/about', label: '關於', activeMatch: '/about' }] : []),
    ...(features.contactPage ? [{ href: '/contact', label: '聯絡', activeMatch: '/contact' }] : []),
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/front-features.ts
git commit -m "feat: resolveFrontFeatures uses bitmask AND of license and admin masks"
```

---

## Task 4: Create migration + hook into middleware

**Files:**
- Create: `src/lib/migrate-features.ts`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Create `src/lib/migrate-features.ts`**

```ts
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/connection';
import { siteSettings } from '@/db/schema';
import {
  FEATURE_COMPARE, FEATURE_SELL_INQUIRY, FEATURE_CONTACT_PAGE,
  FEATURE_ABOUT_PAGE, FEATURE_SOCIAL_ICONS, FEATURE_DIRECT_CONTACT,
  FEATURE_HERO_VIDEOS, FEATURE_VIDEO_LINKS,
  DEFAULT_FEATURE_MASK, ALL_FEATURES_MASK,
} from './features';

const OLD_KEYS = [
  'featureCompareEnabled',
  'featureSellInquiryEnabled',
  'featureContactPageEnabled',
  'featureAboutPageEnabled',
  'featureSocialIconsEnabled',
  'featureDirectContactEnabled',
  'videoSectionEnabled',
  'videoLinksEnabled',
] as const;

const KEY_TO_BIT: Record<string, number> = {
  featureCompareEnabled:       FEATURE_COMPARE,
  featureSellInquiryEnabled:   FEATURE_SELL_INQUIRY,
  featureContactPageEnabled:   FEATURE_CONTACT_PAGE,
  featureAboutPageEnabled:     FEATURE_ABOUT_PAGE,
  featureSocialIconsEnabled:   FEATURE_SOCIAL_ICONS,
  featureDirectContactEnabled: FEATURE_DIRECT_CONTACT,
  videoSectionEnabled:         FEATURE_HERO_VIDEOS,
  videoLinksEnabled:           FEATURE_VIDEO_LINKS,
};

export async function migrateFeatures(): Promise<void> {
  // Idempotent: skip if already migrated
  const existing = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, 'featureMask'))
    .limit(1);
  if (existing.length > 0) return;

  // Read old boolean keys
  const rows = await db
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, [...OLD_KEYS]));
  const map = new Map(rows.map((r) => [r.key, r.value]));

  // Compute featureMask from old values
  // Start with DEFAULT_FEATURE_MASK (bits 0-5 on, 6-7 off)
  // Override per stored value: 'true' → set bit, 'false' → clear bit
  let mask = DEFAULT_FEATURE_MASK;
  for (const [key, bit] of Object.entries(KEY_TO_BIT)) {
    if (!map.has(key)) continue;
    if (map.get(key) === 'true') {
      mask = mask | bit;
    } else if (map.get(key) === 'false') {
      mask = mask & ~bit;
    }
  }

  const now = new Date().toISOString();
  await db
    .insert(siteSettings)
    .values({ key: 'featureMask', value: String(mask), updatedAt: now });
  await db
    .insert(siteSettings)
    .values({ key: 'featureLicenseMask', value: String(ALL_FEATURES_MASK), updatedAt: now });

  // Remove old boolean keys
  await db
    .delete(siteSettings)
    .where(inArray(siteSettings.key, [...OLD_KEYS]));
}
```

- [ ] **Step 2: Update `src/middleware.ts`**

Add import after existing imports:
```ts
import { migrateFeatures } from '@/lib/migrate-features';
```

Add module-level variable before `onRequest`:
```ts
let migrationPromise: Promise<void> | null = null;
```

Add at the START of the `onRequest` handler body (before the `sameHostPost` check):
```ts
if (!migrationPromise) {
  migrationPromise = migrateFeatures();
}
await migrationPromise;
```

Full updated `middleware.ts` for reference:
```ts
import { eq } from 'drizzle-orm';
import { defineMiddleware } from 'astro:middleware';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { verifyPassword } from '@/lib/crypto';
import { migrateFeatures } from '@/lib/migrate-features';

const sameHostPost = (request: Request) => {
  if (request.method !== 'POST') return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const FORCE_CHANGE_ALLOWLIST = ['/admin/account', '/admin/login', '/api/admin/change-password', '/api/admin/logout'];

let migrationPromise: Promise<void> | null = null;

export const onRequest = defineMiddleware(async (context, next) => {
  if (!migrationPromise) {
    migrationPromise = migrateFeatures();
  }
  await migrationPromise;

  if (context.url.pathname.startsWith('/api/admin/') && !sameHostPost(context.request)) {
    return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
  }
  context.locals.admin = (await getSession(context.cookies)) || undefined;

  if (context.locals.admin && context.url.pathname.startsWith('/admin')) {
    const allowed = FORCE_CHANGE_ALLOWLIST.some((p) => context.url.pathname === p || context.url.pathname.startsWith(p + '/'));
    if (!allowed) {
      const user = (await db.select().from(adminUsers).where(eq(adminUsers.id, context.locals.admin.id)).limit(1))[0];
      if (user && verifyPassword('change-me-now', user.passwordHash)) {
        return context.redirect('/admin/account?force=1');
      }
    }
  }

  return next();
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/migrate-features.ts src/middleware.ts
git commit -m "feat: migrate boolean feature settings to featureMask on first request"
```

---

## Task 5: Update settings API

**Files:**
- Modify: `src/pages/api/admin/settings.ts`

- [ ] **Step 1: Remove old feature boolean handlers**

Remove these 6 lines (around lines 67-72):
```ts
if (hasOwn(body, 'featureCompareEnabled')) updates.featureCompareEnabled = body.featureCompareEnabled === true;
if (hasOwn(body, 'featureSellInquiryEnabled')) updates.featureSellInquiryEnabled = body.featureSellInquiryEnabled === true;
if (hasOwn(body, 'featureContactPageEnabled')) updates.featureContactPageEnabled = body.featureContactPageEnabled === true;
if (hasOwn(body, 'featureAboutPageEnabled')) updates.featureAboutPageEnabled = body.featureAboutPageEnabled === true;
if (hasOwn(body, 'featureSocialIconsEnabled')) updates.featureSocialIconsEnabled = body.featureSocialIconsEnabled === true;
if (hasOwn(body, 'featureDirectContactEnabled')) updates.featureDirectContactEnabled = body.featureDirectContactEnabled === true;
```

- [ ] **Step 2: Add new mask handlers**

In their place, add:
```ts
if (hasOwn(body, 'featureMask')) {
  const n = Number.parseInt(String(body.featureMask ?? ''), 10);
  if (Number.isFinite(n) && n >= 0 && n <= 255) updates.featureMask = n;
}
if (hasOwn(body, 'featureLicenseMask')) {
  if (user.role !== 'superadmin') {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const n = Number.parseInt(String(body.featureLicenseMask ?? ''), 10);
  if (Number.isFinite(n) && n >= 0 && n <= 255) updates.featureLicenseMask = n;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/settings.ts
git commit -m "feat: settings API handles featureMask and superadmin-only featureLicenseMask"
```

---

## Task 6: Update video-settings API

**Files:**
- Modify: `src/pages/api/admin/video-settings.ts`

- [ ] **Step 1: Remove `videoSectionEnabled` and `videoLinksEnabled` handling from POST**

Remove these two lines from the POST handler:
```ts
if (typeof body.videoSectionEnabled === 'boolean') updates.videoSectionEnabled = body.videoSectionEnabled;
if (typeof body.videoLinksEnabled === 'boolean') updates.videoLinksEnabled = body.videoLinksEnabled;
```

- [ ] **Step 2: Remove them from the GET response**

In the GET handler, remove `videoSectionEnabled` and `videoLinksEnabled` from the returned object:
```ts
// Before
return Response.json({
  heroVideos: settings.heroVideos,
  videoSectionEnabled: settings.videoSectionEnabled,
  videoSectionPosition: settings.videoSectionPosition,
  videoLinksEnabled: settings.videoLinksEnabled,
  videoLinksSectionTitle: settings.videoLinksSectionTitle,
});

// After
return Response.json({
  heroVideos: settings.heroVideos,
  videoSectionPosition: settings.videoSectionPosition,
  videoLinksSectionTitle: settings.videoLinksSectionTitle,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/video-settings.ts
git commit -m "feat: remove videoSectionEnabled/videoLinksEnabled from video-settings API"
```

---

## Task 7: Gate sell API on feature bit

**Files:**
- Modify: `src/pages/api/sell.ts`

- [ ] **Step 1: Add imports at top of file**

Add after existing imports:
```ts
import { hasFeature, FEATURE_SELL_INQUIRY } from '@/lib/features';
```

- [ ] **Step 2: Move `getSettings()` call to top of POST handler and add feature check**

Currently `getSettings()` is called near the bottom (line ~85). Move it to the top and add the feature gate right after the rate limit check. Replace:

```ts
export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ success: false, error: '請稍後再試' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }
```

With:
```ts
export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ success: false, error: '請稍後再試' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }

  const settings = await getSettings();
  if (!hasFeature(settings.featureLicenseMask & settings.featureMask, FEATURE_SELL_INQUIRY)) {
    return new Response(JSON.stringify({ success: false, error: '此功能目前未開放' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
```

- [ ] **Step 3: Remove the duplicate `getSettings()` call lower in the function**

Find and remove the line near the bottom of the handler:
```ts
const settings = await getSettings();
```
(The variable is now declared at the top — keep using `settings` for the email notification below, which already references it.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/sell.ts
git commit -m "feat: gate sell inquiry API on FEATURE_SELL_INQUIRY bit"
```

---

## Task 8: Update SettingsLayout.svelte + layout.astro

**Files:**
- Modify: `src/components/admin/SettingsLayout.svelte`
- Modify: `src/pages/admin/settings/layout.astro`

- [ ] **Step 1: Add `isSuperadmin` prop to SettingsLayout**

In `SettingsLayout.svelte`, update the `Props` interface and destructuring (lines 6-10):

```ts
interface Props {
  settings: SiteSettings;
  isSuperadmin: boolean;
}

let { settings, isSuperadmin }: Props = $props();
```

- [ ] **Step 2: Add imports**

Add to the existing imports in the `<script>` block:
```ts
import {
  FEATURE_COMPARE, FEATURE_SELL_INQUIRY, FEATURE_CONTACT_PAGE,
  FEATURE_ABOUT_PAGE, FEATURE_SOCIAL_ICONS, FEATURE_DIRECT_CONTACT,
  FEATURE_HERO_VIDEOS, FEATURE_VIDEO_LINKS, ALL_FEATURES_MASK,
} from '@/lib/features';
```

- [ ] **Step 3: Update form state — remove 6 boolean fields, add featureMask**

In the `let form = $state({...})` block, remove these 6 fields:
```ts
featureCompareEnabled: settings.featureCompareEnabled,
featureSellInquiryEnabled: settings.featureSellInquiryEnabled,
featureContactPageEnabled: settings.featureContactPageEnabled,
featureAboutPageEnabled: settings.featureAboutPageEnabled,
featureSocialIconsEnabled: settings.featureSocialIconsEnabled,
featureDirectContactEnabled: settings.featureDirectContactEnabled,
```

Add in their place:
```ts
featureMask: settings.featureMask,
```

- [ ] **Step 4: Add license mask state + helpers after existing $state declarations**

After `let formDirty = $derived(...)`, add:
```ts
let licenseMask = $state(settings.featureLicenseMask);
let licenseOriginal = $state(settings.featureLicenseMask);
let licenseDirty = $derived(licenseMask !== licenseOriginal);

const FEATURE_LIST = [
  { bit: FEATURE_COMPARE,        label: '顯示比車功能（車卡比較按鈕、浮動比車列、比較頁新增車輛）' },
  { bit: FEATURE_SELL_INQUIRY,   label: '顯示賣車詢問入口與線上表單' },
  { bit: FEATURE_CONTACT_PAGE,   label: '顯示聯絡頁入口' },
  { bit: FEATURE_ABOUT_PAGE,     label: '顯示關於頁入口' },
  { bit: FEATURE_SOCIAL_ICONS,   label: '顯示社群 icon（Instagram、Facebook、Threads、TikTok）' },
  { bit: FEATURE_DIRECT_CONTACT, label: '顯示直接聯絡（LINE、電話、行動快速列）' },
  { bit: FEATURE_HERO_VIDEOS,    label: '顯示 Hero 影片區' },
  { bit: FEATURE_VIDEO_LINKS,    label: '顯示影片連結區' },
] as const;

function hasBit(mask: number, bit: number): boolean {
  return (mask & bit) !== 0;
}

function toggleBit(mask: number, bit: number, on: boolean): number {
  return on ? mask | bit : mask & ~bit;
}

async function saveLicenseMask(): Promise<void> {
  const tid = notifyProgress('儲存授權設定...');
  const response = await adminFetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ featureLicenseMask: licenseMask }),
  });
  if (response.ok) {
    licenseOriginal = licenseMask;
    updateToast(tid, '授權設定已更新', 'success');
  } else {
    updateToast(tid, '授權設定更新失敗', 'error');
  }
}
```

- [ ] **Step 5: Replace the "前台功能開關" section in the HTML**

Replace the existing `<details class="settings-section">` block that contains `<summary>前台功能開關</summary>` (lines 322-333) with:

```svelte
<details class="settings-section">
  <summary>前台功能開關</summary>
  <div class="settings-section__body">
    <p class="form-hint">控制公開網站要顯示哪些入口與互動功能。關閉後不會讓頁面 404，只會讓相關入口、按鈕或表單依情境收起。鎖頭圖示表示該功能未在此方案中授權。</p>
    {#each FEATURE_LIST as f}
      {@const licensed = hasBit(licenseMask, f.bit)}
      <label class="checkbox-row">
        <input
          type="checkbox"
          disabled={!licensed}
          checked={licensed && hasBit(form.featureMask, f.bit)}
          onchange={(e) => { form.featureMask = toggleBit(form.featureMask, f.bit, (e.currentTarget as HTMLInputElement).checked); }}
        />
        {f.label}
        {#if !licensed}<span style="margin-left:.4em;opacity:.55" title="此功能未在您的方案中啟用">🔒</span>{/if}
      </label>
    {/each}
  </div>
</details>

{#if isSuperadmin}
<details class="settings-section">
  <summary>授權管理（Superadmin）</summary>
  <div class="settings-section__body">
    <p class="form-hint">控制此客戶可使用哪些功能。已關閉的功能，admin 無法在上方功能開關中啟用。儲存後立即生效。</p>
    {#each FEATURE_LIST as f}
      <label class="checkbox-row">
        <input
          type="checkbox"
          checked={hasBit(licenseMask, f.bit)}
          onchange={(e) => { licenseMask = toggleBit(licenseMask, f.bit, (e.currentTarget as HTMLInputElement).checked); }}
        />
        {f.label}
      </label>
    {/each}
    <div style="margin-top:1rem">
      <button
        class="admin-button"
        type="button"
        disabled={!licenseDirty}
        onclick={saveLicenseMask}
      >儲存授權設定</button>
    </div>
  </div>
</details>
{/if}
```

- [ ] **Step 6: Update `layout.astro` to pass `isSuperadmin`**

In `src/pages/admin/settings/layout.astro`, change:
```astro
<SettingsLayout client:load settings={settings} />
```
To:
```astro
<SettingsLayout client:load settings={settings} isSuperadmin={user.role === 'superadmin'} />
```

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/SettingsLayout.svelte src/pages/admin/settings/layout.astro
git commit -m "feat: bitmask feature toggles in SettingsLayout with superadmin license section"
```

---

## Task 9: Update Videos.svelte

**Files:**
- Modify: `src/components/admin/Videos.svelte`

- [ ] **Step 1: Remove local state for video feature flags**

Remove these two lines from the `<script>` block:
```ts
let videoSectionEnabled = settings.videoSectionEnabled ?? false;
// line 11

let videoLinksEnabled = settings.videoLinksEnabled ?? false;
// line 20
```

- [ ] **Step 2: Remove from saveCarousel POST body**

In `saveCarousel()`, change:
```ts
body: JSON.stringify({ videoSectionEnabled, videoSectionPosition, heroVideos: JSON.stringify(heroVideos) }),
```
To:
```ts
body: JSON.stringify({ videoSectionPosition, heroVideos: JSON.stringify(heroVideos) }),
```

- [ ] **Step 3: Remove from saveLinks POST body**

Find the save call for links (around line 140). Change:
```ts
body: JSON.stringify({ videoLinksEnabled, videoLinksSectionTitle }),
```
To:
```ts
body: JSON.stringify({ videoLinksSectionTitle }),
```

- [ ] **Step 4: Remove videoSectionEnabled checkbox and unwrap the conditional block**

In the HTML, remove this checkbox div (lines 164-168):
```svelte
<div class="form-group" style="margin-bottom:1rem">
  <label class="checkbox-row">
    <input type="checkbox" bind:checked={videoSectionEnabled} on:change={() => (carouselDirty = true)} />
    啟用影片輪播區塊
  </label>
</div>
```

Then remove the `{#if videoSectionEnabled}` line (line 170) and its closing `{/if}` (line 207), keeping all the content between them. The video list and position selector are always visible.

- [ ] **Step 5: Remove videoLinksEnabled checkbox**

Remove this label (lines 221-224):
```svelte
<label class="checkbox-row">
  <input type="checkbox" bind:checked={videoLinksEnabled} on:change={() => (linksDirty = true)} />
  啟用底部影片連結區塊
</label>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/Videos.svelte
git commit -m "feat: remove video enable/disable from Videos admin, now controlled via feature mask"
```

---

## Task 10: Build check + smoke test

**Files:** None (verification only)

- [ ] **Step 1: TypeScript build check**

```bash
npm run build
```

Expected: Build completes without TypeScript errors. Fix any type errors before continuing.

- [ ] **Step 2: Start dev server and run Playwright smoke tests**

In one terminal:
```bash
npm run dev
```

In another terminal:
```bash
npx playwright test tests/site.spec.ts --project=chromium
```

Expected: All existing tests pass. The "導覽列有「賣車詢問」連結" test should still pass (feature is on by default via `DEFAULT_FEATURE_MASK = 63`).

- [ ] **Step 3: Manually verify admin feature toggle UI**

Start dev server if not running, then:
1. Go to `http://localhost:4321/admin/settings/layout`
2. Log in as admin
3. Verify "前台功能開關" section shows 8 checkboxes (including 2 video ones)
4. Verify non-superadmin does NOT see "授權管理（Superadmin）" section

- [ ] **Step 4: Manually verify superadmin license section**

1. In SQLite, set a user's role to `superadmin` (or use setup if available)
2. Log in as superadmin
3. Go to `/admin/settings/layout`
4. Verify "授權管理（Superadmin）" section is visible
5. Uncheck one feature in the license section → click "儲存授權設定"
6. Verify the corresponding checkbox in "前台功能開關" becomes disabled with 🔒

- [ ] **Step 5: Push**

```bash
git push
```
