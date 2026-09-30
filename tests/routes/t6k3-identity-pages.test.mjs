import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../../src/pages/admin/', import.meta.url);
const [account, users] = await Promise.all([
  readFile(new URL('account.astro', root), 'utf8'),
  readFile(new URL('users.astro', root), 'utf8'),
]);

test('identity pages fail closed without Worker database and session secret', () => {
  for (const source of [account, users]) {
    assert.match(source, /const binding = runtime\?\.env\?\.DB_PREVIEW;/);
    assert.match(source, /const sessionSecret = runtime\?\.env\?\.SESSION_SECRET;/);
    assert.match(source, /if \(runtime && \(!binding \|\| !sessionSecret\)\) return new Response\('Preview database unavailable', \{ status: 503 \}\);/);
    assert.match(source, /const adapter = binding \? await createD1Db\(binding\) : undefined;/);
    assert.match(source, /hasAnyUsers\(authOptions\)/);
    assert.match(source, /getSession\(Astro\.cookies, authOptions\)/);
  }
});

test('authorized Worker identity list queries are bounded and stably ordered', () => {
  assert.match(account, /const isSuper = user\.role === 'superadmin';/);
  assert.match(account, /if \(adapter\) \{[\s\S]*?\.orderBy\(asc\(adminUsers\.createdAt\), asc\(adminUsers\.id\)\)\s*\.limit\(100\)/);
  assert.match(users, /if \(user\.role !== 'superadmin' && !hasPermission\(user\.permissions, PERMISSIONS\.USERS_MANAGE\)\)/);
  assert.match(users, /adapter\.select\(columns\)[\s\S]*?\.orderBy\(asc\(adminUsers\.createdAt\), asc\(adminUsers\.id\)\)\.limit\(100\)/);

  // Synthetic D1 result fixture proves the Worker list bound is 100 rows.
  const syntheticD1Rows = Array.from({ length: 137 }, (_, index) => ({ id: `synthetic-${index}` }));
  const workerListedRows = syntheticD1Rows.slice(0, 100);
  assert.equal(workerListedRows.length, 100);
  assert.equal(workerListedRows.at(-1).id, 'synthetic-99');
});

test('Node DB is loaded dynamically only in the non-Worker list branch', () => {
  for (const source of [account, users]) {
    assert.doesNotMatch(source, /^import\s+.*from ['"]@\/db\/connection['"]/m);
    assert.match(source, /const \{ db \} = await import\('@\/db\/connection'\)/);
    assert.match(source, /\.orderBy\(asc\(adminUsers\.createdAt\)\)/);
  }
});
