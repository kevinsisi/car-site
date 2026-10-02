import { chromium } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const [beforeOrigin, afterOrigin, outputDir] = process.argv.slice(2);
if (!beforeOrigin || !afterOrigin || !outputDir) throw new Error('Usage: node scripts/audit-ui-layout.mjs <before-origin> <after-origin> <output-dir>');
const widths = [375, 768, 1024, 1280, 1440];
const pages = [{ path: '/', name: 'home' }, { path: '/cars', name: 'cars' }];
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = new Map();

try {
  for (const [stage, origin] of [['before', beforeOrigin], ['after', afterOrigin]]) {
    await mkdir(path.join(outputDir, stage), { recursive: true });
    for (const width of widths) {
      for (const target of pages) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
        await page.goto(new URL(target.path, origin).toString(), { waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(outputDir, stage, `${target.name}-${width}.png`), fullPage: true });
        const measured = await page.evaluate(() => {
        const root = document.documentElement;
        const links = [...document.querySelectorAll('.site-nav a')];
        const navBroken = links.some((link) => {
          const rect = link.getBoundingClientRect();
          const style = getComputedStyle(link);
          const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
          return rect.height > lineHeight * 1.35 || style.whiteSpace !== 'nowrap';
        });
        const cards = [...document.querySelectorAll('.vehicle-card')];
        let overlap = false;
        const heights = cards.map((card) => {
          const detail = card.querySelector('.card-footer span:last-child')?.getBoundingClientRect();
          const compare = card.querySelector('.compare-btn')?.getBoundingClientRect();
          if (detail && compare && detail.width && compare.width) {
            overlap ||= detail.left < compare.right && detail.right > compare.left && detail.top < compare.bottom && detail.bottom > compare.top;
          }
          return { top: card.getBoundingClientRect().top, height: card.getBoundingClientRect().height };
        });
        const rowHeights = [];
        for (const item of heights) {
          const row = rowHeights.find((candidate) => Math.abs(candidate.top - item.top) < 3);
          if (row) row.values.push(item.height);
          else rowHeights.push({ top: item.top, values: [item.height] });
        }
        const rowHeightVariance = rowHeights.some((row) => row.values.length > 1 && Math.max(...row.values) - Math.min(...row.values) > 1);
        return {
          overflow: root.scrollWidth > root.clientWidth,
          navBroken,
          overlap,
          rowHeightVariance,
          cards: cards.length,
          navLinks: links.length,
        };
        });
        results.set(`${width}-${target.name}`, { width, page: target.name, ...(results.get(`${width}-${target.name}`) || {}), [stage]: measured });
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}

const comparison = [...results.values()].map(({ width, page, before, after }) => ({
  width,
  page,
  before: `overflow=${before.overflow} nav=${before.navBroken} overlap=${before.overlap} row-height=${before.rowHeightVariance}`,
  after: `overflow=${after.overflow} nav=${after.navBroken} overlap=${after.overlap} row-height=${after.rowHeightVariance}`,
  cards: `${before.cards} → ${after.cards}`,
}));
console.table(comparison);
if ([...results.values()].some(({ after }) => after.overflow || after.navBroken || after.overlap || after.rowHeightVariance)) process.exitCode = 1;
