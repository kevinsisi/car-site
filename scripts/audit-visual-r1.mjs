import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from '@playwright/test';

const sourceRoot = process.cwd();
const outputDir = path.join(sourceRoot, '.tmp-ui-shots/r1');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mita-visual-r1-'));
const projectRoot = path.join(tempRoot, 'project');
const persistTo = path.join(tempRoot, 'd1');
const widths = [375, 768, 1024, 1280, 1440];
const pages = [
  { path: '/', name: 'home' },
  { path: '/cars', name: 'cars' },
  { path: '/cars/B182', name: 'detail' },
  { path: '/404', name: '404' },
  { path: '/__missing_visual_r1__', name: 'missing-route' },
  { path: '/cars/__missing_r1__', name: 'missing-car' },
  { path: '/visual-r1-throw', name: '500' },
];

function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function getRealVehicleImages() {
  const response = await fetch('https://mita.sisihome.org/cars');
  assert.equal(response.status, 200, 'public vehicle listing GET must succeed');
  const html = await response.text();
  const $ = cheerio.load(html);
  const urls = [...new Set($('article.vehicle-card img').map((_, img) => $(img).attr('src')).get()
    .filter((src) => src?.startsWith('/media/vehicle/')))]
    .slice(0, 12)
    .map((src) => new URL(src, 'https://mita.sisihome.org').toString());
  assert.ok(urls.length >= 8, `expected 8–12 public vehicle image URLs, got ${urls.length}`);
  const vehicles = $('article.vehicle-card').toArray().map((card) => ({
    href: $(card).find('a[href^="/cars/"]').attr('href') || '',
    title: $(card).find('h2').first().text().trim(),
    brand: $(card).find('.vehicle-card__eyebrow-row .eyebrow').text().trim() || '典藏車款',
  })).filter((item) => item.href && item.title);
  const homeResponse = await fetch('https://mita.sisihome.org/');
  assert.equal(homeResponse.status, 200, 'public homepage GET must succeed');
  const home = cheerio.load(await homeResponse.text());
  const siteClasses = $('html').attr('class') || '';
  const classValue = (prefix, fallback) => siteClasses.split(/\s+/).find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
  const siteName = $('.brand-mark').text().trim() || '私人精品車展';
  const storeAddress = $('.site-address__text').text().trim();
  const lineUrl = $('.site-cta__link--line').attr('href') || 'https://line.me/';
  const phoneNumber = ($('.site-cta__link--phone').attr('href') || 'tel:+886900000000').replace(/^tel:/, '');
  return {
    urls,
    vehicles,
    siteName,
    storeAddress,
    lineUrl,
    phoneNumber,
    activeTemplate: classValue('template-', 'private-salon'),
    activeStyle: classValue('style-', 'carsmeet-blue'),
    homepageEyebrow: home('.hero__copy .eyebrow').first().text().trim(),
    homepageTitle: home('.hero__copy h1').first().text().trim(),
    homepageLead: home('.hero__lead').first().text().trim(),
    homepageBadge: home('.hero__badge').first().text().trim(),
    featuredEyebrow: home('.section-heading--featured .eyebrow').first().text().trim(),
    featuredTitle: home('.section-heading--featured h2').first().text().trim(),
    listingEyebrow: $('.page-hero .eyebrow').first().text().trim(),
    listingTitle: $('.page-hero h1').first().text().trim(),
    listingLead: $('.page-hero p:not(.eyebrow)').first().text().trim(),
  };
}

async function writeFixtureSql(images, publicVehicles, publicSite) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const now = '2026-01-01T00:00:00.000Z';
  const rows = [];
  for (let index = 0; index < 73; index++) {
    const live = publicVehicles[index % publicVehicles.length];
    const slug = index === 0 ? 'B182' : index < publicVehicles.length ? live.href.split('/').at(-1) : `r1-fixture-${index}`;
    const title = live.title;
    const year = String(2018 + (index % 8));
    const mileage = ['26000km', '10000 km', '42,500 KM', '里程待確認'][index % 4];
    const condition = index === 2 ? '車況良好，定期原廠保養，內裝維持整潔，無重大事故紀錄' : '原廠保養';
    const id = `visual-r1-${String(index).padStart(2, '0')}`;
    rows.push(`INSERT INTO vehicles (id,slug,title,brand,model,year,mileage,condition,status,monthly_recommended,created_at,updated_at) VALUES (${quote(id)},${quote(slug)},${quote(title)},${quote(live.brand)},${quote(title.split(' ').slice(1).join(' ') || '典藏車款')},${quote(year)},${quote(mileage)},${quote(condition)},'published',${index < 9 ? 1 : 0},${quote(now)},${quote(now)});`);
    if (index < images.length) {
      const imageUrl = images[index];
      rows.push(`INSERT INTO vehicle_images (id,vehicle_id,url,alt,sort_order,is_cover,created_at) VALUES (${quote(`visual-r1-image-${index}`)},${quote(id)},${quote(imageUrl)},${quote(`${title} 實拍`)},0,1,${quote(now)});`);
    }
  }
  const settings = {
    siteName: publicSite.siteName,
    activeTemplate: publicSite.activeTemplate,
    activeStyle: publicSite.activeStyle,
    heroVehicleSlug: 'B182',
    featuredCount: '6',
    galleryMode: 'thumbnail-strip',
    homepageEyebrow: publicSite.homepageEyebrow,
    homepageTitle: publicSite.homepageTitle,
    homepageLead: publicSite.homepageLead,
    homepageBadge: publicSite.homepageBadge,
    featuredEyebrow: publicSite.featuredEyebrow,
    featuredTitle: publicSite.featuredTitle,
    listingEyebrow: publicSite.listingEyebrow,
    listingTitle: publicSite.listingTitle,
    listingLead: publicSite.listingLead,
    storeAddress: publicSite.storeAddress,
    lineUrl: publicSite.lineUrl,
    phoneNumber: publicSite.phoneNumber,
    showSoldVehicles: 'false',
  };
  rows.push(`INSERT INTO site_settings (key,value,updated_at) VALUES ${Object.entries(settings).map(([key, value]) => `(${quote(key)},${quote(value)},${quote(now)})`).join(',')};`);
  const file = path.join(persistTo, 'visual-r1-fixtures.sql');
  await writeFile(file, rows.join('\n'));
  return file;
}

let worker;
let workerOutput = '';
let browser;
const measurements = [];
const statuses = [];
const vitals = [];
try {
  await mkdir(outputDir, { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  await mkdir(persistTo, { recursive: true });
  await cp(sourceRoot, projectRoot, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(sourceRoot, source);
      const excluded = new Set(['.git', 'node_modules', 'dist', '.astro', '.wrangler', 'data', '.agents', '.claude', '.gemini', '.opencode', '.github', '.tmp-ui-shots']);
      const first = relative.split(path.sep)[0];
      return !excluded.has(first) && relative !== 'AGENTS.md' && !relative.startsWith('.env');
    },
  });
  await symlink(path.join(sourceRoot, 'node_modules'), path.join(projectRoot, 'node_modules'), 'dir');

  const live = await getRealVehicleImages();
  const fixtureFile = await writeFixtureSql(live.urls, live.vehicles, live);
  const temp500 = path.join(projectRoot, 'src/pages/visual-r1-throw.astro');
  await writeFile(temp500, `---\nthrow new Error('local visual audit 500');\n---\n`);
  run('npm', ['run', 'build:workers']);
  console.log('Build: npm run build:workers -> passed');
  await rm(temp500);

  const wrangler = path.join(projectRoot, 'node_modules/.bin/wrangler');
  const wranglerConfig = path.join(projectRoot, 'wrangler.toml');
  const configArgs = ['--local', '--persist-to', persistTo, '--config', wranglerConfig, '--env', 'preview'];
  run(wrangler, ['d1', 'migrations', 'apply', 'DB_PREVIEW', ...configArgs]);
  run(wrangler, ['d1', 'execute', 'DB_PREVIEW', ...configArgs, '--file', fixtureFile]);
  const port = await unusedPort();
  worker = spawn(wrangler, ['dev', '--local', '--persist-to', persistTo, '--config', wranglerConfig, '--env', 'preview', '--port', String(port), '--var', 'SESSION_SECRET:visual-r1-local-only', '--log-level', 'info'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [worker.stdout, worker.stderr]) stream.setEncoding('utf8').on('data', (chunk) => { workerOutput += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`Wrangler exited ${worker.exitCode}:\n${workerOutput}`);
    try {
      const response = await fetch(`${origin}/cdn-cgi/health-check`);
      if (response.status < 500) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.ok(Date.now() < deadline, `Wrangler did not start:\n${workerOutput}`);
  const headStatuses = [
    { path: '/404', expected: 404 },
    { path: '/cars/__missing_r1__', expected: 404 },
    { path: '/visual-r1-throw', expected: 500 },
  ].map(({ path: pathname, expected }) => {
    const headers = run('curl', ['-sS', '-I', `http://127.0.0.1:${port}${pathname}`]);
    const status = Number(headers.match(/^HTTP\/\S+\s+(\d+)/m)?.[1] || 0);
    assert.equal(status, expected, `curl -I ${pathname} status`);
    return { method: 'HEAD', path: pathname, status };
  });
  console.log('HTTP status verification via curl -I:');
  console.table(headStatuses);

  browser = await chromium.launch({ headless: true });
  for (const width of widths) {
    for (const target of pages) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width <= 768, hasTouch: width <= 768, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const responseBytes = { total: 0, font: 0, seen: new Set() };
      page.on('response', (response) => {
        void response.allHeaders().then((headers) => {
          if (responseBytes.seen.has(response.url())) return;
          responseBytes.seen.add(response.url());
          const size = Number(headers['content-length'] || 0);
          responseBytes.total += size;
          if (new URL(response.url()).pathname.endsWith('/fonts/dm-sans-latin.woff2')) responseBytes.font += size;
        });
      });
      await page.addInitScript(() => {
        window.__visualR1 = { lcp: 0, cls: 0 };
        try {
          new PerformanceObserver((list) => {
            const latest = list.getEntries().at(-1);
            if (latest) window.__visualR1.lcp = latest.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__visualR1.cls += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
      });
      const url = new URL(target.path, origin).toString();
      const navigation = await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
      const status = navigation?.status() || 0;
      statuses.push({ width, page: target.name, status });
      if (target.name === 'missing-car') assert.equal(status, 404, 'unknown car slug must preserve HTTP 404');
      if (target.name === '500') assert.equal(status, 500, 'temporary throwing route must render the custom HTTP 500 page');
      if (target.name === '404') assert.equal(status, 404, '/404 must preserve HTTP 404');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (['home', 'cars'].includes(target.name) && [375, 1280].includes(width)) {
        const metric = await page.evaluate(() => window.__visualR1);
        vitals.push({ width, page: target.name, lcpMs: Math.round(metric.lcp), cls: Number(metric.cls.toFixed(4)), responseBytes: responseBytes.total, fontBytes: responseBytes.font });
      }
      await page.evaluate(async () => {
        const firstCardImages = [...document.querySelectorAll('.vehicle-card__media img')].slice(0, 12);
        await Promise.all(firstCardImages.map((image) => {
          image.loading = 'eager';
          return image.decode().catch(() => undefined);
        }));
      });
      await page.screenshot({ path: path.join(outputDir, `${target.name}-${width}.png`), fullPage: true });
      const result = await page.evaluate(() => {
        const root = document.documentElement;
        const viewportWidth = root.clientWidth;
        const visible = [...document.body.querySelectorAll('*')].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        });
        const offenders = visible.filter((element) => element.getBoundingClientRect().right > viewportWidth + 1);
        const nav = [...document.querySelectorAll('.site-nav a')];
        const menu = document.querySelector('.site-menu-toggle');
        if (menu && getComputedStyle(menu).display !== 'none') menu.click();
        const navTextLines = nav.map((link) => {
          const range = document.createRange();
          range.selectNodeContents(link);
          return range.getClientRects().length;
        });
        const navTouchTargetsOk = !menu || getComputedStyle(menu).display === 'none' || (menu.getBoundingClientRect().height >= 44 && nav.every((link) => link.getBoundingClientRect().height >= 44));
        const cards = [...document.querySelectorAll('.vehicle-card')];
        let actionOverlap = false;
        let undersizedAction = false;
        const cardRects = cards.map((card) => {
          const rect = card.getBoundingClientRect();
          const detail = card.querySelector('.vehicle-card__details')?.getBoundingClientRect();
          const compare = card.querySelector('.compare-btn')?.getBoundingClientRect();
          if (detail && compare && detail.width && compare.width) {
            actionOverlap ||= detail.left < compare.right && detail.right > compare.left && detail.top < compare.bottom && detail.bottom > compare.top;
            undersizedAction ||= detail.height < 44 || compare.height < 44;
          }
          return { top: rect.top, height: rect.height, actionsTop: card.querySelector('.card-footer')?.getBoundingClientRect().top || 0 };
        });
        const rows = [];
        for (const rect of cardRects) {
          const row = rows.find((candidate) => Math.abs(candidate.top - rect.top) < 3);
          if (row) row.items.push(rect);
          else rows.push({ top: rect.top, items: [rect] });
        }
        const rowHeightDiff = Math.max(0, ...rows.map((row) => Math.max(...row.items.map((item) => item.height)) - Math.min(...row.items.map((item) => item.height))));
        const actionYDiff = Math.max(0, ...rows.map((row) => Math.max(...row.items.map((item) => item.actionsTop)) - Math.min(...row.items.map((item) => item.actionsTop))));
        const images = [...document.querySelectorAll('.vehicle-card__media img, .detail-cover img, .gallery-slider__slide.is-active img, .gallery-strip__main img')];
        const loadedImages = images.filter((image) => image.complete && image.naturalWidth > 0).length;
        return {
          documentOverflow: root.scrollWidth > root.clientWidth,
          overflowElements: offenders.length,
          overflowNames: offenders.map((element) => `${element.tagName.toLowerCase()}.${String(element.className?.baseVal || element.className || '').trim().replaceAll(/\s+/g, '.')}`),
          navLinesMax: Math.max(0, ...navTextLines),
          navLinks: nav.length,
          navTouchTargetsOk,
          actionOverlap,
          undersizedAction,
          rowHeightDiff: Number(rowHeightDiff.toFixed(1)),
          actionYDiff: Number(actionYDiff.toFixed(1)),
          cards: cards.length,
          visibleImages: images.length,
          loadedImages,
          vitals: window.__visualR1,
        };
      });
      measurements.push({ width, page: target.name, ...result });
      await context.close();
    }
  }
  console.log('Status codes:');
  console.table(statuses);
  console.log('Layout measurements:');
  console.table(measurements.map(({ width, page, documentOverflow, overflowElements, overflowNames, navLinesMax, navTouchTargetsOk, actionOverlap, undersizedAction, rowHeightDiff, actionYDiff, cards, loadedImages, visibleImages }) => ({ width, page, documentOverflow, overflowElements, overflowNames: overflowNames.join(', '), navLinesMax, navTouchTargetsOk, actionOverlap, undersizedAction, rowHeightDiff, actionYDiff, cards, images: `${loadedImages}/${visibleImages}` })));
  console.log('LCP / CLS / response-size:');
  console.table(vitals);
  console.log('Real image URLs used in local fixtures:', live.urls.length);
  assert.ok(measurements.every((row) => !row.documentOverflow && row.overflowElements === 0), 'visible elements and document bounds must stay within viewport');
  assert.ok(measurements.every((row) => row.navLinesMax <= 1), 'navigation labels must render on one line');
  assert.ok(measurements.filter((row) => row.width <= 768).every((row) => row.navTouchTargetsOk), 'mobile menu controls must be at least 44px high');
  assert.ok(measurements.every((row) => !row.actionOverlap && !row.undersizedAction), 'card actions must not overlap and must be at least 44px high');
  assert.ok(measurements.every((row) => row.rowHeightDiff <= 1 && row.actionYDiff <= 1), 'cards and action rows in each grid row must align');
  assert.ok(measurements.filter((row) => ['home', 'cars', 'detail'].includes(row.page)).every((row) => row.loadedImages > 0), 'public page fixture images must load');
  console.log('Layout assertions passed: 35 routes/viewports, 0 overflow, single-line nav, aligned non-overlapping card actions.');
} finally {
  if (browser) await browser.close();
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise((resolve) => worker.once('exit', resolve));
  }
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`Screenshots saved in ${outputDir}`);
