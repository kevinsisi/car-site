# Admin 重設計 + 權限系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the admin interface with a responsive sidebar layout and add a bitmask permission system with superadmin role, first-run setup page, and user management.

**Architecture:** Permission bits are stored as an INTEGER on `adminUsers`. The existing `auth.ts` is extended to return `role` + `permissions` from session. `AdminLayout.astro` renders permission-filtered sidebar items. `AdminDashboard.svelte` is split: vehicle management stays, new focused Svelte components handle brands, videos, sell inquiries, and settings sub-sections.

**Tech Stack:** Astro 5 SSR, Svelte 5, SQLite + Drizzle ORM, TypeScript. Build: `npm run build`.

**Must run before Plan 1 and Plan 2.**

---

## File Map

**New files:**
- `src/db/migrations/0010_admin_permissions.sql`
- `src/lib/permissions.ts` — bitmask constants + helpers
- `src/pages/admin/setup.astro`
- `src/pages/admin/users.astro`
- `src/pages/admin/brands.astro`
- `src/pages/admin/videos.astro`
- `src/pages/admin/sell-inquiries.astro`
- `src/pages/admin/settings/basic.astro`
- `src/pages/admin/settings/layout.astro`
- `src/pages/admin/settings/gallery.astro`
- `src/pages/admin/settings/smtp.astro`
- `src/components/admin/Brands.svelte`
- `src/components/admin/Videos.svelte`
- `src/components/admin/SellInquiries.svelte`
- `src/components/admin/SettingsBasic.svelte`
- `src/components/admin/SettingsLayout.svelte`
- `src/components/admin/SettingsGallery.svelte`
- `src/components/admin/SettingsSmtp.svelte`
- `src/components/admin/Users.svelte`
- `src/pages/api/admin/users/index.ts`
- `src/pages/api/admin/users/[id].ts`

**Modified files:**
- `src/db/schema.ts` — add `role`, `permissions` to `adminUsers`
- `src/lib/auth.ts` — extend `getSession`, add `requirePermission`
- `src/layouts/AdminLayout.astro` — permission-filtered sidebar, mobile hamburger
- `src/pages/admin/index.astro` — pass user to layout
- `src/pages/admin/vehicles.astro` — permission check + pass user
- `src/pages/admin/settings.astro` — redirect to `/admin/settings/basic`
- `src/pages/admin/account.astro` — pass user to layout
- `src/pages/api/admin/vehicles.ts` — add permission check
- `src/pages/api/admin/vehicles/[id]/status.ts` — add permission check
- `src/pages/api/admin/settings.ts` — split permission checks
- `src/pages/api/admin/brand-aliases.ts` — add permission check
- `src/pages/api/admin/media.ts` — keep requireAdmin

---

### Task 1: DB Migration + Schema

**Files:**
- Create: `src/db/migrations/0010_admin_permissions.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Create migration**

```sql
-- src/db/migrations/0010_admin_permissions.sql
ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE admin_users ADD COLUMN permissions INTEGER NOT NULL DEFAULT 0;
UPDATE admin_users
SET role = 'superadmin', permissions = 8191
WHERE id = (SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1);
```

- [ ] **Step 2: Update `src/db/schema.ts` — add fields to adminUsers**

```ts
export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  permissions: integer('permissions').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
```

- [ ] **Step 3: Run migration**

```bash
npx tsx src/db/migrate.ts
```

Expected: no error.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/0010_admin_permissions.sql src/db/schema.ts
git commit -m "feat: add role and permissions to adminUsers"
```

---

### Task 2: Create `src/lib/permissions.ts`

**Files:**
- Create: `src/lib/permissions.ts`

- [ ] **Step 1: Create the constants file**

```ts
export const PERMISSIONS = {
  VEHICLES_VIEW:     0x0001,
  VEHICLES_EDIT:     0x0002,
  BRANDS_VIEW:       0x0004,
  BRANDS_ICON:       0x0008,
  VIDEOS_CAROUSEL:   0x0010,
  VIDEOS_LINKS:      0x0020,
  SELL_INQUIRIES:    0x0040,
  SETTINGS_BASIC:    0x0080,
  SETTINGS_LAYOUT:   0x0100,
  SETTINGS_GALLERY:  0x0200,
  SETTINGS_SMTP:     0x0400,
  USERS_MANAGE:      0x0800,
  IMPORT_API:        0x1000,
  ALL:               0x1FFF,
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function hasPermission(userPermissions: number, required: number): boolean {
  return (userPermissions & required) === required;
}

export function isSuperAdmin(role: string): boolean {
  return role === 'superadmin';
}

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  VEHICLES_VIEW:    '車輛管理 — 檢視',
  VEHICLES_EDIT:    '車輛管理 — 編輯/新增/刪除',
  BRANDS_VIEW:      '品牌管理 — 檢視',
  BRANDS_ICON:      '品牌管理 — 上傳圖示',
  VIDEOS_CAROUSEL:  '影片輪播設定',
  VIDEOS_LINKS:     '影片連結管理',
  SELL_INQUIRIES:   '賣車申請 — 查看',
  SETTINGS_BASIC:   '設定 — 基本資訊',
  SETTINGS_LAYOUT:  '設定 — 版型樣式',
  SETTINGS_GALLERY: '設定 — 照片展示模式',
  SETTINGS_SMTP:    '設定 — SMTP 通知',
  USERS_MANAGE:     '用戶管理',
  IMPORT_API:       '外部 API 匯入',
  ALL:              '全部權限',
};
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat: add permissions constants and helpers"
```

---

### Task 3: Update `src/lib/auth.ts` — Permission-aware Session

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add `AdminUserSession` type and update `getSession`**

Add the interface and update the DB query to include `role` and `permissions`:

```ts
import { PERMISSIONS, hasPermission } from './permissions';

export interface AdminUserSession {
  id: string;
  username: string;
  role: string;
  permissions: number;
}

export async function getSession(cookies: AstroCookies): Promise<AdminUserSession | null> {
  const signed = cookies.get(ADMIN_COOKIE)?.value;
  if (!signed) return null;
  const sessionId = verifySignedSession(signed);
  if (!sessionId) return null;
  const rows = await db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      role: adminUsers.role,
      permissions: adminUsers.permissions,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.id, sessionId), gt(adminSessions.expiresAt, new Date().toISOString())))
    .limit(1);
  return rows[0] || null;
}
```

- [ ] **Step 2: Update `requireAdmin` and add `requirePermission`**

```ts
export async function requireAdmin(cookies: AstroCookies): Promise<AdminUserSession> {
  const user = await getSession(cookies);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  return user;
}

export async function requirePermission(cookies: AstroCookies, required: number): Promise<AdminUserSession> {
  const user = await requireAdmin(cookies);
  if (user.role !== 'superadmin' && !hasPermission(user.permissions, required)) {
    throw new Response('Forbidden', { status: 403 });
  }
  return user;
}
```

- [ ] **Step 3: Add `hasAnyUsers` helper (for setup page)**

```ts
export async function hasAnyUsers(): Promise<boolean> {
  const rows = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  return rows.length > 0;
}
```

- [ ] **Step 4: Update `createSession` to also return role + permissions**

In `createSession`, update the return:
```ts
return {
  cookieValue: signSession(sessionId),
  expiresAt,
  user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions },
};
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: extend auth to include role and permissions in session"
```

---

### Task 4: Update `AdminLayout.astro` — Permission-filtered Sidebar + Mobile

**Files:**
- Modify: `src/layouts/AdminLayout.astro`

- [ ] **Step 1: Replace `AdminLayout.astro` with permission-aware version**

```astro
---
import '@/styles/admin.css';
import { getSettings } from '@/lib/settings';
import { siteIconHref } from '@/lib/site-icon';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import type { AdminUserSession } from '@/lib/auth';

interface Props {
  user: AdminUserSession;
  title?: string;
}

const { user, title = '後台管理' } = Astro.props;
const pathname = Astro.url.pathname;
const settings = await getSettings();
const siteIconUrl = siteIconHref(settings);

const perm = user.permissions;
const isSuper = user.role === 'superadmin';

const isActive = (href: string) => {
  if (href === '/admin') return pathname === '/admin' || pathname === '/admin/';
  return pathname === href || pathname.startsWith(href + '/');
};

const settingsPerms = [
  PERMISSIONS.SETTINGS_BASIC,
  PERMISSIONS.SETTINGS_LAYOUT,
  PERMISSIONS.SETTINGS_GALLERY,
  PERMISSIONS.SETTINGS_SMTP,
];
const canSeeAnySettings = isSuper || settingsPerms.some((p) => hasPermission(perm, p));
---

<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    {settings.siteIconUrl ? <link rel="icon" href={siteIconUrl} /> : <link rel="icon" type="image/svg+xml" href={siteIconUrl} />}
    {settings.siteIconUrl && <link rel="apple-touch-icon" href={siteIconUrl} />}
    <title>{title}</title>
  </head>
  <body class="admin-body">

    <!-- Mobile header -->
    <header class="admin-header">
      <button class="admin-header__hamburger" id="admin-hamburger" aria-label="開啟選單" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <span class="admin-header__title">{settings.siteName || '後台管理'}</span>
      <span class="admin-header__user">{user.username}</span>
    </header>

    <!-- Sidebar overlay (mobile) -->
    <div class="admin-overlay" id="admin-overlay" aria-hidden="true"></div>

    <!-- Sidebar -->
    <aside class="admin-sidebar" id="admin-sidebar" aria-label="後台導覽">
      <div class="admin-sidebar__top">
        <a href="/admin" class="admin-logo">{settings.siteName || '後台管理'}</a>
        <button class="admin-sidebar__close" id="admin-sidebar-close" aria-label="關閉選單">✕</button>
      </div>

      <nav class="admin-sidebar__nav">
        <a href="/admin" class:list={['nav-item', { 'is-active': isActive('/admin') && !isActive('/admin/vehicles') && !isActive('/admin/brands') && !isActive('/admin/videos') && !isActive('/admin/sell') && !isActive('/admin/settings') && !isActive('/admin/users') }]}>
          <span>概覽</span>
        </a>

        {(isSuper || hasPermission(perm, PERMISSIONS.VEHICLES_VIEW)) && (
          <a href="/admin/vehicles" class:list={['nav-item', { 'is-active': isActive('/admin/vehicles') }]}>
            <span>車輛管理</span>
          </a>
        )}

        {(isSuper || hasPermission(perm, PERMISSIONS.BRANDS_VIEW)) && (
          <a href="/admin/brands" class:list={['nav-item', { 'is-active': isActive('/admin/brands') }]}>
            <span>品牌管理</span>
          </a>
        )}

        {(isSuper || hasPermission(perm, PERMISSIONS.VIDEOS_CAROUSEL) || hasPermission(perm, PERMISSIONS.VIDEOS_LINKS)) && (
          <a href="/admin/videos" class:list={['nav-item', { 'is-active': isActive('/admin/videos') }]}>
            <span>影片管理</span>
          </a>
        )}

        {(isSuper || hasPermission(perm, PERMISSIONS.SELL_INQUIRIES)) && (
          <a href="/admin/sell-inquiries" class:list={['nav-item', { 'is-active': isActive('/admin/sell-inquiries') }]}>
            <span>賣車申請</span>
          </a>
        )}

        {canSeeAnySettings && (
          <div class="nav-group">
            <span class="nav-group__label">設定</span>
            {(isSuper || hasPermission(perm, PERMISSIONS.SETTINGS_BASIC)) && (
              <a href="/admin/settings/basic" class:list={['nav-item nav-item--sub', { 'is-active': isActive('/admin/settings/basic') }]}>基本資訊</a>
            )}
            {(isSuper || hasPermission(perm, PERMISSIONS.SETTINGS_LAYOUT)) && (
              <a href="/admin/settings/layout" class:list={['nav-item nav-item--sub', { 'is-active': isActive('/admin/settings/layout') }]}>版型設定</a>
            )}
            {(isSuper || hasPermission(perm, PERMISSIONS.SETTINGS_GALLERY)) && (
              <a href="/admin/settings/gallery" class:list={['nav-item nav-item--sub', { 'is-active': isActive('/admin/settings/gallery') }]}>照片模式</a>
            )}
            {(isSuper || hasPermission(perm, PERMISSIONS.SETTINGS_SMTP)) && (
              <a href="/admin/settings/smtp" class:list={['nav-item nav-item--sub', { 'is-active': isActive('/admin/settings/smtp') }]}>SMTP 通知</a>
            )}
          </div>
        )}

        {(isSuper || hasPermission(perm, PERMISSIONS.USERS_MANAGE)) && (
          <a href="/admin/users" class:list={['nav-item', { 'is-active': isActive('/admin/users') }]}>
            <span>用戶管理</span>
          </a>
        )}
      </nav>

      <div class="admin-sidebar__footer">
        <a href="/admin/account" class="nav-item">帳號設定</a>
        <a href="/" target="_blank" rel="noopener" class="nav-item nav-item--external">查看網站 ↗</a>
        <form method="post" action="/api/admin/logout">
          <button type="submit" class="admin-sidebar__logout">登出</button>
        </form>
      </div>
    </aside>

    <main class="admin-main">
      <slot />
    </main>

    <script>
      const hamburger = document.getElementById('admin-hamburger');
      const sidebar = document.getElementById('admin-sidebar');
      const overlay = document.getElementById('admin-overlay');
      const closeBtn = document.getElementById('admin-sidebar-close');

      function openSidebar() {
        sidebar?.classList.add('is-open');
        overlay?.classList.add('is-visible');
        hamburger?.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
      }
      function closeSidebar() {
        sidebar?.classList.remove('is-open');
        overlay?.classList.remove('is-visible');
        hamburger?.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
      hamburger?.addEventListener('click', openSidebar);
      closeBtn?.addEventListener('click', closeSidebar);
      overlay?.addEventListener('click', closeSidebar);
    </script>
  </body>
</html>

<style is:global>
/* Reset / base */
.admin-body { margin: 0; font-family: system-ui, sans-serif; background: var(--admin-bg, #f4f4f5); }

/* Header (mobile only) */
.admin-header {
  display: none;
  position: fixed; top: 0; left: 0; right: 0; z-index: 200;
  height: 56px; padding: 0 1rem;
  background: var(--admin-sidebar-bg, #1e1e2e);
  color: #fff;
  align-items: center; justify-content: space-between;
}
.admin-header__hamburger {
  display: flex; flex-direction: column; gap: 4px;
  background: none; border: 0; padding: 4px; cursor: pointer;
}
.admin-header__hamburger span { display: block; width: 22px; height: 2px; background: #fff; border-radius: 2px; }
.admin-header__title { font-weight: 600; font-size: 0.95rem; }
.admin-header__user { font-size: 0.8rem; color: rgba(255,255,255,0.6); }

/* Sidebar */
.admin-sidebar {
  position: fixed; left: 0; top: 0; bottom: 0;
  width: 200px; z-index: 100;
  background: var(--admin-sidebar-bg, #1e1e2e);
  color: #fff;
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.admin-sidebar__top { display: flex; align-items: center; justify-content: space-between; padding: 1rem; }
.admin-logo { color: #fff; text-decoration: none; font-weight: 700; font-size: 0.95rem; }
.admin-sidebar__close { display: none; background: none; border: 0; color: #fff; font-size: 1.2rem; cursor: pointer; padding: 4px 8px; }

.admin-sidebar__nav { flex: 1; padding: 0.5rem 0; display: flex; flex-direction: column; gap: 2px; }
.nav-item {
  display: block; padding: 0.5rem 1rem;
  color: rgba(255,255,255,0.7); text-decoration: none; font-size: 0.875rem;
  border-radius: 6px; margin: 0 0.5rem;
  transition: background 0.15s, color 0.15s;
}
.nav-item:hover, .nav-item.is-active { background: rgba(255,255,255,0.1); color: #fff; }
.nav-item.is-active { font-weight: 600; }
.nav-item--sub { padding-left: 1.5rem; font-size: 0.8rem; }
.nav-item--external { font-size: 0.8rem; color: rgba(255,255,255,0.5); }
.nav-group { margin: 0.5rem 0; }
.nav-group__label { display: block; padding: 0.25rem 1.5rem; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
.admin-sidebar__footer { padding: 0.75rem 0; border-top: 1px solid rgba(255,255,255,0.1); }
.admin-sidebar__logout { background: none; border: 0; color: rgba(255,255,255,0.6); font-size: 0.875rem; padding: 0.5rem 1rem; cursor: pointer; width: 100%; text-align: left; }
.admin-sidebar__logout:hover { color: #fff; }

/* Overlay */
.admin-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 90; }
.admin-overlay.is-visible { display: block; }

/* Main content */
.admin-main { margin-left: 200px; min-height: 100vh; padding: 2rem; }

/* Mobile */
@media (max-width: 768px) {
  .admin-header { display: flex; }
  .admin-main { margin-left: 0; padding-top: calc(56px + 1rem); }
  .admin-sidebar { transform: translateX(-100%); transition: transform 0.25s; top: 0; }
  .admin-sidebar.is-open { transform: translateX(0); }
  .admin-sidebar__close { display: block; }
}
</style>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Manual check**

Start dev server, log in, verify sidebar shows on desktop. Resize to mobile — confirm hamburger appears and sidebar opens/closes.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/AdminLayout.astro
git commit -m "feat: update AdminLayout with permission-filtered sidebar and mobile hamburger"
```

---

### Task 5: Create Setup Page

**Files:**
- Create: `src/pages/admin/setup.astro`

- [ ] **Step 1: Create setup page**

```astro
---
import '@/styles/admin.css';
import { hasAnyUsers } from '@/lib/auth';
import { hashPassword } from '@/lib/crypto';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { getSettings } from '@/lib/settings';

// If users already exist, redirect to login
if (await hasAnyUsers()) {
  return Astro.redirect('/admin/login');
}

let error = '';

if (Astro.request.method === 'POST') {
  const form = await Astro.request.formData();
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');

  if (!username || !password) {
    error = '請填寫帳號和密碼';
  } else if (password.length < 8) {
    error = '密碼至少 8 個字元';
  } else if (password !== confirm) {
    error = '兩次密碼不一致';
  } else {
    const now = new Date().toISOString();
    await db.insert(adminUsers).values({
      id: crypto.randomUUID(),
      username,
      passwordHash: hashPassword(password),
      role: 'superadmin',
      permissions: 0x1FFF,
      createdAt: now,
    });
    return Astro.redirect('/admin/login?setup=1');
  }
}

const settings = await getSettings();
---

<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>初始設定</title>
    <link rel="stylesheet" href="/src/styles/admin.css" />
  </head>
  <body class="login-body">
    <div class="login-card">
      <h1>初始設定</h1>
      <p>歡迎！請建立第一個管理員帳號（自動成為 Superadmin）。</p>
      {error && <p class="login-error">{error}</p>}
      <form method="post">
        <div class="form-group">
          <label for="username">帳號</label>
          <input type="text" id="username" name="username" required autocomplete="username" />
        </div>
        <div class="form-group">
          <label for="password">密碼（至少 8 字元）</label>
          <input type="password" id="password" name="password" required autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label for="confirm">確認密碼</label>
          <input type="password" id="confirm" name="confirm" required autocomplete="new-password" />
        </div>
        <button type="submit" class="btn-primary" style="width:100%">建立帳號並開始使用</button>
      </form>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Update `admin/login.astro` to show setup success message**

Find the error message logic and add:
```ts
const isSetup = params.get('setup') === '1';
// In errorMessage:
const successMessage = isSetup ? '帳號建立完成，請登入' : '';
```

- [ ] **Step 3: Add setup redirect in admin middleware**

In each admin page that requires auth (index, vehicles, settings, account), add setup check before login check:

```ts
// Check setup before auth
const { hasAnyUsers } = await import('@/lib/auth');
if (!await hasAnyUsers()) {
  return Astro.redirect('/admin/setup');
}
```

Or better — add this logic to the existing `requireAdmin` / page-level checks. The cleanest approach: in each admin `.astro` page, call:

```ts
import { getSession, hasAnyUsers } from '@/lib/auth';
if (!await hasAnyUsers()) return Astro.redirect('/admin/setup');
const user = await getSession(Astro.cookies);
if (!user) return Astro.redirect('/admin/login');
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Manual test**

Delete DB or clear admin_users table, visit `/admin` — should redirect to `/admin/setup`. Complete setup, verify redirect to login. Log in with new credentials.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/setup.astro src/pages/admin/login.astro
git commit -m "feat: add superadmin setup page for first-run initialization"
```

---

### Task 6: Update Existing Admin Pages to Pass `user` to Layout

**Files:**
- Modify: `src/pages/admin/index.astro`
- Modify: `src/pages/admin/vehicles.astro`
- Modify: `src/pages/admin/account.astro`

Each page needs to:
1. Replace `await requireAdmin(cookies)` with setup + session check
2. Pass `user` to `<AdminLayout user={user}>`

- [ ] **Step 1: Update `admin/index.astro`**

```ts
import { getSession, hasAnyUsers } from '@/lib/auth';
if (!await hasAnyUsers()) return Astro.redirect('/admin/setup');
const user = await getSession(Astro.cookies);
if (!user) return Astro.redirect('/admin/login');
```

Change `<AdminLayout>` to `<AdminLayout user={user}>`.

- [ ] **Step 2: Update `admin/vehicles.astro`**

Same pattern. Add permission check:
```ts
import { hasPermission } from '@/lib/permissions';
if (user.role !== 'superadmin' && !hasPermission(user.permissions, PERMISSIONS.VEHICLES_VIEW)) {
  return Astro.redirect('/admin');
}
```

Change `<AdminLayout>` to `<AdminLayout user={user}>`.

- [ ] **Step 3: Update `admin/account.astro`**

Same session check pattern + pass user to layout.

- [ ] **Step 4: Redirect `admin/settings.astro`**

The old settings page now redirects to the new sub-pages:
```ts
return Astro.redirect('/admin/settings/basic');
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/index.astro src/pages/admin/vehicles.astro src/pages/admin/account.astro src/pages/admin/settings.astro
git commit -m "feat: update admin pages to use permission-aware layout"
```

---

### Task 7: New Settings Sub-pages

Create four focused settings pages, each with a dedicated small Svelte component.

**Files:**
- Create: `src/pages/admin/settings/basic.astro`
- Create: `src/pages/admin/settings/layout.astro`
- Create: `src/pages/admin/settings/gallery.astro`
- Create: `src/pages/admin/settings/smtp.astro`
- Create: `src/components/admin/SettingsBasic.svelte`
- Create: `src/components/admin/SettingsLayout.svelte`
- Create: `src/components/admin/SettingsGallery.svelte`
- Create: `src/components/admin/SettingsSmtp.svelte`

- [ ] **Step 1: Create `settings/basic.astro`**

```astro
---
import AdminLayout from '@/layouts/AdminLayout.astro';
import SettingsBasic from '@/components/admin/SettingsBasic.svelte';
import { getSession, hasAnyUsers } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { hasPermission } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';

if (!await hasAnyUsers()) return Astro.redirect('/admin/setup');
const user = await getSession(Astro.cookies);
if (!user) return Astro.redirect('/admin/login');
if (user.role !== 'superadmin' && !hasPermission(user.permissions, PERMISSIONS.SETTINGS_BASIC)) {
  return Astro.redirect('/admin');
}
const settings = await getSettings();
---
<AdminLayout user={user} title="基本設定">
  <SettingsBasic client:load settings={settings} />
</AdminLayout>
```

- [ ] **Step 2: Create `SettingsBasic.svelte`**

Extract from the existing `AdminDashboard.svelte` settings mode — the section covering: `siteName`, `siteIconUrl`, `salespersonName`, `phoneNumber`, `storeAddress`, `businessHours`, `lineUrl`, `instagramUrl`, `facebookUrl`, `threadsUrl`, `tiktokUrl`, social icons upload.

The component receives `settings` as prop, has a save button that calls `POST /api/admin/settings` with only the basic fields. Include unsaved changes tracking.

Key structure:
```svelte
<script lang="ts">
  import type { SiteSettings } from '@/lib/settings';
  export let settings: SiteSettings;
  let dirty = false;
  let saving = false;
  // ... copy relevant fields from AdminDashboard.svelte settings mode
  async function save() {
    saving = true;
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteName, siteIconUrl, salespersonName, phoneNumber, storeAddress, businessHours, lineUrl, instagramUrl, facebookUrl, threadsUrl, tiktokUrl, socialIcons }),
    });
    saving = false; dirty = false;
  }
</script>
```

- [ ] **Step 3: Create `settings/layout.astro` and `SettingsLayout.svelte`**

Same pattern. SettingsLayout covers: `activeTemplate`, `activeStyle`, `homepageEyebrow`, `homepageTitle`, `homepageLead`, `homepageNote`, `homepageBadge`, `featuredEyebrow`, `featuredTitle`, `featuredCount`, `listingEyebrow`, `listingTitle`, `listingLead`, `cardTitleTemplate`, `shareMessageTemplate`, `detailSpecFields`, `footerDisclaimer`, `heroVehicleSlug`, `showSoldVehicles`.

Permission: `SETTINGS_LAYOUT`.

- [ ] **Step 4: Create `settings/gallery.astro` and `SettingsGallery.svelte`**

Covers only `galleryMode` (4 radio options). Simple, small component.

Permission: `SETTINGS_GALLERY`.

- [ ] **Step 5: Create `settings/smtp.astro` and `SettingsSmtp.svelte`**

Covers: `notificationEmail`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass` + "傳送測試信" button.

Permission: `SETTINGS_SMTP`.

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/settings/ src/components/admin/Settings*.svelte
git commit -m "feat: add settings sub-pages (basic, layout, gallery, smtp)"
```

---

### Task 8: New Brand Management Page

**Files:**
- Create: `src/pages/admin/brands.astro`
- Create: `src/components/admin/Brands.svelte`

- [ ] **Step 1: Create `brands.astro`**

```astro
---
import AdminLayout from '@/layouts/AdminLayout.astro';
import Brands from '@/components/admin/Brands.svelte';
import { getSession, hasAnyUsers } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { listBrandAliases } from '@/lib/brand-aliases';
import { listAdminVehicles } from '@/lib/vehicles';

if (!await hasAnyUsers()) return Astro.redirect('/admin/setup');
const user = await getSession(Astro.cookies);
if (!user) return Astro.redirect('/admin/login');
if (user.role !== 'superadmin' && !hasPermission(user.permissions, PERMISSIONS.BRANDS_VIEW)) {
  return Astro.redirect('/admin');
}

const brandAliases = await listBrandAliases();
const vehicles = await listAdminVehicles();
const canUploadIcon = user.role === 'superadmin' || hasPermission(user.permissions, PERMISSIONS.BRANDS_ICON);
---
<AdminLayout user={user} title="品牌管理">
  <Brands client:load brandAliases={brandAliases} vehicles={vehicles} canUploadIcon={canUploadIcon} />
</AdminLayout>
```

- [ ] **Step 2: Create `Brands.svelte`**

Extract brand alias management section from `AdminDashboard.svelte`. Add `canUploadIcon` prop — when false, hide the icon upload button. Calls `POST /api/admin/brand-aliases`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/brands.astro src/components/admin/Brands.svelte
git commit -m "feat: add dedicated brand management admin page"
```

---

### Task 9: New Videos Management Page

**Files:**
- Create: `src/pages/admin/videos.astro`
- Create: `src/components/admin/Videos.svelte`

- [ ] **Step 1: Create `videos.astro`**

```astro
---
import AdminLayout from '@/layouts/AdminLayout.astro';
import Videos from '@/components/admin/Videos.svelte';
import { getSession, hasAnyUsers } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { listVideoLinks } from '@/lib/video-links';

if (!await hasAnyUsers()) return Astro.redirect('/admin/setup');
const user = await getSession(Astro.cookies);
if (!user) return Astro.redirect('/admin/login');

const canCarousel = user.role === 'superadmin' || hasPermission(user.permissions, PERMISSIONS.VIDEOS_CAROUSEL);
const canLinks = user.role === 'superadmin' || hasPermission(user.permissions, PERMISSIONS.VIDEOS_LINKS);
if (!canCarousel && !canLinks) return Astro.redirect('/admin');

const settings = await getSettings();
const videoLinks = await listVideoLinks();
---
<AdminLayout user={user} title="影片管理">
  <Videos client:load settings={settings} videoLinks={videoLinks} canCarousel={canCarousel} canLinks={canLinks} />
</AdminLayout>
```

- [ ] **Step 2: Create `Videos.svelte`**

Two sections controlled by `canCarousel` / `canLinks` props:
- Section 1: 影片輪播 (heroVideos, videoSectionEnabled, videoSectionPosition) — calls `POST /api/admin/settings`
- Section 2: 影片連結 (videoLinks list) — calls `POST /api/admin/video-links`

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/videos.astro src/components/admin/Videos.svelte
git commit -m "feat: add dedicated videos management admin page"
```

---

### Task 10: New Sell Inquiries Page

**Files:**
- Create: `src/pages/admin/sell-inquiries.astro`
- Create: `src/components/admin/SellInquiries.svelte`

- [ ] **Step 1: Create `sell-inquiries.astro`**

```astro
---
import AdminLayout from '@/layouts/AdminLayout.astro';
import SellInquiries from '@/components/admin/SellInquiries.svelte';
import { getSession, hasAnyUsers } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { listSellInquiries, countUnreadSellInquiries } from '@/lib/sell-inquiries';

if (!await hasAnyUsers()) return Astro.redirect('/admin/setup');
const user = await getSession(Astro.cookies);
if (!user) return Astro.redirect('/admin/login');
if (user.role !== 'superadmin' && !hasPermission(user.permissions, PERMISSIONS.SELL_INQUIRIES)) {
  return Astro.redirect('/admin');
}

const inquiries = await listSellInquiries();
---
<AdminLayout user={user} title="賣車申請">
  <SellInquiries client:load inquiries={inquiries} />
</AdminLayout>
```

- [ ] **Step 2: Create `SellInquiries.svelte`**

List of inquiries with expand/read functionality. Calls `POST /api/admin/sell-inquiries/[id]/read`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/sell-inquiries.astro src/components/admin/SellInquiries.svelte
git commit -m "feat: add sell inquiries admin page"
```

---

### Task 11: User Management Page

**Files:**
- Create: `src/pages/admin/users.astro`
- Create: `src/components/admin/Users.svelte`
- Create: `src/pages/api/admin/users/index.ts`
- Create: `src/pages/api/admin/users/[id].ts`

- [ ] **Step 1: Create user management API — list + create**

`src/pages/api/admin/users/index.ts`:
```ts
import type { APIRoute } from 'astro';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { asc } from 'drizzle-orm';
import { hashPassword } from '@/lib/crypto';

export const GET: APIRoute = async ({ cookies }) => {
  await requirePermission(cookies, PERMISSIONS.USERS_MANAGE);
  const rows = await db.select({
    id: adminUsers.id,
    username: adminUsers.username,
    role: adminUsers.role,
    permissions: adminUsers.permissions,
    createdAt: adminUsers.createdAt,
  }).from(adminUsers).orderBy(asc(adminUsers.createdAt));
  return Response.json(rows);
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const creator = await requirePermission(cookies, PERMISSIONS.USERS_MANAGE);
  if (creator.role !== 'superadmin') {
    return Response.json({ error: '只有 superadmin 可以建立用戶' }, { status: 403 });
  }
  const body = await request.json();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const permissions = Number(body.permissions) || 0;

  if (!username || password.length < 8) {
    return Response.json({ error: '帳號不得空白，密碼至少 8 字元' }, { status: 400 });
  }
  // Cannot grant permissions creator doesn't have
  if ((permissions & creator.permissions) !== permissions) {
    return Response.json({ error: '不能授予超過自身的權限' }, { status: 400 });
  }

  const existing = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
  if (existing.length > 0) {
    return Response.json({ error: '帳號已存在' }, { status: 400 });
  }

  await db.insert(adminUsers).values({
    id: crypto.randomUUID(),
    username,
    passwordHash: hashPassword(password),
    role: 'admin',
    permissions,
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
};
```

Note: Add `import { eq } from 'drizzle-orm';` at top.

- [ ] **Step 2: Create user delete API**

`src/pages/api/admin/users/[id].ts`:
```ts
import type { APIRoute } from 'astro';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const actor = await requirePermission(cookies, PERMISSIONS.USERS_MANAGE);
  if (actor.role !== 'superadmin') {
    return Response.json({ error: '只有 superadmin 可以刪除用戶' }, { status: 403 });
  }
  const targetId = params.id!;
  if (targetId === actor.id) {
    return Response.json({ error: '不能刪除自己的帳號' }, { status: 400 });
  }
  const target = await db.select({ role: adminUsers.role }).from(adminUsers).where(eq(adminUsers.id, targetId)).limit(1);
  if (target[0]?.role === 'superadmin') {
    return Response.json({ error: '不能刪除 superadmin' }, { status: 400 });
  }
  await db.delete(adminUsers).where(eq(adminUsers.id, targetId));
  return Response.json({ ok: true });
};
```

- [ ] **Step 3: Create `users.astro`**

```astro
---
import AdminLayout from '@/layouts/AdminLayout.astro';
import Users from '@/components/admin/Users.svelte';
import { getSession, hasAnyUsers } from '@/lib/auth';
import { PERMISSIONS, PERMISSION_LABELS } from '@/lib/permissions';
import { hasPermission } from '@/lib/permissions';
import { db } from '@/db/connection';
import { adminUsers } from '@/db/schema';
import { asc } from 'drizzle-orm';

if (!await hasAnyUsers()) return Astro.redirect('/admin/setup');
const user = await getSession(Astro.cookies);
if (!user) return Astro.redirect('/admin/login');
if (user.role !== 'superadmin' && !hasPermission(user.permissions, PERMISSIONS.USERS_MANAGE)) {
  return Astro.redirect('/admin');
}

const users = await db.select({
  id: adminUsers.id,
  username: adminUsers.username,
  role: adminUsers.role,
  permissions: adminUsers.permissions,
  createdAt: adminUsers.createdAt,
}).from(adminUsers).orderBy(asc(adminUsers.createdAt));
---
<AdminLayout user={user} title="用戶管理">
  <Users
    client:load
    users={users}
    currentUserId={user.id}
    isSuperAdmin={user.role === 'superadmin'}
    creatorPermissions={user.permissions}
    permissionLabels={PERMISSION_LABELS}
  />
</AdminLayout>
```

- [ ] **Step 4: Create `Users.svelte`**

```svelte
<script lang="ts">
  export let users: { id: string; username: string; role: string; permissions: number; createdAt: string }[];
  export let currentUserId: string;
  export let isSuperAdmin: boolean;
  export let creatorPermissions: number;
  export let permissionLabels: Record<string, string>;

  let showCreate = false;
  let newUsername = '';
  let newPassword = '';
  let newPermissions = 0;
  let saving = false;
  let error = '';

  // All permission entries except ALL
  const permEntries = Object.entries(permissionLabels).filter(([k]) => k !== 'ALL');

  function toggleBit(bit: number) {
    newPermissions ^= bit;
  }
  function canGrant(bit: number): boolean {
    return isSuperAdmin || (creatorPermissions & bit) === bit;
  }

  async function createUser() {
    if (!newUsername || newPassword.length < 8) {
      error = '請填寫帳號，密碼至少 8 字元'; return;
    }
    saving = true; error = '';
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword, permissions: newPermissions }),
    });
    const json = await res.json();
    if (!res.ok) { error = json.error || '建立失敗'; saving = false; return; }
    location.reload();
  }

  async function deleteUser(id: string, username: string) {
    if (!confirm(`確定要刪除用戶「${username}」？`)) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    location.reload();
  }
</script>

<div class="users-page">
  <div class="page-header">
    <h1>用戶管理</h1>
    {isSuperAdmin && <button type="button" on:click={() => showCreate = !showCreate} class="btn-primary">＋ 新增用戶</button>}
  </div>

  {#if showCreate}
    <div class="create-user-form">
      <h2>新增用戶</h2>
      {#if error}<p class="error">{error}</p>{/if}
      <div class="form-row">
        <label>帳號 <input type="text" bind:value={newUsername} /></label>
        <label>密碼 <input type="password" bind:value={newPassword} placeholder="至少 8 字元" /></label>
      </div>
      <fieldset>
        <legend>功能權限</legend>
        <div class="perm-grid">
          {#each permEntries as [key, label]}
            {@const bit = (import('@/lib/permissions') as any).PERMISSIONS?.[key] ?? 0}
            <label class:disabled={!canGrant(bit)}>
              <input type="checkbox"
                checked={(newPermissions & bit) === bit}
                disabled={!canGrant(bit)}
                on:change={() => toggleBit(bit)}
              />
              {label}
            </label>
          {/each}
        </div>
      </fieldset>
      <div class="form-actions">
        <button type="button" on:click={createUser} disabled={saving} class="btn-primary">建立</button>
        <button type="button" on:click={() => showCreate = false}>取消</button>
      </div>
    </div>
  {/if}

  <table class="users-table">
    <thead><tr><th>帳號</th><th>角色</th><th>權限</th><th>建立時間</th><th></th></tr></thead>
    <tbody>
      {#each users as u}
        <tr class:is-current={u.id === currentUserId}>
          <td>{u.username} {u.id === currentUserId ? '（你）' : ''}</td>
          <td><span class="role-badge role-badge--{u.role}">{u.role}</span></td>
          <td>
            {#each permEntries as [key, label]}
              {@const bit = 0} <!-- resolved at runtime via permissionLabels -->
              <!-- simplified: show count -->
            {/each}
            {u.role === 'superadmin' ? '全部' : `${Object.values(import('@/lib/permissions').PERMISSIONS ?? {}).filter(b => b !== 0x1FFF && (u.permissions & (b as number)) === (b as number)).length} 項`}
          </td>
          <td>{new Date(u.createdAt).toLocaleDateString('zh-TW')}</td>
          <td>
            {#if isSuperAdmin && u.id !== currentUserId && u.role !== 'superadmin'}
              <button type="button" on:click={() => deleteUser(u.id, u.username)} class="btn-danger-sm">刪除</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

Note: The PERMISSIONS import in Svelte components needs to be done differently since Svelte runs in browser. Pass the permission bits as a prop from the Astro page instead:

In `users.astro`:
```ts
import { PERMISSIONS, PERMISSION_LABELS } from '@/lib/permissions';
const permissionBits = Object.fromEntries(
  Object.entries(PERMISSIONS).filter(([k]) => k !== 'ALL').map(([k, v]) => [k, v])
) as Record<string, number>;
```

Pass `permissionBits` as a prop to `Users.svelte`. Use it for checkbox binding.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Manual test**

Log in as superadmin. Visit `/admin/users`. Create a new user with limited permissions (e.g., only VEHICLES_VIEW). Log out, log in as new user — verify sidebar only shows "車輛管理". Verify new user cannot access `/admin/brands` (redirected to `/admin`).

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/users.astro src/components/admin/Users.svelte src/pages/api/admin/users/
git commit -m "feat: add user management page with bitmask permission assignment"
```

---

### Task 12: Update API Endpoints with Permission Checks

**Files:**
- Modify: `src/pages/api/admin/vehicles.ts`
- Modify: `src/pages/api/admin/vehicles/[id]/status.ts`
- Modify: `src/pages/api/admin/settings.ts`
- Modify: `src/pages/api/admin/brand-aliases.ts`

- [ ] **Step 1: Update vehicles API**

In `src/pages/api/admin/vehicles.ts`:
```ts
const user = await requirePermission(cookies, PERMISSIONS.VEHICLES_EDIT);
```

In `src/pages/api/admin/vehicles/[id]/status.ts`:
```ts
const user = await requirePermission(cookies, PERMISSIONS.VEHICLES_EDIT);
```

- [ ] **Step 2: Update settings API**

The settings API covers multiple setting types. Use a combined check — superadmin always passes, others need at least one settings permission:

```ts
const user = await requireAdmin(cookies);
// Check that user has at least one settings permission
const settingsPerms = PERMISSIONS.SETTINGS_BASIC | PERMISSIONS.SETTINGS_LAYOUT | PERMISSIONS.SETTINGS_GALLERY | PERMISSIONS.SETTINGS_SMTP;
if (user.role !== 'superadmin' && (user.permissions & settingsPerms) === 0) {
  return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
}
```

- [ ] **Step 3: Update brand-aliases API**

```ts
await requirePermission(cookies, PERMISSIONS.BRANDS_VIEW);
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/
git commit -m "feat: add permission checks to admin API endpoints"
```

---

### Task 13: Admin CSS — Finalize Styles

**Files:**
- Modify: `src/styles/admin.css`

- [ ] **Step 1: Add missing admin styles**

Add to `admin.css`:
```css
/* Page header pattern */
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
.page-header h1 { margin: 0; font-size: 1.5rem; }

/* Role badges */
.role-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
.role-badge--superadmin { background: #fef3c7; color: #92400e; }
.role-badge--admin { background: #dbeafe; color: #1e40af; }

/* Permission grid */
.perm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.5rem; padding: 0.75rem; }
.perm-grid label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; }
.perm-grid label.disabled { opacity: 0.4; cursor: not-allowed; }

/* Users table */
.users-table { width: 100%; border-collapse: collapse; }
.users-table th, .users-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border, #e5e5e5); text-align: left; font-size: 0.875rem; }
.users-table tr.is-current { background: var(--accent-subtle, #f0f9ff); }
.btn-danger-sm { font-size: 0.75rem; padding: 3px 8px; background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer; }
.btn-danger-sm:hover { background: #fca5a5; }

/* Create user form */
.create-user-form { background: var(--card-bg, #fff); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 1px solid var(--border, #e5e5e5); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
@media (max-width: 640px) { .form-row { grid-template-columns: 1fr; } }
.form-actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Full manual test**

Start dev server. Test:
1. No users → redirects to setup → create superadmin → login
2. Sidebar shows all items for superadmin
3. Create admin user with limited permissions → login → verify correct sidebar items shown
4. All settings sub-pages accessible and save correctly
5. Mobile: hamburger opens sidebar, close by overlay or ✕

- [ ] **Step 4: Commit**

```bash
git add src/styles/admin.css
git commit -m "feat: add admin CSS for users page and page header patterns"
```

---

### Task 14: Push

- [ ] **Push all commits**

```bash
git push
```

Expected: CI passes, all commits pushed.
