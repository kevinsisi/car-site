import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { user: null, settingsReads: 0, retries: [], linkWrites: [], d1: [], nodeImports: 0 };
globalThis.__t6i2 = state;

const modules = {
  '@/db/d1': `export async function createD1Db(binding) { globalThis.__t6i2.d1.push(binding); return { binding }; }`,
  '@/lib/auth': `export async function getAdminOrResponse(cookies, options) {
    if (options?.db) globalThis.__t6i2.d1.push(options.db.binding);
    if (!globalThis.__t6i2.user) return new Response(JSON.stringify({error:'Unauthorized'}), {status:401});
    return globalThis.__t6i2.user;
  }`,
  '@/lib/permissions': `export const PERMISSIONS = { VIDEOS_CAROUSEL: 1, VIDEOS_LINKS: 2 };`,
  '@/lib/front-features': `export function resolveFrontFeatures() { return {heroVideos:globalThis.__t6i2.featureEnabled !== false, videoLinks:globalThis.__t6i2.featureEnabled !== false}; }`,
  '@/lib/settings': `export async function getSettings(db) { globalThis.__t6i2.settingsReads++; return { db }; }`,
  '@/lib/hero-video-conversion': `globalThis.__t6i2.nodeImports++; export async function retryHeroVideoConversion(id) { globalThis.__t6i2.retries.push(id); return true; }`,
  '@/lib/video-links': `globalThis.__t6i2.nodeImports++; export async function setVideoLinks(input) { globalThis.__t6i2.linkWrites.push(input); return input; }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const conversion = await import('../../src/pages/api/admin/hero-video-conversions/[id].ts');
const links = await import('../../src/pages/api/admin/video-links.ts');
const binding = { marker: 'request-d1' };
const admin = { id: 'admin', username: 'admin', role: 'superadmin', permissions: 0 };

function context(route, { worker = true, env = { DB_PREVIEW: binding, SESSION_SECRET: 'request-secret' }, user = admin, body = '{}' } = {}) {
  state.user = user;
  return {
    params: { id: 'conversion-id' }, cookies: {},
    locals: { runtime: worker ? { env } : undefined },
    request: new Request(`https://preview.example/api/admin/${route}`, { method: 'POST', body, headers: { 'content-type': 'application/json' } }),
  };
}

test('Worker POST routes authenticate, then return a stable 501 without side effects', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('unexpected fetch'); };
  try {
    for (const [handler, route] of [[conversion.POST, 'hero-video-conversions/conversion-id'], [links.POST, 'video-links']]) {
      const before = { retries: state.retries.length, writes: state.linkWrites.length, reads: state.settingsReads };
      const first = await handler(context(route, { body: 'not-json' }));
      const second = await handler(context(route, { body: 'not-json' }));
      assert.equal(first.status, 501);
      assert.equal(second.status, 501);
      assert.deepEqual(await first.json(), { error: 'preview_disabled', previewOnly: true });
      assert.deepEqual(await second.json(), { error: 'preview_disabled', previewOnly: true });
      assert.deepEqual({ retries: state.retries.length, writes: state.linkWrites.length }, { retries: before.retries, writes: before.writes });
      assert.equal(state.settingsReads, before.reads + 2);
    }
    assert.equal(fetchCalls, 0);
    assert.equal(state.nodeImports, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Worker missing bindings returns 503; unauthenticated and unauthorized callers are denied', async () => {
  for (const [handler, route] of [[conversion.POST, 'hero-video-conversions/x'], [links.POST, 'video-links']]) {
    for (const env of [{ DB_PREVIEW: binding }, { SESSION_SECRET: 'secret' }]) {
      assert.equal((await handler(context(route, { env }))).status, 503);
    }
    assert.equal((await handler(context(route, { user: null }))).status, 401);
  }
  const editor = { ...admin, role: 'editor', permissions: 0 };
  assert.equal((await conversion.POST(context('hero-video-conversions/x', { user: editor }))).status, 403);
  assert.equal((await links.POST(context('video-links', { user: editor }))).status, 403);
  state.featureEnabled = false;
  assert.equal((await conversion.POST(context('hero-video-conversions/x'))).status, 403);
  assert.equal((await links.POST(context('video-links'))).status, 403);
  state.featureEnabled = true;
  assert.equal(state.nodeImports, 0);
  assert.equal(state.retries.length, 0);
  assert.equal(state.linkWrites.length, 0);
});

test('Node routes retain conversion retry and video-link write behavior', async () => {
  const retryResponse = await conversion.POST(context('hero-video-conversions/x', { worker: false }));
  assert.equal(retryResponse.status, 200);
  assert.deepEqual(await retryResponse.json(), { ok: true });
  assert.deepEqual(state.retries, ['conversion-id']);

  const body = JSON.stringify([{ title: 'Video', url: 'https://example.test/video', sortOrder: 0 }]);
  const linkResponse = await links.POST(context('video-links', { worker: false, body }));
  assert.equal(linkResponse.status, 200);
  assert.deepEqual(await linkResponse.json(), { ok: true, links: [{ title: 'Video', url: 'https://example.test/video', sortOrder: 0 }] });
  assert.equal(state.linkWrites.length, 1);
});
