import { test } from '@playwright/test';
import { devices } from '@playwright/test';

const mobile = devices['iPhone 14'];

const ADMIN_PAGES = [
  { url: '/admin', name: '08-admin概覽' },
  { url: '/admin/vehicles', name: '09-admin車輛' },
  { url: '/admin/brands', name: '10-admin品牌' },
  { url: '/admin/settings/gallery', name: '11-admin照片模式' },
  { url: '/admin/settings/smtp', name: '12-admin通知' },
  { url: '/admin/users', name: '13-admin用戶' },
];

test('mobile admin pages', async ({ browser }) => {
  const ctx = await browser.newContext({ ...mobile });
  const page = await ctx.newPage();

  // Login with form submission
  await page.goto('http://localhost:4321/admin/login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin1234');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Verify logged in
  const url = page.url();
  if (url.includes('login')) {
    console.log('Login failed, URL:', url);
    return;
  }
  console.log('Logged in, at:', url);

  for (const p of ADMIN_PAGES) {
    await page.goto(`http://localhost:4321${p.url}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `test-results/m-${p.name}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
    const hasContent = (await page.locator('.admin-main, .admin-page, h1').count()) > 0;
    console.log(`${p.name}: ${overflow ? '❌ OVERFLOW' : '✅'} content:${hasContent ? '✅' : '❌'}`);
  }
  await ctx.close();
});
