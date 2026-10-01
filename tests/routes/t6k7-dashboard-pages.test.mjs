import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const pages = [
  { path: 'src/pages/admin/index.astro', route: '/admin', unreadCount: true },
  { path: 'src/pages/admin/contact.astro', route: '/admin/contact', unreadCount: false },
];

for (const page of pages) {
  test(`${page.route} loads its dashboard data using request-scoped D1`, async () => {
    const source = await readFile(new URL(page.path, root), 'utf8');

    assert.match(source, /createD1Db\(env\.DB_PREVIEW\)/);
    assert.match(source, /runtime && \(!env\?\.DB_PREVIEW \|\| !env\.SESSION_SECRET\)/);
    assert.match(source, /status: 503/);
    assert.match(source, /hasAnyUsers\(authOptions\)/);
    assert.match(source, /getSession\(Astro\.cookies, authOptions\)/);
    assert.match(source, /listAdminVehicles\(db, db \? 100 : undefined\)/);
    assert.match(source, /getSettings\(db\)/);
    assert.match(source, /listBrandAliases\(db, db \? 100 : undefined\)/);

    if (page.unreadCount) {
      assert.match(source, /countUnreadSellInquiries\(db\)/);
      assert.doesNotMatch(source, /listSellInquiries\(/);
    }

    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(frontmatter, 'Astro frontmatter is present');
    const body = frontmatter[1].replace(/^import .*;\n/gm, '');
    const run = new Function(
      'Astro', 'createD1Db', 'hasAnyUsers', 'getSession', 'listAdminVehicles', 'getSettings', 'listBrandAliases', 'countUnreadSellInquiries',
      `return (async () => { ${body}\nreturn { vehicles, settings, brandAliases, unreadSellCount: typeof unreadSellCount === 'undefined' ? undefined : unreadSellCount }; })();`
    );
    const syntheticBinding = { marker: 'synthetic-preview-db' };
    const syntheticDb = { marker: 'drizzle-d1', binding: syntheticBinding };
    const redirects = [];
    const calls = [];
    const astro = {
      locals: { runtime: { env: { DB_PREVIEW: syntheticBinding, SESSION_SECRET: 'synthetic-session-secret' } } },
      cookies: { marker: 'synthetic-cookies' },
      redirect(path) { redirects.push(path); return { status: 302, path }; },
    };
    const result = await run(
      astro,
      async (binding) => { calls.push(['createD1Db', binding]); return syntheticDb; },
      async (options) => { calls.push(['hasAnyUsers', options]); return true; },
      async (cookies, options) => { calls.push(['getSession', cookies, options]); return { id: 'synthetic-admin' }; },
      async (db, limit) => { calls.push(['listAdminVehicles', db, limit]); return ['synthetic-vehicle']; },
      async (db) => { calls.push(['getSettings', db]); return { siteName: 'Synthetic preview' }; },
      async (db, limit) => { calls.push(['listBrandAliases', db, limit]); return ['synthetic-brand']; },
      async (db) => { calls.push(['countUnreadSellInquiries', db]); return 0; },
    );

    assert.deepEqual(redirects, []);
    assert.equal(result.vehicles[0], 'synthetic-vehicle');
    assert.equal(result.settings.siteName, 'Synthetic preview');
    assert.equal(result.brandAliases[0], 'synthetic-brand');
    assert.equal(result.unreadSellCount, page.unreadCount ? 0 : undefined);
    assert.ok(calls.some(([name, binding]) => name === 'createD1Db' && binding === syntheticBinding));
    for (const [name, arg] of calls) {
      if (['listAdminVehicles', 'getSettings', 'listBrandAliases', 'countUnreadSellInquiries'].includes(name)) {
        assert.equal(arg, syntheticDb, `${name} receives synthetic D1`);
      }
    }
    assert.deepEqual(calls.find(([name]) => name === 'listAdminVehicles'), ['listAdminVehicles', syntheticDb, 100]);
    assert.deepEqual(calls.find(([name]) => name === 'listBrandAliases'), ['listBrandAliases', syntheticDb, 100]);
    const auth = calls.find(([name]) => name === 'hasAnyUsers')[1];
    assert.equal(auth.db, syntheticDb);
    assert.equal(auth.sessionSecret, 'synthetic-session-secret');

    for (const env of [{ DB_PREVIEW: syntheticBinding }, { SESSION_SECRET: 'synthetic-session-secret' }, {}]) {
      const failed = await run(
        { ...astro, locals: { runtime: { env } } },
        async () => { throw new Error('D1 must not be created without both bindings'); },
        async () => { throw new Error('auth must not run without both bindings'); },
        async () => null,
        async () => [], async () => ({}), async () => [], async () => 0,
      );
      assert.equal(failed.status, 503);
    }

    const emptyRedirect = await run(
      astro,
      async () => syntheticDb,
      async () => false,
      async () => null,
      async () => [], async () => ({}), async () => [], async () => 0,
    );
    assert.deepEqual(emptyRedirect, { status: 302, path: '/admin/setup' });
  });
}
