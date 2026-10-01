import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';
import * as schema from '../../src/db/schema.ts';
import { buildDefaultSiteIconSvg } from '../../src/lib/site-icon.ts';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/src/db/connection.ts')) {
      return { format: 'module', source: 'export const db = globalThis.__t7PublicSettingsNodeDb;', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const routes = [
  { path: 'src/pages/about.astro', route: '/about' },
  { path: 'src/pages/contact.astro', route: '/contact' },
  { path: 'src/pages/sell.astro', route: '/sell' },
  { path: 'src/pages/site-icon.svg.ts', route: '/site-icon.svg', api: true },
];

function createBinding(siteName) {
  const rows = new Map([['siteName', { key: 'siteName', value: siteName, updated_at: 'synthetic' }]]);
  const calls = [];
  return {
    rows,
    calls,
    close() {},
    prepare(sql) {
      calls.push(sql);
      return {
        bind() { return this; },
        async all() { return { results: [...rows.values()] }; },
        async raw() { return [...rows.values()].map(({ key, value, updated_at }) => [key, value, updated_at]); },
      };
    },
  };
}

function pageFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'Astro frontmatter is present');
  return match[1].replace(/^import .*;\n/gm, '');
}

async function executePage(source, runtime, settings, redirects) {
  const body = pageFrontmatter(source);
  const run = new Function(
    'Astro', 'createD1Db', 'getSettings', 'getFirstPublicHref', 'resolveFrontFeatures',
    `return (async () => { ${body}\nreturn { settings, adapter, features }; })();`,
  );
  return run({
    locals: { runtime },
    redirect(path) { redirects.push(path); return { status: 302, path }; },
  }, createD1Db, settings, () => '/', () => ({ aboutPage: true, contactPage: true, sellInquiry: true, directContact: true }));
}

function executeIconRoute(source) {
  const handler = source
    .replace('export const GET: APIRoute =', 'return')
    .replace("import type { APIRoute } from 'astro';", '')
    .replace(/^import .*;\n/gm, '')
    .replace(/;\s*$/, '');
  return new Function('getSettings', 'buildDefaultSiteIconSvg', 'createD1Db', handler)(
    getSettings, buildDefaultSiteIconSvg, createD1Db,
  );
}

const nativeBinding = createBinding('Synthetic Node settings');
globalThis.__t7PublicSettingsNodeDb = await createD1Db(nativeBinding);
const { getSettings } = await import('../../src/lib/settings.ts');

for (const route of routes) {
  test(`${route.route} uses request-scoped D1 settings in Workers and preserves Node behavior`, { concurrency: false }, async () => {
    const source = await readFile(new URL(`../../${route.path}`, import.meta.url), 'utf8');
    const binding = createBinding(`Synthetic ${route.route} D1`);
    const redirects = [];

    try {
    if (route.api) {
      const GET = executeIconRoute(source);
      const response = await GET({ locals: { runtime: { env: { DB_PREVIEW: binding } } } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^image\/svg\+xml/);
      assert.match(await response.text(), /aria-label="Synthetic \/site-icon\.svg D1"/);
      assert.ok(binding.calls.some((sql) => /site_settings/i.test(sql)), 'the actual GET queried D1 settings');

      for (const locals of [{ runtime: { env: {} } }, { runtime: { env: undefined } }]) {
        const missing = await GET({ locals });
        assert.equal(missing.status, 503);
      }

      const nodeResponse = await GET({ locals: {} });
      assert.equal(nodeResponse.status, 200);
      assert.match(await nodeResponse.text(), /Synthetic Node settings/);
      assert.ok(nativeBinding.calls.some((sql) => /site_settings/i.test(sql)));
    } else {
      const settingsForRoute = async (adapter) => getSettings(adapter);
      const result = await executePage(source, { env: { DB_PREVIEW: binding } }, settingsForRoute, redirects);
      assert.equal(result.settings.siteName, `Synthetic ${route.route} D1`);
      assert.ok(binding.calls.some((sql) => /site_settings/i.test(sql)), 'the route read settings from synthetic D1');
      assert.deepEqual(redirects, []);

      const missing = await executePage(source, { env: {} }, async () => assert.fail('settings must not be read'), redirects);
      assert.equal(missing.status, 503);
      const node = await executePage(source, undefined, settingsForRoute, redirects);
      assert.equal(node.settings.siteName, 'Synthetic Node settings');
      assert.ok(nativeBinding.calls.some((sql) => /site_settings/i.test(sql)));
    }
    } finally {
    }
  });
}
