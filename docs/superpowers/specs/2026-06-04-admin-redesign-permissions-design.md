# Spec 0 — Admin 重設計 + 權限系統

**Date:** 2026-06-04  
**Status:** Approved  
**Must complete before:** Spec 1 (Visual Enhancement), Spec 2 (Interactive Features)

---

## Overview

Redesign the admin interface from a single-component dashboard to a multi-page layout with left sidebar navigation. Add a bitmask-based permission system with superadmin role, first-run setup page, and user management.

---

## 1. Permission Bitmask

Each bit controls visibility and access to one UI block. Stored as an INTEGER in `adminUsers.permissions`.

| Bit | Hex | Constant | Description |
|-----|-----|----------|-------------|
| 0 | `0x0001` | `PERM_VEHICLES_VIEW` | 查看車輛列表 |
| 1 | `0x0002` | `PERM_VEHICLES_EDIT` | 新增/編輯/刪除車輛 |
| 2 | `0x0004` | `PERM_BRANDS_VIEW` | 查看品牌管理 |
| 3 | `0x0008` | `PERM_BRANDS_ICON` | 上傳品牌圖示 |
| 4 | `0x0010` | `PERM_VIDEOS_CAROUSEL` | 影片輪播設定 |
| 5 | `0x0020` | `PERM_VIDEOS_LINKS` | 影片連結管理 |
| 6 | `0x0040` | `PERM_SELL_INQUIRIES` | 賣車申請查看 |
| 7 | `0x0080` | `PERM_SETTINGS_BASIC` | 基本設定（站名、聯絡方式） |
| 8 | `0x0100` | `PERM_SETTINGS_LAYOUT` | 版型/樣式設定 |
| 9 | `0x0200` | `PERM_SETTINGS_GALLERY` | 照片展示模式 |
| 10 | `0x0400` | `PERM_SETTINGS_SMTP` | SMTP/Email 通知設定 |
| 11 | `0x0800` | `PERM_USERS_MANAGE` | 用戶管理 |
| 12 | `0x1000` | `PERM_IMPORT_API` | 外部 API 匯入 |

**PERM_ALL** = `0x1FFF` (all 13 bits set)

Superadmin: `role = 'superadmin'`, `permissions = 0x1FFF`. Only one superadmin allowed.

---

## 2. Database Changes

Migration `0010_admin_permissions.sql`:
```sql
ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE admin_users ADD COLUMN permissions INTEGER NOT NULL DEFAULT 0;
-- Existing single user (if any) becomes superadmin
UPDATE admin_users SET role = 'superadmin', permissions = 8191 WHERE id = (SELECT id FROM admin_users ORDER BY created_at LIMIT 1);
```

---

## 3. Setup Page (`/admin/setup`)

- Renders when `adminUsers` table is empty
- All `/admin/*` routes redirect to `/admin/setup` when no users exist
- Form: username + password + confirm password
- On submit: creates the account with `role = 'superadmin'`, `permissions = 0x1FFF`
- After setup: redirect to `/admin` login
- If users exist: redirect to `/admin`

---

## 4. Auth Middleware

New file `src/lib/auth.ts` changes (extends existing `requireAdmin`):

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

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export function hasPermission(userPermissions: number, required: number): boolean {
  return (userPermissions & required) === required;
}

// Returns user with role + permissions from session
export async function getAdminUser(cookies: AstroCookies): Promise<AdminUserSession | null>

// Throws 403 if not logged in or missing permission
export async function requirePermission(cookies: AstroCookies, required: number): Promise<AdminUserSession>
```

`AdminUserSession`:
```ts
export interface AdminUserSession {
  id: string;
  username: string;
  role: 'superadmin' | 'admin';
  permissions: number;
}
```

---

## 5. Admin Layout Architecture

### File Structure

```
src/
  layouts/
    AdminLayout.astro          ← new: sidebar + header wrapper
  components/admin/
    AdminSidebar.svelte        ← new: sidebar nav with permission filtering
    AdminHeader.svelte         ← new: topbar (mobile hamburger, user menu)
  pages/admin/
    setup.astro                ← new: first-run setup
    index.astro                ← overview (refactored)
    vehicles.astro             ← vehicle management (refactored)
    brands.astro               ← new: brand aliases + icon management
    videos.astro               ← new: video carousel + video links
    sell-inquiries.astro       ← new: sell inquiry list
    settings/
      index.astro              ← redirect to /admin/settings/basic
      basic.astro              ← new: site name, contact, social
      layout.astro             ← new: template, style
      gallery.astro            ← new: photo gallery mode
      smtp.astro               ← new: email notification
    users.astro                ← new: user management (superadmin)
    account.astro              ← password change (existing, refactored)
    login.astro                ← existing, minimal changes
```

### AdminLayout.astro

Receives `user: AdminUserSession` prop. Renders:
- Sidebar (desktop: always visible, mobile: hidden until toggle)
- Header with mobile hamburger + username + logout
- Main content slot

### Sidebar Items

Each item is only rendered when the user has the required permission:

```
概覽                    — always
車輛管理                — VEHICLES_VIEW
品牌管理                — BRANDS_VIEW
影片輪播                — VIDEOS_CAROUSEL
影片連結                — VIDEOS_LINKS
賣車申請                — SELL_INQUIRIES  [unread badge]
────────
設定
  基本資訊              — SETTINGS_BASIC
  版型設定              — SETTINGS_LAYOUT
  照片模式              — SETTINGS_GALLERY
  SMTP通知              — SETTINGS_SMTP
────────
用戶管理                — USERS_MANAGE
────────
帳號                   — always
登出                   — always
```

---

## 6. User Management Page (`/admin/users`)

Required permission: `USERS_MANAGE`

**List view:**
- Table: username, role, permissions (rendered as tag chips), created date, actions
- "新增用戶" button (superadmin only)

**Create user form (superadmin only):**
- Username, password
- Role: always `'admin'` (cannot create another superadmin via UI)
- Permission checkboxes: one per bit, labelled with human name
- Cannot grant permissions the creator doesn't have (enforced server-side)

**Delete user:**
- Only superadmin can delete
- Cannot delete own account
- Cannot delete superadmin account

**API endpoints:**
- `GET /api/admin/users` — list users (USERS_MANAGE)
- `POST /api/admin/users` — create user (USERS_MANAGE, superadmin only)
- `DELETE /api/admin/users/[id]` — delete user (superadmin only)

---

## 7. Responsive Design

**Desktop (≥768px):**
- Sidebar: fixed left, 200px wide, full height
- Main content: `margin-left: 200px`

**Mobile (<768px):**
- Sidebar: hidden by default, slides in as overlay when hamburger clicked
- Header: fixed top bar with site name + hamburger icon
- Main content: full width, `padding-top: header height`
- Sidebar close: tap overlay backdrop or ✕ button

---

## 8. Refactoring Existing AdminDashboard.svelte

The existing monolithic `AdminDashboard.svelte` is replaced by focused components:

| Old mode | New page | New Svelte component |
|---------|---------|---------------------|
| `overview` | `admin/index.astro` | `admin/Overview.svelte` |
| `vehicles` | `admin/vehicles.astro` | `admin/Vehicles.svelte` (existing logic) |
| `settings` (brand) | `admin/brands.astro` | `admin/Brands.svelte` |
| `settings` (videos) | `admin/videos.astro` | `admin/Videos.svelte` |
| `settings` (basic/layout/gallery/smtp) | `admin/settings/*.astro` | `admin/Settings*.svelte` |
| _(new)_ | `admin/sell-inquiries.astro` | `admin/SellInquiries.svelte` |
| _(new)_ | `admin/users.astro` | `admin/Users.svelte` |

Each Svelte component receives its data as props from the Astro page (server-fetched). API calls for mutations remain as fetch to existing/new endpoints.

---

## 9. API Permission Enforcement

Every admin API endpoint must call `requirePermission(cookies, REQUIRED_BIT)`. Example:

```ts
// POST /api/admin/vehicles
export const POST: APIRoute = async ({ request, cookies }) => {
  await requirePermission(cookies, PERMISSIONS.VEHICLES_EDIT);
  // ...
};

// POST /api/admin/brand-aliases  
export const POST: APIRoute = async ({ request, cookies }) => {
  await requirePermission(cookies, PERMISSIONS.BRANDS_VIEW);
  // ...
};
```

---

## 10. Error Handling

- No session: redirect to `/admin/login`
- Has session but missing permission: return 403 JSON `{ error: 'forbidden' }` for API, redirect to `/admin` for page
- Creating user with permissions > own: return 400 `{ error: 'cannot grant permissions you do not have' }`
- Attempt to delete superadmin: return 400

---

## Out of Scope

- OAuth / SSO login
- Permission audit log
- Role-based groups (just individual bitmask per user)
- Superadmin transfer (must be done via direct DB edit)
- Per-vehicle permission scoping
