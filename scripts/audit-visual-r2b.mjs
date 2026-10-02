import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from '@playwright/test';

const sourceRoot = process.cwd();
const outputDir = path.join(sourceRoot, '.tmp-ui-shots/r2b');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mita-visual-r2b-'));
const projectRoot = path.join(tempRoot, 'project');
const persistTo = path.join(tempRoot, 'd1');
const widths = [375, 768, 1024, 1280, 1440];

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
  run('npm', ['run', 'build:workers']);
  console.log('$ npm run build:workers\nBuild passed.');

  const wrangler = path.join(projectRoot, 'node_modules/.bin/wrangler');
  const wranglerConfig = path.join(projectRoot, 'wrangler.toml');
  const configArgs = ['--local', '--persist-to', persistTo, '--config', wranglerConfig, '--env', 'preview'];
  run(wrangler, ['d1', 'migrations', 'apply', 'DB_PREVIEW', ...configArgs]);
  run(wrangler, ['d1', 'execute', 'DB_PREVIEW', ...configArgs, '--file', fixtureFile]);
  const port = await unusedPort();
  worker = spawn(wrangler, ['dev', '--local', '--persist-to', persistTo, '--config', wranglerConfig, '--env', 'preview', '--port', String(port), '--var', 'SESSION_SECRET:visual-r2b-local-only', '--log-level', 'info'], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
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
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width <= 768, hasTouch: width <= 768, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${port}`;
    await page.goto(`${baseUrl}/cars`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    const spec = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.vehicle-card')];
      return cards.map((card) => {
        const values = [...card.querySelectorAll('.spec-copy strong')];
        const sizes = values.map((value) => getComputedStyle(value).fontSize);
        const measurements = values.map((value) => ({ text: value.textContent?.trim() || '', clientWidth: value.clientWidth, scrollWidth: value.scrollWidth }));
        const brokenWords = [];
        for (const value of values) {
          const text = value.textContent || '';
          const words = [...text.matchAll(/原廠保養|[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*/g)];
          for (const word of words) {
            if ([...word[0]].length < 2) continue;
            const indices = [...word[0]].map((_, offset) => word.index + offset);
            const tops = indices.map((index) => {
              const range = document.createRange();
              range.setStart(value.firstChild, index);
              range.setEnd(value.firstChild, index + 1);
              return range.getBoundingClientRect().top;
            });
            if (tops.some((top) => top !== tops[0])) brokenWords.push(word[0]);
          }
        }
        return { valueCount: values.length, sizes, measurements, brokenWords };
      });
    });
    await page.screenshot({ path: path.join(outputDir, `cars-${width}.png`), fullPage: false });
    assert.ok(spec.length > 0, `${width}px: no vehicle cards were measured`);
    for (const [index, card] of spec.entries()) {
      assert.equal(card.valueCount, 3, `${width}px card ${index}: expected exactly 3 spec values; got ${card.valueCount}`);
      assert.ok(card.measurements.every((value) => value.scrollWidth <= value.clientWidth), `${width}px card ${index}: spec value exceeds clientWidth: ${JSON.stringify(card.measurements)}`);
      assert.equal(new Set(card.sizes).size, 1, `${width}px card ${index}: computed font sizes differ: ${JSON.stringify(card.sizes)}`);
      assert.deepEqual(card.brokenWords, [], `${width}px card ${index}: a word is split across lines: ${JSON.stringify(card.brokenWords)}`);
    }

    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.evaluate((slugs) => {
      localStorage.setItem('compare_slugs', JSON.stringify(slugs));
      localStorage.setItem('compare_meta', JSON.stringify(Object.fromEntries(slugs.map((slug) => [slug, { title: `典藏車款 ${slug} 精選展示`, thumb: '' }]))));
    }, ['B182', 'B181']);
    await page.reload({ waitUntil: 'networkidle' });
    const compareTitle = await page.locator('.compare-bar__item span').first().evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const text = element.textContent || '';
      let visibleCharacters = 0;
      for (let index = 0; index < text.length; index++) {
        const range = document.createRange();
        range.setStart(element.firstChild, index);
        range.setEnd(element.firstChild, index + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom) visibleCharacters++;
      }
      return { clientWidth: element.clientWidth, visibleCharacters };
    });
    assert.ok(compareTitle.clientWidth >= 80, `${width}px compare title clientWidth < 80px: ${JSON.stringify(compareTitle)}`);
    assert.ok(compareTitle.visibleCharacters >= 8, `${width}px compare title has fewer than 8 visible characters: ${JSON.stringify(compareTitle)}`);
    if (width === 375) {
      await page.goto(`${baseUrl}/cars/compare?ids=B182,B181`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.screenshot({ path: path.join(outputDir, 'compare-selected-375.png'), fullPage: false });
    }
    results.push({ width, cardCount: spec.length, firstCardFontSizes: spec[0].sizes, compareTitle });
    await context.close();
  }
  console.log('Three strict R2b measurements by viewport (all cards checked for specs):');
  console.table(results.map((row) => ({ width: row.width, cardCount: row.cardCount, threeComputedFontSizes: JSON.stringify(row.firstCardFontSizes), compareTitleClientWidth: row.compareTitle.clientWidth, compareTitleVisibleCharacters: row.compareTitle.visibleCharacters })));
  console.log('Passed: spec values fit without horizontal clipping; words stay whole; each card has exactly matching three computed font sizes; compare titles meet both limits at every viewport.');
  console.log(`Screenshots saved in ${outputDir}`);
} finally {
  if (browser) await browser.close();
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise((resolve) => worker.once('exit', resolve));
  }
  await rm(tempRoot, { recursive: true, force: true });
}
