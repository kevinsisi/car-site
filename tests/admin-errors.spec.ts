import { test } from '@playwright/test';

async function login(page: any) {
  await page.goto('/admin/login');
  await page.fill('input[name="username"], input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/);
}

const PAGES = [
  '/admin/brands',
  '/admin/videos',
  '/admin/sell-inquiries',
  '/admin/settings/gallery',
  '/admin/settings/smtp',
  '/admin/users',
];

test('capture JS errors on blank pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });

  await login(page);

  for (const url of PAGES) {
    errors.length = 0;
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const main = await page.locator('.admin-main').innerText().catch(() => '');
    const hasRealContent = main.replace(/\s/g, '').length > 20;
    console.log(`\n=== ${url} ===`);
    console.log('Has content:', hasRealContent);
    console.log('Main text:', main.trim().slice(0, 120));
    if (errors.length) console.log('ERRORS:', errors.join('\n'));
    else console.log('No JS errors');
  }
});
