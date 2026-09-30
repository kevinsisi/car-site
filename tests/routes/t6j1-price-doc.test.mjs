import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync(new URL('../../src/pages/price-doc.astro', import.meta.url), 'utf8');

test('/price-doc remains the plan-pricing calculator with its original inline data and formulas', () => {
  assert.match(page, /<title>方案比較<\/title>/);
  assert.match(page, /我們的方案 vs WordPress/);
  assert.match(page, /功能方案比較/);
  assert.match(page, /收費方案/);
  assert.match(page, /data-price="6000" data-name="車輛比較功能"/);
  assert.match(page, /data-price="2000" data-name="聯絡頁"/);
  assert.match(page, /const BASE_PRICE = 30000;/);
  assert.match(page, /const FULL_PRICE = 60000;/);
  assert.match(page, /const total = BASE_PRICE \+ extra;/);
  assert.match(page, /total >= FULL_PRICE/);
  assert.doesNotMatch(page, /vehicle price estimator|車輛估價/);
});
