# Superadmin Feature Bitmask 設計

**Date:** 2026-06-08  
**Status:** Approved  
**Topic:** 以 bitmask 控制所有前台功能，superadmin 可按客戶授權各自開關

---

## 背景與目標

此站作為車商展示平台，未來將以 SaaS 模式部署給多個客戶。每個客戶是獨立部署（獨立 Docker instance + SQLite），superadmin（產品擁有者）登入各客戶的 instance 設定該客戶的功能授權等級，客戶的 admin 只能在授權範圍內自行調整。

目標：
- 用一個 integer bitmask 取代現有 8 個分散的 boolean feature settings
- 新增 superadmin 專屬的授權 mask，作為 admin 可操作的上限
- 所有前台按鈕、頁面、Nav 的顯示/隱藏自動跟隨有效 mask
- 不改動任何 page/component 的渲染邏輯（全部走現有 FrontFeatures interface）

---

## 資料模型

### 移除的 settings key（8 個 boolean）

```
featureCompareEnabled
featureSellInquiryEnabled
featureContactPageEnabled
featureAboutPageEnabled
featureSocialIconsEnabled
featureDirectContactEnabled
videoSectionEnabled
videoLinksEnabled
```

### 新增的 settings key

| Key | 型別 | 控制者 | 預設值 | 說明 |
|-----|------|--------|--------|------|
| `featureMask` | integer | Admin | `63`（0b00111111） | Admin 自己的功能開關 |
| `featureLicenseMask` | integer | Superadmin only | `255`（0b11111111） | 授權上限，admin 無法超越 |

### Bit 定義

```ts
FEATURE_COMPARE        = 1 << 0  // 1   — 比車功能
FEATURE_SELL_INQUIRY   = 1 << 1  // 2   — 賣車詢問表單
FEATURE_CONTACT_PAGE   = 1 << 2  // 4   — 聯絡頁
FEATURE_ABOUT_PAGE     = 1 << 3  // 8   — 關於頁
FEATURE_SOCIAL_ICONS   = 1 << 4  // 16  — 社群圖示（IG/FB/TikTok 等）
FEATURE_DIRECT_CONTACT = 1 << 5  // 32  — 直接聯絡（LINE/電話/行動列）
FEATURE_HERO_VIDEOS    = 1 << 6  // 64  — Hero 影片區
FEATURE_VIDEO_LINKS    = 1 << 7  // 128 — 影片連結區
```

預設 `featureMask = 63`：前 6 個功能開啟，video 兩項預設關閉（維持現有行為）。  
預設 `featureLicenseMask = 255`：全部授權（對現有部署無影響）。

**有效 mask = `featureLicenseMask & featureMask`**

---

## Runtime 邏輯

### 新檔：`src/lib/features.ts`

定義所有 bit 常數、`DEFAULT_FEATURE_MASK`、`ALL_FEATURES_MASK`、`hasFeature(mask, bit)` 工具函數。

### 修改：`src/lib/front-features.ts`

`resolveFrontFeatures(settings)` 改為：

```ts
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
```

`FrontFeatures` interface 不變，所有 page/component 不需修改。

### 修改：`src/lib/settings.ts`

- 移除 8 個 boolean field
- 新增 `featureMask: number` 和 `featureLicenseMask: number`
- 更新 `defaultSettings` 對應預設值

---

## Admin UI

### 現有「功能開關」區塊（SettingsLayout.svelte）

- 8 個 checkbox，value 來自 `featureMask`
- 若對應 bit 在 `featureLicenseMask` 中為 0：checkbox **disabled**，顯示鎖頭 icon，tooltip「此功能未在您的方案中啟用」
- 儲存時送 `featureMask` 到 settings API

### 新增 Superadmin 專屬區塊

- 僅當 session `role === 'superadmin'` 時渲染
- 獨立區塊標題：「授權管理」
- 同樣 8 個開關，控制 `featureLicenseMask`
- 視覺上與 admin 區塊明顯區隔（邊框或背景色差異）
- 儲存時送 `featureLicenseMask` 到 settings API

---

## Server-side 保護

### Settings API（`src/pages/api/admin/settings.ts`）

- `featureMask`：任何已登入 admin 可寫
- `featureLicenseMask`：`user.role !== 'superadmin'` 時回傳 403，不處理該欄位

### 功能型 API

| Endpoint | 要檢查的 bit |
|----------|-------------|
| `POST /api/sell.ts` | `FEATURE_SELL_INQUIRY` |

聯絡頁無提交 API（純資訊展示）。Compare、About、Video、Social 為純展示功能，一律不需 API 層保護。

---

## 遷移策略

新增 `src/lib/migrate-features.ts`，在 server 啟動時執行一次：

1. 檢查 `featureMask` 是否已存在於 DB
2. 若不存在，讀取舊 8 個 boolean key，計算對應 bitmask 值
3. 寫入 `featureMask`（用舊值換算）和 `featureLicenseMask`（255，全開）
4. 刪除舊 boolean key
5. 若 `featureMask` 已存在，跳過（冪等）

遷移在 `src/middleware.ts` 的啟動流程中呼叫（懶惰初始化，首次請求時執行一次）。

---

## 不在本次範圍

- 授權到期（expiresAt）：未來需要時再加，架構已留擴充空間
- 多 instance 中央控制台：各 instance 獨立，superadmin 分別登入管理
- Tier 標籤顯示（Basic/Pro）：純計費邏輯，不進 DB

---

## 影響檔案清單

| 檔案 | 動作 |
|------|------|
| `src/lib/features.ts` | 新增（bit 常數、hasFeature） |
| `src/lib/front-features.ts` | 修改（resolveFrontFeatures 改用 bitmask） |
| `src/lib/settings.ts` | 修改（移除舊 boolean，新增兩個 integer field） |
| `src/lib/migrate-features.ts` | 新增（一次性遷移邏輯） |
| `src/components/admin/SettingsLayout.svelte` | 修改（checkbox 改用 mask，新增 superadmin 區塊） |
| `src/pages/api/admin/settings.ts` | 修改（保護 featureLicenseMask，只允許 superadmin） |
| `src/middleware.ts` | 修改（首次請求時呼叫 migrate-features） |
| `src/pages/api/sell.ts` | 修改（加 FEATURE_SELL_INQUIRY bit 檢查） |
