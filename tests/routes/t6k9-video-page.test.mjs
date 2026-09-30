import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../../src/pages/admin/videos.astro', import.meta.url);
const page = await readFile(pagePath, 'utf8');

test('admin videos page requires preview D1 and session secret before querying auth', () => {
  const bindingGuard = page.indexOf("if (!binding || typeof sessionSecret !== 'string' || !sessionSecret)");
  const d1Creation = page.indexOf('createD1Db(binding');
  const userCheck = page.indexOf('hasAnyUsers(authOptions)');
  const sessionRead = page.indexOf('getSession(Astro.cookies, authOptions)');

  assert.notEqual(bindingGuard, -1);
  assert.ok(bindingGuard < d1Creation);
  assert.ok(d1Creation < userCheck);
  assert.ok(userCheck < sessionRead);
  assert.match(page, /status: 503/);
});

test('admin videos page reads settings and synthetic video-link results through request D1', () => {
  assert.match(page, /getSettings\(adapter\)/);
  assert.match(page, /listVideoLinks\(adapter\)/);
  assert.match(page, /const videoLinks = canLinks \? await listVideoLinks\(adapter\) : \[\]/);
  assert.match(page, /<Videos client:load settings=\{videoSettings\} videoLinks=\{videoLinks\}/);
});

test('Worker page loader does not generate thumbnails or perform external/network mutations', () => {
  assert.doesNotMatch(page, /fetchVideoThumbnail|fetchOgImage|setVideoLinks|enqueueHeroVideoConversions/);
  assert.doesNotMatch(page, /node:(?:fs|child_process)|from ['"]sharp['"]/);
  assert.doesNotMatch(page, /fetch\s*\(/);
});

test('Node page path retains native database fallback by leaving adapter undefined outside Worker', () => {
  assert.match(page, /let adapter:.* \| undefined/);
  assert.match(page, /if \(runtime\) \{/);
  assert.match(page, /const settings = await getSettings\(adapter\)/);
  assert.match(page, /listVideoLinks\(adapter\)/);
  assert.match(page, /\{runtime && <p role="status" class="preview-notice">Worker 預覽環境目前無法執行影片轉檔或變更影片連結；相關操作在此環境不會生效。<\/p>\}/);
  assert.match(page, /<Videos client:load settings=\{videoSettings\} videoLinks=\{videoLinks\} canCarousel=\{canCarousel\} canLinks=\{canLinks\} \/>/);
});
