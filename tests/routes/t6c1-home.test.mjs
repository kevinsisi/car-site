import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';

const nativeOnly = new Set(['node:fs', 'node:path', 'sharp', '@/db/connection', './config']);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (nativeOnly.has(specifier)) throw new Error(`Worker loaded native-only dependency: ${specifier}`);
    return nextResolve(specifier, context);
  },
});

const fixtures = [];
const queries = [];
const binding = {
  prepare(query) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async all() {
        queries.push({ query, args });
        return { results: query.includes('site_video_links') ? [...fixtures].sort((a, b) => a.sort_order - b.sort_order) : [] };
      },
      async raw() {
        queries.push({ query, args });
        return query.includes('site_video_links')
          ? [...fixtures].sort((a, b) => a.sort_order - b.sort_order).map((row) => [row.id, row.title, row.url, row.thumbnail_url, row.sort_order, row.created_at])
          : [];
      },
      async first() { return null; },
      async run() { throw new Error('The home preview fixture adapter is read-only'); },
    };
    return statement;
  },
};
const adapter = await createD1Db(binding);

test('home video list reads only synthetic D1 fixture rows and returns empty for an empty fixture table', async () => {
  const { listVideoLinks } = await import('../../src/lib/video-links.ts');
  assert.deepEqual(await listVideoLinks(adapter), []);
  fixtures.push({
    id: 'fixture-video', title: 'Fixture video', url: 'https://example.test/video',
    thumbnail_url: null, sort_order: 4, created_at: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(await listVideoLinks(adapter), [{
    id: 'fixture-video', title: 'Fixture video', url: 'https://example.test/video', thumbnailUrl: null, sortOrder: 4,
  }]);
  assert.equal(queries.length, 2);
  assert.ok(queries.every(({ query }) => query.includes('site_video_links')));
});

test('home page passes its request-scoped adapter to every database-backed loader', () => {
  const page = readFileSync(new URL('../../src/pages/index.astro', import.meta.url), 'utf8').split('---')[1];
  for (const call of [
    'getSettings(adapter)',
    'listPublicVehicles(adapter)',
    'listSoldCaseVehicles(6, adapter)',
    'listPublicBrands(adapter)',
    'listVideoLinks(adapter)',
  ]) assert.ok(page.includes(call), `expected home frontmatter to call ${call}`);
  assert.match(page, /runtime\?\.env\?\.DB_PREVIEW/);
  assert.match(page, /status:\s*503/);
});
