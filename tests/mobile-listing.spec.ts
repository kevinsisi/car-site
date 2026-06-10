import { test } from '@playwright/test';
import { devices } from '@playwright/test';

test('cars listing mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/cars');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/listing-mobile.png', fullPage: false });
  await ctx.close();
});
