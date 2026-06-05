// One-off: download brand icon PNGs (provided by partner site hankbentleyrr.com)
// into public/brand-icons/<slug>.png. Safe to re-run; skips existing files.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ICONS = {
  'rolls-royce': 'https://hankbentleyrr.com/wp-content/uploads/2025/05/透明logo工作區域-1-拷貝-8.png',
  bentley: 'https://hankbentleyrr.com/wp-content/uploads/2025/05/透明logo工作區域-1-拷貝-10.png',
  ferrari: 'https://hankbentleyrr.com/wp-content/uploads/2025/05/透明logo工作區域-1-拷貝-1.png',
  lamborghini: 'https://hankbentleyrr.com/wp-content/uploads/2025/05/透明logo工作區域-1-拷貝-6-1.png',
  porsche: 'https://hankbentleyrr.com/wp-content/uploads/2025/05/透明logo工作區域-1-拷貝-2-1.png',
  mclaren: 'https://hankbentleyrr.com/wp-content/uploads/2025/05/透明logo工作區域-1-拷貝-7.png',
  'mercedes-benz': 'https://hankbentleyrr.com/wp-content/uploads/2025/05/透明logo工作區域-1-拷貝-9.png',
  lexus: 'https://hankbentleyrr.com/wp-content/uploads/2025/06/透明logoLexus.png',
  'aston-martin': 'https://hankbentleyrr.com/wp-content/uploads/2025/06/透明logoaston-martin.png',
  'alfa-romeo': 'https://hankbentleyrr.com/wp-content/uploads/2025/06/Alfa_Romeo_logo-1.png',
};

const outDir = path.resolve('public', 'brand-icons');
fs.mkdirSync(outDir, { recursive: true });

let ok = 0;
for (const [slug, url] of Object.entries(ICONS)) {
  const dest = path.join(outDir, `${slug}.png`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`skip ${slug} (exists)`);
    ok++;
    continue;
  }
  const res = await fetch(encodeURI(url));
  if (!res.ok) {
    console.error(`FAIL ${slug}: HTTP ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // Icons render at 14-48px; 192px PNG with palette keeps transparency and stays tiny.
  const optimized = await sharp(buf)
    .resize(192, 192, { fit: 'inside', withoutEnlargement: true })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(dest, optimized);
  console.log(`saved ${slug}.png (${(buf.length / 1024).toFixed(1)} KB → ${(optimized.length / 1024).toFixed(1)} KB)`);
  ok++;
}
console.log(`${ok}/${Object.keys(ICONS).length} icons ready in ${outDir}`);
