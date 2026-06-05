// Apply brand icons (public/brand-icons/<slug>.png) to the brand_aliases table.
// - Updates icon_url for every alias row whose url_slug matches a known icon.
// - Inserts an English sourceBrand alias row when vehicles use the English brand
//   name directly and no alias row exists for it (icon lookup is keyed by sourceBrand).
// Idempotent; run with: node scripts/import-brand-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const BRANDS = [
  { slug: 'rolls-royce', displayName: 'Rolls-Royce' },
  { slug: 'bentley', displayName: 'Bentley' },
  { slug: 'ferrari', displayName: 'Ferrari' },
  { slug: 'lamborghini', displayName: 'Lamborghini' },
  { slug: 'porsche', displayName: 'Porsche' },
  { slug: 'mclaren', displayName: 'McLaren' },
  { slug: 'mercedes-benz', displayName: 'Mercedes-Benz' },
  { slug: 'lexus', displayName: 'Lexus' },
  { slug: 'aston-martin', displayName: 'Aston Martin' },
  { slug: 'alfa-romeo', displayName: 'Alfa Romeo' },
];

const dbPath = process.env.DATABASE_PATH || path.resolve('data', 'car-site.db');
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}
const db = new Database(dbPath);
const now = new Date().toISOString();

const updateBySlug = db.prepare(
  'UPDATE brand_aliases SET icon_url = ?, updated_at = ? WHERE url_slug = ?'
);
const findSource = db.prepare('SELECT source_brand FROM brand_aliases WHERE source_brand = ?');
const insertAlias = db.prepare(
  'INSERT INTO brand_aliases (source_brand, display_name, url_slug, icon_url, updated_at) VALUES (?, ?, ?, ?, ?)'
);
const vehicleBrands = new Set(
  db.prepare('SELECT DISTINCT brand FROM vehicles').all().map((r) => r.brand)
);

let updated = 0;
let inserted = 0;
for (const { slug, displayName } of BRANDS) {
  const iconFile = path.resolve('public', 'brand-icons', `${slug}.png`);
  if (!fs.existsSync(iconFile)) {
    console.warn(`icon missing, skip: ${slug}`);
    continue;
  }
  const iconUrl = `/brand-icons/${slug}.png`;
  const res = updateBySlug.run(iconUrl, now, slug);
  updated += res.changes;

  // Vehicles whose brand text matches the English display name need their own
  // alias row, because icon lookup is keyed by source_brand.
  const candidates = [displayName, displayName.replace('-', ' ')];
  for (const sourceBrand of candidates) {
    if (vehicleBrands.has(sourceBrand) && !findSource.get(sourceBrand)) {
      insertAlias.run(sourceBrand, displayName, slug, iconUrl, now);
      inserted++;
    }
  }
}
console.log(`brand_aliases updated: ${updated}, inserted: ${inserted}`);
console.log(
  db.prepare('SELECT source_brand, display_name, url_slug, icon_url FROM brand_aliases ORDER BY display_name').all()
);
