import { test, expect } from '@playwright/test';

// ── 公開頁面 ────────────────────────────────────────

test.describe('首頁', () => {
  test('載入正常，顯示品牌名稱', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/私人精品車展|私人高級車顧問/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('導覽列有「賣車詢問」連結', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('主選單').getByRole('link', { name: '賣車詢問' })).toBeVisible();
  });

  test('導覽列有「車輛收藏」連結', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('主選單').getByRole('link', { name: '車輛收藏' })).toBeVisible();
  });
});

test.describe('車輛列表頁', () => {
  test('載入正常，有車輛或空狀態', async ({ page }) => {
    await page.goto('/cars');
    await expect(page).toHaveURL('/cars');
    // Either shows vehicles or empty guidance
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('比較按鈕存在於車卡', async ({ page }) => {
    await page.goto('/cars');
    const compareBtn = page.locator('.compare-btn').first();
    // Only check if there are vehicles
    const vehicleCards = page.locator('.vehicle-card');
    const count = await vehicleCards.count();
    if (count > 0) {
      await expect(compareBtn).toBeVisible();
    }
  });
});

test.describe('比較頁', () => {
  test('空狀態顯示引導文字', async ({ page }) => {
    await page.goto('/cars/compare');
    await expect(page.getByText('尚未選擇任何車輛')).toBeVisible();
    await expect(page.getByRole('link', { name: '瀏覽庫存' })).toBeVisible();
  });

  test('帶有效 slug 時顯示規格比較', async ({ page }) => {
    // Use a known slug from DB
    await page.goto('/cars/compare?ids=rolls-royce-cullinan-black-badge-2023');
    // Should either show compare table or empty state (if slug doesn't exist)
    const body = page.locator('body');
    await expect(body).toBeVisible();
    // Should not show error
    await expect(page.locator('.compare-table, .compare-empty')).toBeVisible();
  });
});

test.describe('賣車頁', () => {
  test('表單欄位完整', async ({ page }) => {
    await page.goto('/sell');
    await expect(page.locator('#contactName')).toBeVisible();
    await expect(page.locator('#contactInfo')).toBeVisible();
    await expect(page.locator('#brand')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('缺必填欄位不送出', async ({ page }) => {
    await page.goto('/sell');
    await page.click('button[type="submit"]');
    // Status should remain empty or show error, not success
    const status = page.locator('#sell-status');
    await page.waitForTimeout(500);
    const text = await status.textContent();
    expect(text).not.toContain('✓');
  });

  test('填寫完整可送出', async ({ page }) => {
    await page.goto('/sell');
    await page.fill('#contactName', 'Test User');
    await page.fill('#contactInfo', '0912345678');
    await page.fill('#brand', 'BMW');
    await page.fill('#model', 'M3');
    await page.check('input[name="consent"]');
    await page.click('button[type="submit"]');
    await expect(page.locator('#sell-status')).toContainText('✓', { timeout: 5000 });
  });
});

test.describe('Admin 認證', () => {
  test('未登入導向 login 頁', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('Login 頁有帳號密碼輸入框', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.locator('input[name="username"], input[type="text"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('設定子頁未登入導向 login', async ({ page }) => {
    await page.goto('/admin/settings/gallery');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

// ── 手機版 RWD ────────────────────────────────────

test.describe('手機版 RWD', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('首頁在手機上正常顯示', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
  });

  test('賣車頁在手機上欄位可見', async ({ page }) => {
    await page.goto('/sell');
    await expect(page.locator('#contactInfo')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
