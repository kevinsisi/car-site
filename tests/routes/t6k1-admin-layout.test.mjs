import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../../src/layouts/AdminLayout.astro', import.meta.url), 'utf8');

test('AdminLayout wires request DB_PREVIEW through a request-scoped D1 adapter to settings', () => {
  assert.match(source, /const runtime = Astro\.locals\.runtime;/);
  assert.match(source, /const binding = runtime\?\.env\?\.DB_PREVIEW;/);
  assert.match(source, /const adapter = binding \? await createD1Db\(binding\) : undefined;/);
  assert.match(source, /const settings = await getSettings\(adapter\);/);
});

test('AdminLayout fails closed with 503 for Worker requests without DB_PREVIEW', () => {
  assert.match(source, /if \(runtime && !binding\) return new Response\('Preview database unavailable', \{ status: 503 \}\);/);
});

test('AdminLayout preserves the Node settings path without a runtime binding', () => {
  assert.match(source, /const adapter = binding \? await createD1Db\(binding\) : undefined;/);
  assert.match(source, /const settings = await getSettings\(adapter\);/);
});
