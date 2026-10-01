import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shouldHidePublicAiChat } from '../../src/lib/production-feature-policy.ts';

test('hides the public AI affordance only on the enabled production Worker profile', () => {
  assert.equal(shouldHidePublicAiChat({ env: { MITA_ENV: 'production', MITA_PUBLIC_SYNC_ENABLED: 'true' } }), true);
  assert.equal(shouldHidePublicAiChat({ env: { MITA_ENV: 'preview', MITA_PUBLIC_SYNC_ENABLED: 'true' } }), false);
  assert.equal(shouldHidePublicAiChat({ env: { MITA_ENV: 'production', MITA_PUBLIC_SYNC_ENABLED: 'false' } }), false);
  assert.equal(shouldHidePublicAiChat(undefined), false);
});

test('PublicLayout gates only ChatWidget with the production-specific predicate', async () => {
  const source = await readFile(new URL('../../src/layouts/PublicLayout.astro', import.meta.url), 'utf8');
  assert.match(source, /shouldHidePublicAiChat/);
  assert.match(source, /features\.aiChatbot\s*&&\s*!hidePublicAiChat/);
  assert.match(source, /<ChatWidget client:load openingMessage=\{settings\.aiChatOpening\}/);
  assert.match(source, /features\.compare/);
});

test('/api/chat keeps its existing Worker denial before parsing or provider access', async () => {
  const source = await readFile(new URL('../../src/pages/api/chat.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(locals\.runtime\)\s*\{\s*return Response\.json\(\{ error: 'AI 客服在預覽環境中已停用。', previewDisabled: true \}, \{ status: 503 \}\);/);
  assert.match(source, /const \[\{ getSettings \}.*Promise\.all\(\[/s);
});
