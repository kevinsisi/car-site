import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from '@playwright/test';

const sourceRoot = process.cwd();
const outputDir = path.join(sourceRoot, '.tmp-ui-shots/r6');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mita-visual-r6-'));
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

async function captureBottom(page, name, width) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(outputDir, `${name}-${width}-bottom.png`), fullPage: false });
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(50);
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
const failures=[];
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
  const transferByWidth = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width <= 768, hasTouch: width <= 768, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const measure = async (selector, callback) => page.locator(selector).evaluate(callback);
    await page.goto(`${origin}/cars`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outputDir, `cars-${width}-viewport.png`), fullPage: false });
    await captureBottom(page, 'cars', width);
    const cars = await page.evaluate(() => {
      const rect = (element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom }; };
      const countLines = (element) => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].map((r) => Math.round(r.top)); };
      const cards = [...document.querySelectorAll('.vehicle-card')];
      const phantom = cards.find((card) => card.querySelector('h2')?.textContent?.includes('PHANTOM'));
      const title = phantom?.querySelector('h2');
      const specItems = [...(phantom?.querySelectorAll('.spec-item') || [])];
      const allSpecLayouts = cards.map((card) => {
        const items=[...card.querySelectorAll('.spec-item')];
        const condition=items.find((item)=>item.classList.contains('spec-item--condition'));
        return { title:card.querySelector('h2')?.textContent.trim()||'', count:items.length, conditionFullWidth:Boolean(condition&&getComputedStyle(condition).gridColumnStart==='1'&&getComputedStyle(condition).gridColumnEnd==='-1'), values:items.map((item)=>{const value=item.querySelector('strong');const range=document.createRange();if(value)range.selectNodeContents(value);return {text:value?.textContent.trim()||'',clientWidth:value?.clientWidth||0,scrollWidth:value?.scrollWidth||0,lines:value?new Set([...range.getClientRects()].map((r)=>Math.round(r.top))).size:0};}) };
      });
      const rectOf=(element)=>{const r=element.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
      const filterSelectors=['.sort-control select','.listing-search input','.filter-toggle'];
      const filterControls=filterSelectors.map((selector)=>{const element=document.querySelector(selector);return {selector,rect:element?rectOf(element):null,scrollWidth:element?.scrollWidth??0,clientWidth:element?.clientWidth??0};});
      const filterRects=filterControls.map((control)=>control.rect).filter(Boolean);
      const filterOverlaps=filterRects.flatMap((a,index)=>filterRects.slice(index+1).filter((b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));
      return {
        cardCount: cards.length,
        phantomTitle: title ? { text: title.textContent.trim(), clientWidth: title.clientWidth, scrollWidth: title.scrollWidth, lines: new Set(countLines(title)).size, textOverflow: getComputedStyle(title).textOverflow } : null,
        specListWidth: phantom?.querySelector('.spec-list')?.clientWidth || 0,
        specCells: specItems.map((item) => { const style=getComputedStyle(item); return { rect: rect(item), condition: item.classList.contains('spec-item--condition'), gridColumnStart: style.gridColumnStart, gridColumnEnd: style.gridColumnEnd, value: item.querySelector('strong')?.textContent.trim() || '', valueLines: item.querySelector('strong') ? new Set(countLines(item.querySelector('strong'))).size : 0 }; }),
        allSpecLayouts,
        filterRegion:rectOf(document.querySelector('.inventory-toolbar')),
        filterControls,
        filterOverlaps:filterOverlaps.length,
      };
    });
    await page.goto(`${origin}/cars?q=${encodeURIComponent('不存在的車款')}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `cars-empty-${width}-viewport.png`), fullPage: false });
    await captureBottom(page, 'cars-empty', width);
    const empty = await page.evaluate(() => {
      const state = document.querySelector('.empty-state');
      const heading = state?.querySelector('h3');
      const description = state?.querySelector('p:not(.eyebrow)');
      const cta = state?.querySelector('.button');
      const rect = (element) => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
      const lineInfo = (element) => {
        if (!element) return { lines: 0, lastLineChars: 0 };
        const range = document.createRange(); range.selectNodeContents(element);
        const rects = [...range.getClientRects()];
        const lines = [...new Set(rects.map((r) => Math.round(r.top)))];
        const lastTop = lines.at(-1);
        const textNodes = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        const lastLineChars = textNodes.reduce((count, node) => count + [...node.textContent].filter((_, index) => {
          const r = document.createRange(); r.setStart(node, index); r.setEnd(node, index + 1);
          return Math.round(r.getBoundingClientRect().top) === lastTop;
        }).length, 0);
        return { lines: lines.length, lastLineChars };
      };
      return { heading: lineInfo(heading), description: lineInfo(description), headingRect: heading && rect(heading), descriptionRect: description && rect(description), ctaRect: cta && rect(cta), ctaGap: cta && description ? cta.getBoundingClientRect().top - description.getBoundingClientRect().bottom : null };
    });
    await page.goto(`${origin}/about`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `about-${width}-viewport.png`), fullPage: false });
    await captureBottom(page, 'about', width);
    const aboutTitle = await page.locator('.page-hero h1').evaluate((element) => {
      const range = document.createRange(); range.selectNodeContents(element);
      const rects = [...range.getClientRects()];
      const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
      const lastTop = tops.at(-1);
      const textNodes=[]; const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT); while(walker.nextNode())textNodes.push(walker.currentNode);
      const lastLineCharacters=textNodes.reduce((count,node)=>count+[...node.textContent].filter((_,index)=>{const r=document.createRange();r.setStart(node,index);r.setEnd(node,index+1);return Math.round(r.getBoundingClientRect().top)===lastTop;}).length,0);
      return { lines: tops.length, lastLineCharacters, text: element.textContent.trim() };
    });
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `home-${width}-viewport.png`), fullPage: false });
    await captureBottom(page, 'home', width);
    const home = await page.evaluate(() => {
      const rect = (selector) => { const e = document.querySelector(selector); if (!e) return null; const r=e.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,center:r.top+r.height/2}; };
      const hero=rect('.hero');
      const copy=rect('.hero__copy');
      const media=rect('.hero__media');
      const brandCapsule=rect('.home-brand-quick');
      const titleRect=rect('.hero__copy h1');
      const lead=document.querySelector('.hero__lead');
      const contactLinks=[...document.querySelectorAll('.hero .cta-row a[href]')];
      const phone=contactLinks.find((a)=>a.getAttribute('href')?.startsWith('tel:'));
      const line=contactLinks.find((a)=>a.getAttribute('href')?.includes('line.me'));
      const linkRect=(element)=>{if(!element)return null;const r=element.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
      const leadStyle=lead?getComputedStyle(lead):null;
      return { copy, media, badge: rect('.hero__badge'), brandCapsule,titleRect,titleBrandGap:titleRect&&brandCapsule?brandCapsule.top-titleRect.bottom:null,leadLineHeight:leadStyle?parseFloat(leadStyle.lineHeight):0,leadFontSize:leadStyle?parseFloat(leadStyle.fontSize):0, hero, phone:linkRect(phone),line:linkRect(line),heroContentBottom:Math.max(copy?.bottom||0,media?.bottom||0), gapToBrand:brandCapsule&&copy&&media?brandCapsule.top-Math.max(copy.bottom,media.bottom):null };
    });
    const realTitle=live.vehicles.find((vehicle)=>vehicle.title.includes('PHANTOM'))?.title || live.vehicles.find((vehicle)=>vehicle.href.endsWith('/B182'))?.title || live.vehicles[0].title;
    const realModel=realTitle.split(' ').slice(1).join(' ');
    const compareChecks=[];
    for(const count of [2,3]){
      const slugs=['B182','B181','B180'].slice(0,count);
      await page.evaluate(({slugs,title,model})=>{
        localStorage.setItem('compare_slugs',JSON.stringify(slugs));
        const fake=['R4 比較車款辨識 B180XYZ','R4 辨識測試車款 ABC123'];
        localStorage.setItem('compare_meta',JSON.stringify(Object.fromEntries(slugs.map((slug,index)=>[slug,{title:index===0?title:fake[index-1],model:index===0?model:`R4 ${slug}`,thumb:''}]))));
      },{slugs,title:realTitle,model:realModel});
      await page.reload({waitUntil:'networkidle'});
      if(count===3){await page.screenshot({path:path.join(outputDir,`comparebar-home-${width}-viewport.png`),fullPage:false});await captureBottom(page,'comparebar-home',width);}
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';window.scrollTo(0,document.documentElement.scrollHeight);});
      await page.waitForTimeout(100);
      const measured=await page.evaluate(()=>{
        const bar=document.querySelector('.compare-bar');const barRect=bar.getBoundingClientRect();
        const items=[...bar.querySelectorAll('.compare-bar__item')].map((item)=>{
          const name=item.querySelector('.compare-bar__name');const model=item.querySelector('.compare-bar__model');const helper=item.querySelector('.compare-bar__helper');const remove=item.querySelector('button');
          const style=(element)=>{const s=getComputedStyle(element);const r=element.getBoundingClientRect();return {fontSize:parseFloat(s.fontSize),fontWeight:parseInt(s.fontWeight,10),clientWidth:element.clientWidth,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,rectHeight:r.height,text:element.textContent.trim()};};
      const visibleCharacters=(element)=>{const b=element.getBoundingClientRect();let n=0;for(let i=0;i<element.textContent.length;i++){const r=document.createRange();r.setStart(element.firstChild,i);r.setEnd(element.firstChild,i+1);const x=r.getBoundingClientRect();if(x.width>0&&x.right>b.left&&x.left<b.right&&x.bottom>b.top&&x.top<b.bottom)n++;}return n;};
          const buttonRect=remove.getBoundingClientRect();
          const lines=(element)=>{const range=document.createRange();range.selectNodeContents(element);return new Set([...range.getClientRects()].map((r)=>Math.round(r.top))).size;};
          const nameStyle=getComputedStyle(name),modelStyle=getComputedStyle(model);
          return {name:style(name),model:style(model),helper:style(helper),nameLines:lines(name),modelLines:lines(model),helperLines:lines(helper),nameTextOverflow:nameStyle.textOverflow,nameLineClamp:nameStyle.webkitLineClamp,modelTextOverflow:modelStyle.textOverflow,modelOverflowX:modelStyle.overflowX,modelWhiteSpace:modelStyle.whiteSpace,copyWidth:item.querySelector('.compare-bar__copy').clientWidth,itemWidth:item.clientWidth,visibleNameCharacters:visibleCharacters(name),removeHeight:buttonRect.height,removeWidth:buttonRect.width};
        });
         const footer=document.querySelector('.site-footer');
         const lastInteractive=[...(footer?.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')||[])].filter((element)=>getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).display!=='none'&&element.getBoundingClientRect().height>0).reduce((last,element)=>{const rect=element.getBoundingClientRect();return !last||rect.bottom>last.bottom?{bottom:rect.bottom,text:element.textContent.trim()}:last;},null);
         const footerText=[...(footer?.querySelectorAll('.footer-meta p,.footer-meta .copyright,.site-footer__col--info > span')||[])].filter((element)=>element.textContent.trim()&&getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).display!=='none').reduce((last,element)=>{const rect=element.getBoundingClientRect();return !last||rect.bottom>last.bottom?{bottom:rect.bottom,text:element.textContent.trim()}:last;},null);
        const visibleText=[...bar.querySelectorAll('.compare-bar__name,.compare-bar__model,.compare-bar__helper,.compare-bar__go,.compare-bar__clear,.compare-bar__item button')].filter((element)=>getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden').map((element)=>({text:element.textContent.trim(),fontSize:parseFloat(getComputedStyle(element).fontSize)}));
        const actionButtons=[...bar.querySelectorAll('.compare-bar__go,.compare-bar__clear,.compare-bar__item button')].map((button)=>({text:button.textContent.trim(),height:button.getBoundingClientRect().height,width:button.getBoundingClientRect().width}));
        const textLines=(element)=>{const range=document.createRange();range.selectNodeContents(element);return new Set([...range.getClientRects()].map((rect)=>Math.round(rect.top))).size;};
        for(const item of items){item.nameLines=textLines(bar.querySelectorAll('.compare-bar__item')[items.indexOf(item)].querySelector('.compare-bar__name'));item.modelLines=textLines(bar.querySelectorAll('.compare-bar__item')[items.indexOf(item)].querySelector('.compare-bar__model'));item.helperLines=textLines(bar.querySelectorAll('.compare-bar__item')[items.indexOf(item)].querySelector('.compare-bar__helper'));}
         return {barHeight:barRect.height,barTop:barRect.top,barBottom:barRect.bottom,viewportHeight:innerHeight,items,lastInteractive,footerText,visibleText,actionButtons,footerSafe:Boolean(lastInteractive&&lastInteractive.bottom<=barRect.top&&footerText?.bottom<=barRect.top),pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
      });
      compareChecks.push({count,...measured});
    }
    const compareTitle=compareChecks.find((item)=>item.count===2)?.items||[];
    await page.evaluate(()=>{localStorage.removeItem('compare_slugs');localStorage.removeItem('compare_meta');window.dispatchEvent(new CustomEvent('compare-changed'));});
    await page.goto(`${origin}/contact`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `contact-${width}-viewport.png`), fullPage: false });
    await captureBottom(page, 'contact', width);
    const contact = await page.evaluate(() => {
      const links=[...document.querySelectorAll('a[href]')];
      const firstVisible = (predicate) => links.find((a) => {const r=a.getBoundingClientRect();return predicate(a) && r.width>0 && r.height>0 && r.top>=0 && r.bottom<=innerHeight;});
      const phone=firstVisible((a)=>a.getAttribute('href')?.startsWith('tel:'));
      const line=firstVisible((a)=>a.getAttribute('href')?.includes('line.me'));
      const address=firstVisible((a)=>a.getAttribute('aria-label')?.startsWith('查看地址') || a.textContent?.includes('來店賞車') || a.href.includes('google.com/maps'));
      const phoneValue=document.querySelector('.contact-card[href^="tel:"] strong');
      const phoneRange=document.createRange();if(phoneValue)phoneRange.selectNodeContents(phoneValue);
      const phoneLines=phoneValue?new Set([...phoneRange.getClientRects()].map((rect)=>Math.round(rect.top))).size:0;
      const phoneStyle=phoneValue?getComputedStyle(phoneValue):null;
      const phoneLineHeight=phoneStyle?parseFloat(phoneStyle.lineHeight):0;
      return { phone: Boolean(phone), line: Boolean(line), address: Boolean(address), phoneText: phone?.textContent.trim() || phone?.getAttribute('aria-label') || '', lineText: line?.textContent.trim() || line?.getAttribute('aria-label') || '', addressText: address?.textContent.trim() || address?.getAttribute('aria-label') || '', phoneNumber:{text:phoneValue?.textContent.trim()||'',lines:phoneLines,fontSize:phoneStyle?parseFloat(phoneStyle.fontSize):0,scrollHeight:phoneValue?.scrollHeight||0,lineHeight:phoneLineHeight,rect:phoneValue?(()=>{const r=phoneValue.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height};})():null} };
    });
    await page.goto(`${origin}/sell`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `sell-${width}-viewport.png`), fullPage: false });
    await captureBottom(page, 'sell', width);
    const sellForm = await page.locator('.sell-form').evaluate((element) => { const r=element.getBoundingClientRect();const controls=[...element.querySelectorAll('input,textarea,select')].map((control)=>({tag:control.tagName,type:control.type||'',height:control.getBoundingClientRect().height,name:control.name||''}));const header=document.querySelector('.sell-page__header');const firstLabel=element.querySelector('.form-group label');const headerRect=header?.getBoundingClientRect();const labelRect=firstLabel?.getBoundingClientRect();return {height:r.height,top:r.top,bottom:r.bottom,controls,fieldCount:controls.length,headerBottom:headerRect?.bottom||0,firstLabelTop:labelRect?.top||0,headerToFieldsGap:headerRect&&labelRect?labelRect.top-headerRect.bottom:0,labelFontSizes:[...element.querySelectorAll('.form-group label')].map((label)=>parseFloat(getComputedStyle(label).fontSize))}; });
    await page.locator('.sell-form__submit').scrollIntoViewIfNeeded();
    const sellSubmitReachable=await page.locator('.sell-form__submit').evaluate((button)=>{const r=button.getBoundingClientRect();return {reachable:r.top>=0&&r.bottom<=innerHeight,top:r.top,bottom:r.bottom,scrollY,documentHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight};});
    sellForm.submitAtBottom=sellSubmitReachable;
    await page.goto(`${origin}/cars/B182`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `detail-${width}-viewport.png`), fullPage: false });
    await captureBottom(page, 'detail', width);
    const pagerLayout=await page.evaluate(()=>{
      const nav=document.querySelector('.detail-pager'), next=nav?.querySelector('.detail-pager__link--next');
      const title=next?.querySelector('.detail-pager__copy strong'), thumb=next?.querySelector('.detail-pager__thumb'), home=nav?.querySelector('.detail-pager__home');
      const rect=(el)=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
      const titleRect=rect(title), thumbRect=rect(thumb), homeRect=rect(home), range=document.createRange();range.selectNodeContents(title);
      const lineCount=new Set([...range.getClientRects()].map((r)=>Math.round(r.top))).size;
      const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      const navStyle=getComputedStyle(nav),articleStyle=getComputedStyle(document.querySelector('.detail-page'));return {text:title.textContent.trim(),title:titleRect,thumb:thumbRect,home:homeRect,nav:rect(nav),navStyle:{width:navStyle.width,display:navStyle.display,justify:navStyle.justifyItems,grid:navStyle.gridTemplateColumns},articleStyle:{display:articleStyle.display,grid:articleStyle.gridTemplateColumns,width:articleStyle.width},link:rect(next),article:rect(document.querySelector('.detail-page')),main:rect(document.querySelector('#main')),columns:navStyle.gridTemplateColumns,viewport:innerWidth,lineCount,scrollWidth:title.scrollWidth,clientWidth:title.clientWidth,overlaps:{titleThumb:overlaps(titleRect,thumbRect),titleHome:overlaps(titleRect,homeRect),thumbHome:overlaps(thumbRect,homeRect)}};
    });
    console.log(`pager ${width}: ${JSON.stringify(pagerLayout)}`);
    if(pagerLayout.title.width<160||pagerLayout.lineCount>3||Object.values(pagerLayout.overlaps).some(Boolean)||pagerLayout.scrollWidth>pagerLayout.clientWidth) failures.push(`${width}: next vehicle pager layout failed ${JSON.stringify(pagerLayout)}`);
    const detail = await page.evaluate(() => {
      const rect=(selector)=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
      const specPanel=document.querySelector('.spec-panel--detail');
      const price=[...(specPanel?.querySelectorAll('div')||[])].find((row)=>row.querySelector('span')?.textContent.trim()==='價格');
      const specRows=[...document.querySelectorAll('.detail-quick-specs > div')];
      const heroLinks=[...document.querySelectorAll('.detail-actions a[href]')].map((link)=>{const r=link.getBoundingClientRect();return {href:link.getAttribute('href'),bottom:r.bottom,top:r.top,height:r.height};});
      const mainImage=document.querySelector('.detail-gallery-top .gallery-strip__main img');
      const mainStyle=mainImage?getComputedStyle(mainImage):null;
      const mainRect=mainImage?.getBoundingClientRect();
      return { image: rect('.detail-gallery-top .gallery-strip__main'), title: rect('.detail-copy h1'), price: rect('.detail-quick-price'), specs: specRows.map((row)=>rectFrom(row)), panelPrice: price?rectFrom(price):null,heroLinks,mainImage:{objectFit:mainStyle?.objectFit||'',naturalWidth:mainImage?.naturalWidth||0,naturalHeight:mainImage?.naturalHeight||0,width:mainRect?.width||0,height:mainRect?.height||0,sourceRatio:mainImage?.naturalWidth&&mainImage?.naturalHeight?mainImage.naturalWidth/mainImage.naturalHeight:0,rectRatio:mainRect?.width&&mainRect?.height?mainRect.width/mainRect.height:0} };
      function rectFrom(element){const r=element.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}
    });
    let notFoundErrors;
    for (const route of ['/404','/500']) {
      await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(outputDir, `${route.slice(1)}-${width}-viewport.png`), fullPage: false });
      await captureBottom(page, route.slice(1), width);
      if (route==='/404') {
        await page.evaluate(()=>{window.scrollTo(0,0);});
        await page.waitForTimeout(50);
        notFoundErrors=await page.evaluate(() => {
        const main=document.querySelector('main');const content=document.querySelector('.error-page');const footer=document.querySelector('.site-footer');
        const rect=(e)=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,center:r.top+r.height/2};};
        return {main:rect(main),content:rect(content),footer:rect(footer),viewportCenter:innerHeight/2,documentHeight:document.documentElement.scrollHeight,footerDocumentBottom:footer?footer.getBoundingClientRect().bottom+scrollY:0};
        });
      }
    }
    await page.evaluate(()=>{window.scrollTo(0,0);});
    const errors = await page.evaluate(() => {
      const main=document.querySelector('main'); const content=document.querySelector('.error-page'); const footer=document.querySelector('.site-footer');
      const rect=(e)=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,center:r.top+r.height/2};};
      return { main:rect(main), content:rect(content), footer:rect(footer), viewportCenter:innerHeight/2, documentHeight:document.documentElement.scrollHeight, footerDocumentBottom:footer?footer.getBoundingClientRect().bottom+scrollY:0 };
    });
    errors.notFound=notFoundErrors;
    const assets = new Map();
    page.on('response', async (response) => { try { const h=await response.allHeaders(); assets.set(response.url(), Number(h['content-length']||0)); } catch {} });
    await page.goto(`${origin}/cars`, { waitUntil: 'networkidle' });
    for (let y=0; y<await page.evaluate(()=>document.documentElement.scrollHeight); y+=700) { await page.evaluate((top)=>window.scrollTo(0,top),y); await page.waitForTimeout(80); }
    const fullPageTransferBytes=[...assets.values()].reduce((a,b)=>a+b,0);
    transferByWidth.push({width,fullPageTransferBytes});
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    const motion = await page.evaluate(() => {
      const computed = [...document.querySelectorAll('*')].map((e)=>getComputedStyle(e));
      const animatedElements = computed.filter((s)=>s.animationName!=='none' || s.transitionDuration.split(',').some((v)=>parseFloat(v)>0)).length;
      const findViewTimeline = (rules, insideSupports=false) => [...rules].some((rule)=>{
        if (rule instanceof CSSSupportsRule) return findViewTimeline(rule.cssRules, rule.conditionText.includes('animation-timeline'));
        if (rule instanceof CSSStyleRule && rule.style.getPropertyValue('animation-timeline').includes('view')) return insideSupports;
        return rule.cssRules ? findViewTimeline(rule.cssRules, insideSupports) : false;
      });
      const viewTimelineProtected=[...document.styleSheets].some((sheet)=>{try{return findViewTimeline(sheet.cssRules)}catch{return false}});
      const entranceAnimationName=document.querySelector('.luxury-enter')?getComputedStyle(document.querySelector('.luxury-enter')).animationName:'none';
      const hoverTransitionDuration=document.querySelector('.vehicle-card')?getComputedStyle(document.querySelector('.vehicle-card')).transitionDuration:'0s';
      return {animatedElements, viewTimelineProtected, entranceAnimationName, hoverTransitionDuration};
    });
    const reducedContext = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const reducedPage = await reducedContext.newPage();
    await reducedPage.goto(`${origin}/`, { waitUntil: 'networkidle' });
    const reduced = await reducedPage.evaluate(() => [...document.querySelectorAll('*')].filter((e)=>{const s=getComputedStyle(e);return s.animationName!=='none' || s.transitionDuration.split(',').some((v)=>parseFloat(v)>0)}).length);
    let hoverFeedback=null;
    if(width===1280){const card=page.locator('.vehicle-card').first();const before=await card.evaluate((e)=>getComputedStyle(e).transform);await card.hover();await page.waitForTimeout(260);const after=await card.evaluate((e)=>getComputedStyle(e).transform);hoverFeedback={before,after,changed:before!==after};}
    const cssText = await page.locator('style').evaluateAll((styles)=>styles.map((s)=>s.textContent||'').join('\n'));
    results.push({ width, cars, empty, aboutTitle, home, contact, sellForm, detail, errors, compareTitle, compareChecks, filterMetrics:cars.filterMetrics, motion:{...motion,hoverFeedback,reducedMotionAnimatedElements:reduced,cssTextBytes:cssText.length}, fullPageTransferBytes });
    await reducedContext.close();
    await context.close();
  }
  console.log('R6 metrics by viewport:');
  console.table(results.map((r)=>({width:r.width,compareBars:JSON.stringify(r.compareChecks.map((c)=>({items:c.count,height:c.barHeight,max:c.viewportHeight*.18,footerSafe:c.footerSafe,last:c.lastInteractive?.bottom,footerTextBottom:c.footerText?.bottom,lines:c.items.map((x)=>`${x.nameLines}+${x.modelLines}`)}))),detailTitleBottom:r.detail.title?.bottom,detailPriceBottom:r.detail.price?.bottom,detailContactBottoms:JSON.stringify(r.detail.heroLinks.map((link)=>link.bottom)),detailImageFit:r.detail.mainImage?.objectFit,detailImageRatio:`${r.detail.mainImage?.sourceRatio}/${r.detail.mainImage?.rectRatio}`,homeTitleBrandGap:r.home.titleBrandGap,homeLeadLineRatio:r.home.leadLineHeight/r.home.leadFontSize,telephone:`${r.contact.phoneNumber.lines} lines/${r.contact.phoneNumber.fontSize}px/scroll${r.contact.phoneNumber.scrollHeight}<=line${r.contact.phoneNumber.lineHeight}`,sellFormHeight:r.sellForm.height,sellR4GrowthPct:(100*(r.sellForm.height/762.71875-1)).toFixed(2),sellSubmit:r.sellForm.submitAtBottom?.reachable,headerToFieldsGap:r.sellForm.headerToFieldsGap,minLabelFont:Math.min(...r.sellForm.labelFontSizes),filterHeight:r.cars.filterRegion?.height,filterControls:JSON.stringify(r.cars.filterControls.map((x)=>({selector:x.selector,height:x.rect?.height,scroll:x.scrollWidth,client:x.clientWidth}))),filterOverlaps:r.cars.filterOverlaps})));
  console.log('All measured details:', JSON.stringify(results));
  for (const r of results) {
    if (r.cars.cardCount<1) failures.push(`${r.width}: no listing cards`);
    if (!r.cars.phantomTitle || r.cars.phantomTitle.scrollWidth>r.cars.phantomTitle.clientWidth || (r.width>=1024 && (r.cars.phantomTitle.lines>2 || r.cars.phantomTitle.textOverflow==='ellipsis'))) failures.push(`${r.width}: Phantom title clipped or exceeds two desktop lines`);
    if (r.cars.allSpecLayouts.some((card)=>card.count!==3||!card.conditionFullWidth||card.values.some((value)=>value.scrollWidth>value.clientWidth||(!value.text.startsWith('車況')&&value.lines>1)))) failures.push(`${r.width}: one or more of ${r.cars.allSpecLayouts.length} card spec layouts fail full-width/unclipped checks`);
    if (r.width<=768 && (r.empty.heading.lines>2 || r.empty.description.lines>2 || r.empty.heading.lastLineChars<=2 || r.empty.description.lastLineChars<=2 || r.empty.ctaGap<16)) failures.push(`${r.width}: empty state typography/CTA gap failed`);
    if (r.width>=1024 && r.aboutTitle.lastLineCharacters<=2) failures.push(`${r.width}: about title orphaned final line`);
    if ([768,1440].includes(r.width) && [r.errors.notFound,r.errors].some((error)=>!error?.content || Math.abs(error.content.center-error.viewportCenter)>135 || Math.abs(error.documentHeight-error.footerDocumentBottom)>2)) failures.push(`${r.width}: 404/500 vertical placement/footer failed`);
    if (r.width===1280 && (!r.home.copy || !r.home.media || Math.abs(r.home.copy.center-r.home.media.center)>24)) failures.push('1280: hero columns center mismatch');
    if (r.width===375 && r.home.brandCapsule && r.home.brandCapsule.bottom>876) failures.push('375: brand capsule extends below first-screen safety threshold');
    if (r.home.gapToBrand>160) failures.push(`${r.width}: excessive empty gap after hero (${r.home.gapToBrand}px)`);
    if (r.width===375 && !(r.contact.phone&&r.contact.line&&r.contact.address)) failures.push('375: contact methods not all visible and clickable');
    if (r.width===1280 && [r.detail.image,r.detail.title,r.detail.price,...r.detail.specs].some((r)=>!r || r.bottom>900)) failures.push('1280: detail first-screen content not visible');
    if (r.width===375 && r.sellForm.height>=1266.59375) failures.push(`375: sell form height did not shorten from baseline 1266.59375px (actual ${r.sellForm.height}px)`);
    if (r.compareTitle.length!==2 || r.compareTitle.some((item)=>item.name.clientWidth<80 || item.visibleNameCharacters<14 || item.name.scrollHeight>item.name.clientHeight || item.model.scrollHeight>item.model.clientHeight)) failures.push(`${r.width}: compare-bar real/fake name/model clipped or too narrow`);
    if (r.compareTitle.some((item)=>!(item.name.fontSize>item.model.fontSize && item.model.fontSize>item.helper.fontSize && item.name.fontWeight>item.helper.fontWeight))) failures.push(`${r.width}: compare-bar title/model/helper hierarchy failed`);
    const threeItemCompare=r.compareChecks.find((check)=>check.count===3);
    if(!threeItemCompare||threeItemCompare.barHeight>threeItemCompare.viewportHeight*.18||!threeItemCompare.footerSafe)failures.push(`${r.width}: 3-item comparebar covers footer or exceeds 18vh`);
    if([375,768].includes(r.width)){
      if(threeItemCompare?.items.some((item)=>item.itemWidth<140||item.name.fontSize<14)) failures.push(`${r.width}: compare entry width/font minimum failed`);
      if(threeItemCompare?.pageOverflow) failures.push(`${r.width}: compare bar caused page-level horizontal scrolling`);
      if(threeItemCompare?.items.some((item)=>item.nameLines>2||item.modelLines>1||item.nameTextOverflow==='ellipsis'||item.nameLineClamp!=='none'||item.modelTextOverflow==='ellipsis'))failures.push(`${r.width}: compare item exceeds 2-line name plus 1-line horizontally scrollable model`);
      if(threeItemCompare?.items.some((item)=>item.modelWhiteSpace!=='nowrap'||item.modelOverflowX!=='auto'))failures.push(`${r.width}: complete model is not horizontally scrollable on one line`);
    }
    if(r.width===375){
      if(r.compareChecks.length!==2||r.compareChecks.some((check)=>check.barHeight>check.viewportHeight*.18||!check.footerSafe||check.items.some((item)=>item.name.fontSize<14||item.model.fontSize<12||item.helper.fontSize<12||item.visibleNameCharacters<14||item.name.scrollHeight>item.name.clientHeight||item.model.scrollHeight>item.model.clientHeight||item.removeHeight<40)||check.visibleText.some((item)=>item.fontSize<12)||check.actionButtons.some((button)=>button.height<40)))failures.push(`375: two/three-item compare bar violates size/font/footer contract ${JSON.stringify(r.compareChecks)}`);
      if(!r.home.phone||!r.home.line||r.home.phone.bottom>892||r.home.line.bottom>892)failures.push(`375: home direct phone/LINE CTAs are below first-screen threshold ${JSON.stringify({phone:r.home.phone,line:r.home.line})}`);
      if(r.contact.phoneNumber.lines!==1||r.contact.phoneNumber.fontSize<15||r.contact.phoneNumber.scrollHeight>r.contact.phoneNumber.lineHeight)failures.push(`375: telephone number wraps/is too small ${JSON.stringify(r.contact.phoneNumber)}`);
      if(r.sellForm.height>=1067.25*.92||!r.sellForm.submitAtBottom?.reachable||r.sellForm.fieldCount!==10||r.sellForm.controls.some((field)=>field.height<44))failures.push(`375: sell form fails compactness/submit/field-size requirements ${JSON.stringify(r.sellForm)}`);
      if(r.cars.filterRegion.height>125.453125*.85||r.cars.filterOverlaps!==0||r.cars.filterControls.some((control)=>!control.rect||control.rect.height<40||control.scrollWidth>control.clientWidth))failures.push(`375: cars filter area too tall or controls overlap/overflow ${JSON.stringify({region:r.cars.filterRegion,controls:r.cars.filterControls,overlaps:r.cars.filterOverlaps})}`);
      if(r.home.titleBrandGap<16||r.home.leadLineHeight/r.home.leadFontSize<1.5)failures.push(`375: homepage title/brand gap or lead line height is too tight ${JSON.stringify(r.home)}`);
      if(r.sellForm.height>762.71875*1.03||r.sellForm.headerToFieldsGap<16||Math.min(...r.sellForm.labelFontSizes)<14)failures.push(`375: sell page header/field spacing, label size, or form height exceeds R4 limit ${JSON.stringify(r.sellForm)}`);
      if(r.detail.title?.bottom>892||r.detail.price?.bottom>892||!r.detail.heroLinks.some((link)=>link.bottom<=892&&(/line\.me/.test(link.href)||link.href.startsWith('tel:'))))failures.push(`375: detail title, price, and contact link are not all visible ${JSON.stringify(r.detail)}`);
      if(r.detail.mainImage.objectFit!=='contain'||!r.detail.mainImage.naturalWidth||!r.detail.mainImage.naturalHeight)failures.push(`375: detail main image might distort/crop the car ${JSON.stringify(r.detail.mainImage)}`);
    }
    if (r.motion.reducedMotionAnimatedElements!==0) failures.push(`${r.width}: reduced-motion leaves motion active`);
    if (!r.motion.viewTimelineProtected) failures.push(`${r.width}: animation-timeline view() is not in @supports`);
  }
  const desktopResults=results.filter((r)=>r.width===1280);
  if (desktopResults[0]?.motion.animatedElements<5) failures.push('1280: fewer than five animated/transitioning elements');
  if (desktopResults[0]?.motion.entranceAnimationName==='none' || desktopResults[0]?.motion.hoverFeedback?.changed!==true) failures.push('1280: no measurable entrance or hover feedback');
  console.log('R6 strict assertions:', failures.length ? failures.join('\n') : '0 failures');
  console.log('Transfer totals (no load-reduction claim; compare to R2b only):', JSON.stringify(transferByWidth));
  console.log(`Screenshots saved in ${outputDir}`);
  assert.equal(failures.length,0,'R6 acceptance failures');

} finally {
  if (browser) await browser.close();
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise((resolve) => worker.once('exit', resolve));
  }
  await rm(tempRoot, { recursive: true, force: true });
}
