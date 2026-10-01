import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const login = await readFile(new URL('../../src/pages/admin/login.astro', import.meta.url), 'utf8');
const setup = await readFile(new URL('../../src/pages/admin/setup.astro', import.meta.url), 'utf8');

test('login uses request D1 for settings and fails closed when Worker preview has no DB_PREVIEW', () => {
  assert.match(login, /const runtime = Astro\.locals\.runtime;/);
  assert.match(login, /const binding = runtime\?\.env\?\.DB_PREVIEW;/);
  assert.match(login, /if \(runtime && !binding\) return new Response\('Preview database unavailable', \{ status: 503 \}\);/);
  assert.match(login, /const adapter = binding \? await createD1Db\(binding\) : undefined;/);
  assert.match(login, /const settings = await getSettings\(adapter\);/);
});

test('setup rejects Worker preview before loading credentials or touching a database', () => {
  const guard = setup.indexOf("if (runtime) {");
  const response = setup.indexOf("return new Response('Admin setup is disabled in Worker preview', { status: 403 });");
  const imports = setup.indexOf('await Promise.all([');
  assert.ok(guard >= 0 && response > guard && imports > response);
  assert.match(setup, /import\('@\/lib\/auth'\)/);
  assert.match(setup, /import\('@\/lib\/crypto'\)/);
  assert.match(setup, /import\('@\/db\/connection'\)/);
  assert.match(setup, /await db\.insert\(adminUsers\)/);
  assert.match(setup, /hashPassword\(password\)/);
});
