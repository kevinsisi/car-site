import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { user: null, reads: 0, writes: 0, fetches: 0, enqueues: 0, bindings: [] };
globalThis.__t6i1 = state;

const modules = {
  '@/lib/auth': `export async function getAdminOrResponse(cookies, options) { if (options?.db) globalThis.__t6i1.bindings.push(options.db.binding); return globalThis.__t6i1.user ?? new Response(JSON.stringify({error:'Unauthorized'}), {status:401, headers:{'content-type':'application/json'}}); }`,
  '@/db/d1': `export async function createD1Db(binding) { globalThis.__t6i1.bindings.push(binding); return {binding}; }`,
  '@/lib/permissions': `export const PERMISSIONS = { VIDEOS_CAROUSEL: 1, VIDEOS_LINKS: 2 };`,
  '@/lib/front-features': `export function resolveFrontFeatures() { return {heroVideos:true, videoLinks:true}; }`,
  '@/lib/safe-url': `export function sanitizeImageUrl(value) { return typeof value === 'string' ? value : ''; } export function sanitizePublicHref(value) { return typeof value === 'string' ? value : ''; }`,
  '@/lib/settings': `export async function getSettings(db) { globalThis.__t6i1.reads++; if (db) return {heroVideos:[{id:'d1',url:'https://video.example/d1',type:'mp4',thumbnailUrl:'',label:'D1'}],videoSectionPosition:'above-footer',videoLinksSectionTitle:'D1 links'}; return {heroVideos:[],videoSectionPosition:'below-hero',videoLinksSectionTitle:'Node links'}; } export async function getSettingValue() { return null; } export async function setSettings() { globalThis.__t6i1.writes++; }`,
  '@/lib/video-links': `export async function fetchVideoThumbnail() { globalThis.__t6i1.fetches++; return ''; }`,
  '@/lib/hero-video-conversion': `export function enqueueHeroVideoConversions() { globalThis.__t6i1.enqueues++; }`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in modules) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const route = await import('../../src/pages/api/admin/video-settings.ts');
const binding = { marker: 'synthetic-d1' };
const admin = { id: 'admin', username: 'admin', role: 'superadmin', permissions: 0 };

function context({ worker = true, configured = true, user = admin, method = 'GET', body = '{}' } = {}) {
  state.user = user;
  return {
    cookies: {},
    locals: { runtime: worker ? { env: configured ? { DB_PREVIEW: binding, SESSION_SECRET: 'synthetic-secret' } : { DB_PREVIEW: binding } } : undefined },
    request: new Request('https://preview.example/api/admin/video-settings', { method, body: method === 'GET' ? undefined : body, headers: { 'content-type': 'application/json' } }),
  };
}

test('Worker returns 503 before auth when a required binding is missing', async () => {
  const response = await route.GET(context({ configured: false }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'preview_unavailable');
});

test('Worker GET authenticates and returns synthetic D1 settings; unauthorized request is denied', async () => {
  const denied = await route.GET(context({ user: null }));
  assert.equal(denied.status, 401);
  const response = await route.GET(context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    heroVideos: [{ id: 'd1', url: 'https://video.example/d1', type: 'mp4', thumbnailUrl: '', label: 'D1' }],
    videoSectionPosition: 'above-footer', videoLinksSectionTitle: 'D1 links',
  });
  assert.ok(state.bindings.includes(binding));
});

test('unauthorized Worker POST is denied before parsing request body', async () => {
  const response = await route.POST(context({ user: null, method: 'POST', body: 'not-json' }));
  assert.equal(response.status, 401);
});

test('authorized Worker POST rejects before parsing body or invoking side effects', async () => {
  const before = { reads: state.reads, writes: state.writes, fetches: state.fetches, enqueues: state.enqueues };
  const response = await route.POST(context({ method: 'POST', body: 'not-json' }));
  assert.equal(response.status, 501);
  assert.deepEqual(await response.json(), { error: 'preview_disabled', previewOnly: true });
  assert.deepEqual({ reads: state.reads, writes: state.writes, fetches: state.fetches, enqueues: state.enqueues }, { ...before, reads: before.reads + 1 });
});

test('Node route retains GET and POST behavior', async () => {
  state.user = admin;
  const getResponse = await route.GET(context({ worker: false }));
  assert.equal(getResponse.status, 200);
  assert.deepEqual(await getResponse.json(), { heroVideos: [], videoSectionPosition: 'below-hero', videoLinksSectionTitle: 'Node links' });
  const postResponse = await route.POST(context({ worker: false, method: 'POST', body: JSON.stringify({ videoLinksSectionTitle: 'Updated' }) }));
  assert.equal(postResponse.status, 200);
  assert.deepEqual(await postResponse.json(), { ok: true });
  assert.equal(state.writes, 1);
});
