import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../../src/pages/admin/settings/ai-chatbot.astro', import.meta.url), 'utf8');

test('AI settings page returns controlled 503 before accessing data when preview bindings are missing', () => {
  assert.match(page, /if\s*\(runtime\s*&&\s*\(!env\?\.DB_PREVIEW\s*\|\|\s*!env\.SESSION_SECRET\)\)\s*\{\s*return new Response\([\s\S]*?status:\s*503\s*\}\s*\)/);
  assert.ok(page.indexOf('return new Response(') < page.indexOf('createD1Db(env.DB_PREVIEW)'));
  assert.ok(page.indexOf('return new Response(') < page.indexOf('hasAnyUsers(authOptions)'));
  assert.match(page, /createD1Db\(env\.DB_PREVIEW\)/);
  assert.match(page, /sessionSecret:\s*env\.SESSION_SECRET/);
});

test('AI settings page uses request D1 for authentication and settings', () => {
  assert.match(page, /hasAnyUsers\(authOptions\)/);
  assert.match(page, /getSession\(Astro\.cookies,\s*authOptions\)/);
  assert.match(page, /getSettings\(db\)/);
});

test('preview OpenCode status has a complete empty shape and shows the disabled notice without provider calls', () => {
  assert.match(page, /servers:\s*\[\]/);
  for (const field of ['serversSource', 'textModel', 'textModelSource', 'visionModel', 'visionModelSource', 'textVariant', 'textVariantSource', 'visionVariant', 'visionVariantSource', 'envUrl']) {
    assert.match(page, new RegExp(`${field}:\\s*'none'|${field}:\\s*''`), `${field} should have an empty synthetic value`);
  }
  assert.match(page, /previewDisabled:\s*true/);
  assert.match(page, /Preview 環境已停用 OpenCode 設定/);
  assert.match(page, /runtime\s*\?\s*\{[\s\S]*?previewDisabled:\s*true[\s\S]*?\}\s*:\s*await[\s\S]*getOpenCodeStatus\(\)/);
  assert.doesNotMatch(page, /baseUrl|password|OPENCODE_SERVER_PASSWORD/);
});
