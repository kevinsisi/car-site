import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isPageAvailable } from '../../src/lib/production-page-availability.ts';

const page = readFileSync(new URL('../../src/pages/price-doc.astro', import.meta.url), 'utf8');

test('/price-doc returns 404 before rendering in production', () => {
  assert.match(page, /isPageAvailable\(Astro\.locals\.runtime\?\.env\?\.MITA_ENV\)/);
  assert.match(page, /if \(!isPageAvailable\(Astro\.locals\.runtime\?\.env\?\.MITA_ENV\)\) return new Response\('', \{ status: 404 \}\);/);
  assert.ok(page.indexOf('return new Response') < page.indexOf('<!DOCTYPE html>'));
});

test('/price-doc remains available when the runtime environment is missing or not production', () => {
  for (const environment of [undefined, 'preview', 'development']) {
    assert.equal(isPageAvailable(environment), true, `${environment} should keep the route`);
  }
});

test('/price-doc is unavailable in production', () => {
  assert.equal(isPageAvailable('production'), false);
});
