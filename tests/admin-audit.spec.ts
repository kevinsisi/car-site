import { test, expect } from '@playwright/test';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin1234';

async function login(page: any) {
  await page.goto('/admin/login');
  await page.fill('input[name="username"], input[type="text"]', ADMIN_USER);
  await page.fill('input[type="password"]', ADMIN_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/);
}

const PAGES = [
  { url: '/admin', name: '概覽' },
  { url: '/admin/vehicles', name: '車輛管理' },
  { url: '/admin/brands', name: '品牌管理' },
  { url: '/admin/videos', name: '影片管理' },
  { url: '/admin/sell-inquiries', name: '賣車申請' },
  { url: '/admin/settings/basic', name: '基本設定' },
  { url: '/admin/settings/layout', name: '版型設定' },
  { url: '/admin/settings/gallery', name: '照片模式' },
  { url: '/admin/settings/smtp', name: 'SMTP通知' },
  { url: '/admin/users', name: '用戶管理' },
  { url: '/admin/account', name: '帳號設定' },
];

test('admin full audit', async ({ page }) => {
  await login(page);

  for (const p of PAGES) {
    await page.goto(p.url);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test-results/admin-${p.name}.png`, fullPage: true });

    // Check page has visible content (not blank)
    const bodyText = await page.locator('body').innerText();
    const hasContent = bodyText.trim().length > 50;
    console.log(`${p.name}: ${hasContent ? '✅ has content' : '❌ BLANK'} (${bodyText.trim().slice(0, 80)})`);

    // Check for JS errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    if (errors.length) console.log(`  JS errors: ${errors.join(', ')}`);
  }
});
