import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from '@playwright/test';

const sourceRoot = process.cwd();
const outputDir = path.join(sourceRoot, '.tmp-ui-shots/r2');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mita-visual-r2-'));
const projectRoot = path.join(tempRoot, 'project');
const persistTo = path.join(tempRoot, 'd1');
const widths = [375, 768, 1024, 1280, 1440];
const pages = [
  { path: '/', name: 'home' },
  { path: '/cars', name: 'cars' },
  { path: '/cars/__missing_r2__', name: 'missing-car' },
  { path: '/cars/B182', name: 'detail' },
  { path: '/cars/r2-no-image', name: 'detail-empty-media' },
  { path: '/cars?q=__r2_missing__', name: 'cars-empty' },
  { path: '/cars', name: 'cars-filter-open', state: 'filter-open' },
  { path: '/cars/compare', name: 'compare-empty' },
  { path: '/cars/compare?ids=B182,B181', name: 'compare-selected' },
  { path: '/cars/compare', name: 'compare-search-empty', state: 'search-empty' },
  { path: '/cars/B182', name: 'detail-lightbox', state: 'lightbox' },
  { path: '/', name: 'comparebar-home', compareSlugs: ['B182', 'B181'] },
  { path: '/cars/B182', name: 'detail-comparebar', compareSlugs: ['B182', 'B181'] },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/sell', name: 'sell' },
  { path: '/sell', name: 'sell-invalid', state: 'sell-invalid' },
  { path: '/404', name: '404' },
  { path: '/visual-r2-throw', name: '500' },
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
    const slug = index === 0 ? 'B182' : index === 72 ? 'r2-no-image' : index < publicVehicles.length ? live.href.split('/').at(-1) : `r2-fixture-${index}`;
    const title = live.title;
    const year = String(2018 + (index % 8));
    const mileage = ['26000km', '10000 km', '42,500 KM', '里程待確認'][index % 4];
    const condition = index === 2 ? '車況良好，定期原廠保養，內裝維持整潔，無重大事故紀錄' : '原廠保養';
    const id = `visual-r2-${String(index).padStart(2, '0')}`;
    rows.push(`INSERT INTO vehicles (id,slug,title,brand,model,year,mileage,condition,status,monthly_recommended,created_at,updated_at) VALUES (${quote(id)},${quote(slug)},${quote(title)},${quote(live.brand)},${quote(title.split(' ').slice(1).join(' ') || '典藏車款')},${quote(year)},${quote(mileage)},${quote(condition)},'published',${index < 9 ? 1 : 0},${quote(now)},${quote(now)});`);
    if (index < images.length) {
      const imageUrl = images[index];
      rows.push(`INSERT INTO vehicle_images (id,vehicle_id,url,alt,sort_order,is_cover,created_at) VALUES (${quote(`visual-r2-image-${index}`)},${quote(id)},${quote(imageUrl)},${quote(`${title} 實拍`)},0,1,${quote(now)});`);
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
  const file = path.join(persistTo, 'visual-r2-fixtures.sql');
  await writeFile(file, rows.join('\n'));
  return file;
}

let worker;
let workerOutput = '';
let browser;
const measurements = [];
const transferMeasurements = [];
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
  const temp500 = path.join(projectRoot, 'src/pages/visual-r2-throw.astro');
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
  for (const pathname of ['/404', '/cars/__missing_r2__', '/visual-r2-throw', '/cars/compare', '/about', '/contact', '/sell']) {
    const headers = run('curl', ['-sS', '-I', `${origin}${pathname}`]);
    const status = Number(headers.match(/^HTTP\/\S+\s+(\d+)/m)?.[1] || 0);
    console.log(`$ curl -I ${origin}${pathname}\n${headers.trimEnd()}`);
    const expected = pathname === '/404' || pathname === '/cars/__missing_r2__' ? 404 : pathname === '/visual-r2-throw' ? 500 : 200;
    assert.equal(status, expected, `curl -I ${pathname} status`);
  }
  browser = await chromium.launch({ headless: true });
  for (const width of widths) {
    for (const target of pages) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width <= 768, hasTouch: width <= 768, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const responseBytes = { total: 0, font: 0, seen: new Set(), resources: new Map() };
      page.on('response', (response) => {
        void response.allHeaders().then((headers) => {
          if (responseBytes.seen.has(response.url())) return;
          responseBytes.seen.add(response.url());
          const size = Number(headers['content-length'] || 0);
          responseBytes.total += size;
          const url = new URL(response.url());
          const type = headers['content-type'] || '';
          responseBytes.resources.set(url.pathname, { bytes: size, type });
          if (url.pathname.endsWith('/fonts/dm-sans-latin.woff2')) responseBytes.font += size;
        });
      });
      let formPostCount = 0;
      page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/sell') formPostCount++; });
      if (target.name.startsWith('sell')) await page.route('**/api/sell', (route) => route.abort());
      if (target.compareSlugs) {
        await page.addInitScript((slugs) => {
          localStorage.setItem('compare_slugs', JSON.stringify(slugs));
          localStorage.setItem('compare_meta', JSON.stringify(Object.fromEntries(slugs.map((slug) => [slug, { title: slug, thumb: '' }]))));
        }, target.compareSlugs);
      }
      await page.addInitScript(() => {
        window.__visualR2 = { lcp: 0, cls: 0 };
        try {
          new PerformanceObserver((list) => {
            const latest = list.getEntries().at(-1);
            if (latest) window.__visualR2.lcp = latest.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__visualR2.cls += entry.value;
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
      });
      const url = new URL(target.path, origin).toString();
      const navigation = await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
      const status = navigation?.status() || 0;
      statuses.push({ width, page: target.name, status });
      if (target.name === '404') assert.equal(status, 404, '/404 must preserve HTTP 404');
      if (target.name === '500') assert.equal(status, 500, 'throwing route must preserve HTTP 500');
      if (target.name === 'missing-car') assert.equal(status, 404, 'unknown car slug must preserve HTTP 404');
      if (target.name === 'cars-empty') assert.equal(status, 200, 'empty listing must preserve HTTP 200');
      if (target.name === 'detail-empty-media') assert.equal(status, 200, 'no-image detail must preserve HTTP 200');
      const listingImagePolicy = await page.locator('.listing-grid .vehicle-card__media img').evaluateAll((images) => images.slice(0, 6).map((image) => ({
        src: image.getAttribute('src') || '',
        loading: image.loading,
        fetchpriority: image.getAttribute('fetchpriority') || 'auto',
        sizes: image.sizes,
        srcset: image.srcset,
      })));
      if (target.state === 'filter-open' && await page.locator('.filter-toggle').isVisible()) await page.locator('.filter-toggle').click();
      if (target.state === 'search-empty') {
        await page.locator('#compare-search').fill('__r2_no_such_vehicle__');
        await page.waitForTimeout(100);
      }
      if (target.state === 'sell-invalid') {
        await page.locator('#contactName').evaluate((input) => input.setAttribute('aria-invalid', 'true'));
        await page.locator('#contactName').focus();
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const initialResponseBytes = responseBytes.total;
      if (['home', 'cars'].includes(target.name) && [375, 1280].includes(width)) {
        const metric = await page.evaluate(() => window.__visualR2);
        vitals.push({ width, page: target.name, lcpMs: Math.round(metric.lcp), cls: Number(metric.cls.toFixed(4)), responseBytes: responseBytes.total, fontBytes: responseBytes.font });
      }
      await page.evaluate(async () => {
        if (location.pathname === '/cars') {
          for (let top = 0; top < document.documentElement.scrollHeight; top += Math.max(400, innerHeight - 100)) {
            window.scrollTo(0, top);
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
          await Promise.all([...document.querySelectorAll('.vehicle-card__media img')].map((image) => image.decode().catch(() => undefined)));
          window.scrollTo(0, 0);
        }
      });
      if (target.name === 'cars' && [375, 1280].includes(width)) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(120);
        transferMeasurements.push({ width, initialBytes: initialResponseBytes, fullPageBytes: responseBytes.total, imageCount: [...responseBytes.resources.values()].filter((resource) => resource.type.startsWith('image/')).length });
      }
      await page.screenshot({ path: path.join(outputDir, `${target.name}-${width}-viewport.png`), fullPage: false });
      await page.screenshot({ path: path.join(outputDir, `${target.name}-${width}-full.png`), fullPage: true });
      let compareBarHeadingOverlap = null;
      if (target.state === 'lightbox') {
        const trigger = page.locator('[data-gallery-index]').first();
        if (await trigger.count()) {
          await trigger.click();
          await page.locator('.image-lightbox.is-open').waitFor({ state: 'visible' });
          await page.screenshot({ path: path.join(outputDir, `detail-lightbox-${width}-viewport.png`), fullPage: false });
          await page.screenshot({ path: path.join(outputDir, `detail-lightbox-${width}-full.png`), fullPage: true });
          await page.keyboard.press('Escape');
        }
      }
      if (target.name === 'comparebar-home' || target.name === 'detail-comparebar') {
        const headingSelector = target.name === 'comparebar-home' ? '.section-heading--featured h2' : '.detail-copy h1';
        const heading = page.locator(headingSelector);
        if (await heading.count()) {
          await heading.scrollIntoViewIfNeeded();
          compareBarHeadingOverlap = await page.evaluate((selector) => {
            const bar = document.querySelector('.compare-bar');
            const title = document.querySelector(selector);
            if (!bar || !title || getComputedStyle(bar).visibility === 'hidden') return false;
            const a = bar.getBoundingClientRect();
            const b = title.getBoundingClientRect();
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          }, headingSelector);
          await page.screenshot({ path: path.join(outputDir, `${target.name}-${width}-heading-viewport.png`), fullPage: false });
        }
      }
      let compareBarFooterOverlap = null;
      let compareBarBottomVisible = null;
      if (target.name === 'detail-comparebar' || target.name === 'comparebar-home') {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(100);
        compareBarBottomVisible = await page.evaluate(() => {
          const bar = document.querySelector('.compare-bar');
          if (!bar || bar.getAttribute('aria-hidden') === 'true' || getComputedStyle(bar).display === 'none') return false;
          const rect = bar.getBoundingClientRect();
          return rect.top < innerHeight && rect.bottom > 0;
        });
        compareBarFooterOverlap = await page.evaluate(() => {
          const bar = document.querySelector('.compare-bar');
          const footer = document.querySelector('.site-footer');
          if (!bar || !footer || getComputedStyle(bar).display === 'none') return false;
          const a = bar.getBoundingClientRect();
          return [...footer.querySelectorAll('p, a, small, strong, span, img')].some((content) => {
            const b = content.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          });
        });
        await page.screenshot({ path: path.join(outputDir, `${target.name}-${width}-bottom.png`), fullPage: false });
      }
      const result = await page.evaluate(({ state, listingImagePolicy }) => {
        const root = document.documentElement;
        const viewportWidth = root.clientWidth;
        const visible = [...document.body.querySelectorAll('*')].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        });
        const rightOverflow = visible.filter((element) => element.getBoundingClientRect().right > viewportWidth + 1);
        const excludedScrollSelectors = ['.compare-table-wrapper'];
        const scrollContainers = excludedScrollSelectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((container) => ({
          selector,
          right: Number(container.getBoundingClientRect().right.toFixed(1)),
          withinViewport: container.getBoundingClientRect().right <= viewportWidth,
        })));
        const hasAllowedScrollOwner = (element) => {
          let parent = element.parentElement;
          while (parent && parent !== document.body) {
            if (excludedScrollSelectors.some((selector) => parent.matches(selector))) {
              return parent.getBoundingClientRect().right <= viewportWidth;
            }
            parent = parent.parentElement;
          }
          return false;
        };
        const localScrollOverflow = rightOverflow.filter(hasAllowedScrollOwner);
        const offenders = rightOverflow.filter((element) => !hasAllowedScrollOwner(element));
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
        const specCellHeightDiff = Math.max(0, ...cards.map((card) => {
          const heights = [...card.querySelectorAll('.spec-item')].map((item) => item.getBoundingClientRect().height);
          return heights.length ? Math.max(...heights) - Math.min(...heights) : 0;
        }));
        const specValues = [...document.querySelectorAll('.vehicle-card .spec-copy strong')];
        const conditionValues = specValues.filter((value) => value.classList.contains('spec-value--condition'));
        const titledConditionValues = conditionValues.filter((value) => value.title === value.textContent?.trim() && getComputedStyle(value).whiteSpace === 'nowrap');
        const truncatedSpecs = specValues
          .filter((value) => value.scrollWidth > value.clientWidth + 1 && !titledConditionValues.includes(value))
          .map((value) => ({ text: value.textContent?.trim() || '', width: Number(value.clientWidth.toFixed(1)), scrollWidth: value.scrollWidth, whiteSpace: getComputedStyle(value).whiteSpace, overflow: getComputedStyle(value).overflow }));
        const images = [...document.querySelectorAll('.vehicle-card__media img, .detail-cover img, .gallery-slider__slide.is-active img, .gallery-strip__main img')];
        const loadedImages = images.filter((image) => image.complete && image.naturalWidth > 0).length;
        const compareBar = document.querySelector('.compare-bar');
        const compareBarRect = compareBar?.getBoundingClientRect();
        const compareBarVisible = Boolean(compareBar && compareBar.getAttribute('aria-hidden') !== 'true' && getComputedStyle(compareBar).visibility !== 'hidden' && compareBarRect && compareBarRect.top < innerHeight && compareBarRect.bottom > 0);
        const headings = [...document.querySelectorAll('h1, h2')].filter((heading) => {
          const rect = heading.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && getComputedStyle(heading).visibility !== 'hidden';
        });
        const compareBarCoversHeading = Boolean(compareBarVisible && compareBarRect && headings.some((heading) => {
          const rect = heading.getBoundingClientRect();
          return compareBarRect.left < rect.right && compareBarRect.right > rect.left && compareBarRect.top < rect.bottom && compareBarRect.bottom > rect.top;
        }));
        const formControls = [...document.querySelectorAll('.sell-form input:not([type="checkbox"]), .sell-form textarea, .sell-form select')];
        const focusTarget = document.querySelector('.sell-form input[name="contactName"]');
        if (state === 'sell-invalid' && focusTarget instanceof HTMLElement) focusTarget.focus();
        return {
          documentOverflow: root.scrollWidth > root.clientWidth,
          overflowElements: offenders.length,
          overflowNames: offenders.map((element) => `${element.tagName.toLowerCase()}.${String(element.className?.baseVal || element.className || '').trim().replaceAll(/\s+/g, '.')}`),
          localScrollOverflow: localScrollOverflow.length,
          excludedScrollContainers: scrollContainers,
          invalidScrollContainers: scrollContainers.filter((container) => !container.withinViewport),
          titledConditionValues: titledConditionValues.length,
          conditionValues: conditionValues.length,
          navLinesMax: Math.max(0, ...navTextLines),
          navLinks: nav.length,
          navTouchTargetsOk,
          actionOverlap,
          undersizedAction,
          rowHeightDiff: Number(rowHeightDiff.toFixed(1)),
          actionYDiff: Number(actionYDiff.toFixed(1)),
          specCellHeightDiff: Number(specCellHeightDiff.toFixed(1)),
          truncatedSpecValues: truncatedSpecs.length,
          truncatedSpecTexts: truncatedSpecs,
          cards: cards.length,
          visibleImages: images.length,
          loadedImages,
          compareBarPresent: Boolean(compareBar),
          compareBarHidden: !compareBar || compareBar.getAttribute('aria-hidden') === 'true' || getComputedStyle(compareBar).display === 'none' || getComputedStyle(compareBar).visibility === 'hidden',
          compareBarInViewport: compareBarVisible,
          compareBarCoversHeading,
          formControlsMinHeight: formControls.length ? Math.min(...formControls.map((control) => control.getBoundingClientRect().height)) : null,
          formFocusOutline: focusTarget ? getComputedStyle(focusTarget).outlineStyle : null,
          formInvalidBorder: focusTarget ? getComputedStyle(focusTarget).borderTopColor : null,
          listingImagePolicy,
          vitals: window.__visualR2,
        };
      }, { state: target.state || '', listingImagePolicy });
      measurements.push({
        width,
        page: target.name,
          formPostCount,
          listingImagePolicy,
        responseBytes: initialResponseBytes,
        fontBytes: responseBytes.font,
        compareBarFooterOverlap,
        compareBarBottomVisible,
        compareBarHeadingOverlap,
        ...result,
        imageResources: [...responseBytes.resources].filter(([, item]) => item.type.startsWith('image/')).map(([url, item]) => ({ url, bytes: item.bytes })),
      });
      if (target.name.startsWith('sell')) assert.equal(formPostCount, 0, 'audit did not submit the sell form');
      if (target.name === 'compare-empty') assert.ok(result.compareBarHidden, 'empty compare bar is visually hidden');
      if (target.name === 'compare-selected' && width <= 768) {
        const mobileCompare = await page.locator('.compare-mobile-card').evaluateAll((cards) => cards.map((card) => {
          const title = card.querySelector('.compare-mobile-card__title a[href^="/cars/"]');
          const image = card.querySelector('.compare-mobile-card__image');
          return { title: title?.textContent?.trim() || '', titleHeight: title?.clientHeight || 0, titleScrollHeight: title?.scrollHeight || 0, imageHeight: image?.getBoundingClientRect().height || 0 };
        }));
        assert.equal(mobileCompare.length, 2, 'both selected vehicles must render as mobile cards');
        assert.ok(mobileCompare.every((vehicle) => vehicle.title && vehicle.titleHeight >= vehicle.titleScrollHeight && vehicle.imageHeight > 0 && vehicle.imageHeight <= 150), `mobile compare titles must not clip and images must stay compact: ${JSON.stringify(mobileCompare)}`);
        measurements.at(-1).mobileCompareCards = mobileCompare;
      }
      if (['comparebar-home', 'detail-comparebar'].includes(target.name)) {
        assert.ok(compareBarBottomVisible, 'selected compare bar should be available at the bottom of the page');
        assert.ok(!compareBarFooterOverlap, 'compare bar must not cover footer content at the bottom of the page');
      }
      if (['comparebar-home', 'detail-comparebar'].includes(target.name) && [375, 1280].includes(width)) assert.ok(!compareBarHeadingOverlap, 'active compare bar must not cover the target page heading in the viewport screenshot');
      if (target.name === 'sell' || target.name === 'sell-invalid') assert.ok(result.formControlsMinHeight >= 44, 'sell form controls must be at least 44px high');
      if (target.name === 'sell-invalid') assert.ok(result.formFocusOutline !== 'none' && result.formFocusOutline !== '0px', 'focused required field must show focus outline');
      await context.close();
    }
  }
  console.log('Status codes:');
  console.table(statuses);
  console.log('Layout measurements:');
   console.table(measurements.map(({ width, page, documentOverflow, overflowElements, localScrollOverflow, excludedScrollContainers, invalidScrollContainers, navLinesMax, navTouchTargetsOk, actionOverlap, undersizedAction, rowHeightDiff, actionYDiff, specCellHeightDiff, truncatedSpecValues, titledConditionValues, conditionValues, truncatedSpecTexts, compareBarInViewport, compareBarHidden, compareBarCoversHeading, compareBarHeadingOverlap, compareBarFooterOverlap, compareBarBottomVisible, formControlsMinHeight, formFocusOutline, formPostCount, initialBytes, fullPageBytes }) => ({ width, page, documentOverflow, overflowElements, localScrollOverflow, excludedScrollContainers: JSON.stringify(excludedScrollContainers), invalidScrollContainers, navLinesMax, navTouchTargetsOk, actionOverlap, undersizedAction, rowHeightDiff, actionYDiff, specCellHeightDiff, truncatedSpecValues, titledConditionValues, conditionValues, truncatedSpecTexts: JSON.stringify(truncatedSpecTexts), compareBarInViewport, compareBarHidden, compareBarCoversHeading, compareBarHeadingOverlap, compareBarFooterOverlap, compareBarBottomVisible, formControlsMinHeight, formFocusOutline, formPostCount, initialBytes, fullPageBytes })));
  console.log('Image resource totals per page:');
  const carResourceRows = measurements.filter(({ page }) => page === 'cars');
  console.table(carResourceRows.map(({ width, imageResources }) => ({ width, imageCount: imageResources.length, imageBytes: imageResources.reduce((sum, image) => sum + image.bytes, 0), resources: imageResources.map((image) => `${path.basename(image.url)}=${image.bytes}`).join('; ') })));
  console.log('Listing image loading policy (first viewport request):');
  const policy = measurements.find(({ page, width }) => page === 'cars' && width === 1280)?.listingImagePolicy || [];
  console.table(policy);
  console.log('/cars R1 -> R2 response bytes (R1 values from the accepted R1 evidence, same 73-row/12-photo fixture):');
  const acceptedR1Bytes = new Map([[375, 10_476_237], [1280, 16_902_768]]);
  console.table(carResourceRows.filter(({ width }) => acceptedR1Bytes.has(width)).map(({ width, responseBytes }) => ({ width, beforeBytes: acceptedR1Bytes.get(width), afterBytes: responseBytes, deltaBytes: responseBytes - acceptedR1Bytes.get(width) })));
  console.log('/cars initial viewport load vs full-page scroll, compared with accepted R1 evidence:');
  console.table(transferMeasurements.map(({ width, initialBytes, fullPageBytes }) => ({ width, r1Bytes: acceptedR1Bytes.get(width), initialBytes, initialDelta: initialBytes - acceptedR1Bytes.get(width), fullPageBytes, fullPageDelta: fullPageBytes - acceptedR1Bytes.get(width) })));
  console.log('LCP / CLS / response-size:');
  console.table(vitals);
  console.log('Real image URLs used in local fixtures:', live.urls.length);
  console.log('Specification assertion diagnostics:');
  console.table(measurements.filter((row) => row.specCellHeightDiff !== undefined && (row.specCellHeightDiff > 1 || row.truncatedSpecValues > 0 || row.titledConditionValues !== row.conditionValues)).map(({ width, page, specCellHeightDiff, truncatedSpecValues, titledConditionValues, conditionValues, truncatedSpecTexts }) => ({ width, page, specCellHeightDiff, truncatedSpecValues, titledConditionValues, conditionValues, uniqueTruncations: JSON.stringify([...new Map(truncatedSpecTexts.map((item) => [item.text, item])).values()]) })));
  assert.ok(measurements.every((row) => !row.documentOverflow && row.overflowElements === 0 && row.invalidScrollContainers.length === 0), `visible elements and document bounds must stay within viewport: ${JSON.stringify(measurements.filter((row) => row.documentOverflow || row.overflowElements > 0 || row.invalidScrollContainers.length > 0).map(({ width, page, overflowElements, overflowNames, invalidScrollContainers }) => ({ width, page, overflowElements, overflowNames, invalidScrollContainers })))}`);
  assert.ok(measurements.every((row) => row.navLinesMax <= 1), 'navigation labels must render on one line');
  assert.ok(measurements.filter((row) => row.width <= 768).every((row) => row.navTouchTargetsOk), 'mobile menu controls must be at least 44px high');
  assert.ok(measurements.every((row) => !row.actionOverlap && !row.undersizedAction), 'card actions must not overlap and must be at least 44px high');
  assert.ok(measurements.every((row) => row.rowHeightDiff <= 1 && row.actionYDiff <= 1), 'cards and action rows in each grid row must align');
  assert.ok(measurements.filter((row) => row.specCellHeightDiff !== undefined).every((row) => row.specCellHeightDiff <= 1 && row.truncatedSpecValues === 0 && row.titledConditionValues === row.conditionValues), 'spec cells align, ordinary values do not truncate, and each one-line condition preserves full title text');
   assert.ok(policy.length > 0 && policy.every((image, index) => Boolean(image.src) && image.loading === (index < 2 ? 'eager' : 'lazy') && image.fetchpriority === (index < 2 ? 'high' : 'auto') && image.sizes), 'first two listing images must have server-rendered src and eager/high priority, remaining images native lazy, and all dimensioned');
  assert.ok(measurements.filter((row) => ['home', 'cars', 'detail'].includes(row.page)).every((row) => row.compareBarHidden), 'empty compare bar must not appear on public pages');
  assert.ok(measurements.filter((row) => ['comparebar-home', 'detail-comparebar'].includes(row.page)).every((row) => !row.compareBarHeadingOverlap && !row.compareBarFooterOverlap), 'active compare bar must not cover visible headings or footer content');
  assert.ok(measurements.filter((row) => ['home', 'cars', 'detail'].includes(row.page)).every((row) => row.loadedImages > 0), 'public page fixture images must load');
  console.log('Layout assertions passed for every measured page and viewport.');
} finally {
  if (browser) await browser.close();
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise((resolve) => worker.once('exit', resolve));
  }
  await rm(tempRoot, { recursive: true, force: true });
}

console.log(`Screenshots saved in ${outputDir}`);
