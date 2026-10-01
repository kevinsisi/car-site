import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import Database from 'better-sqlite3';
import { hashPassword, signSession, verifySignedSession } from '../../src/lib/crypto.ts';
import { createSession, destroySession, getSession } from '../../src/lib/auth.ts';
import * as schema from '../../src/db/schema.ts';
import { createD1Db } from '../../src/db/d1.ts';

function createSyntheticD1Binding(label) {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
  CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', permissions INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
`);
  const calls = [];
  const binding = {
    label,
    calls,
    prepare(query) {
      calls.push({ method: 'prepare', query });
      let parameters = [];
      const prepared = {
        bind(...values) {
          calls.push({ method: 'bind', values });
          parameters = values;
          return prepared;
        },
        async all() {
          calls.push({ method: 'all' });
          return { results: sqlite.prepare(query).all(...parameters) };
        },
        async raw() {
          calls.push({ method: 'raw' });
          return sqlite.prepare(query).raw().all(...parameters);
        },
        async first() {
          calls.push({ method: 'first' });
          return sqlite.prepare(query).get(...parameters) ?? null;
        },
        async run() {
          calls.push({ method: 'run' });
          const result = sqlite.prepare(query).run(...parameters);
          return { success: true, meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } };
        },
      };
      return prepared;
    },
    close() {
      sqlite.close();
    },
  };
  return binding;
}

const firstBinding = createSyntheticD1Binding('first');
const secondBinding = createSyntheticD1Binding('second');
const firstDbPromise = createD1Db(firstBinding);
const secondDbPromise = createD1Db(secondBinding);
const secret = 'synthetic-request-secret';
const cookiesFor = (value) => ({ get: (name) => name === 'car_site_admin' && value ? { value } : undefined, delete() {} });

after(() => {
  firstBinding.close();
  secondBinding.close();
});

test('createD1Db session adapters use their supplied D1 bindings and isolate sessions', async () => {
  const firstDb = await firstDbPromise;
  const secondDb = await secondDbPromise;
  assert.strictEqual(firstDb.$client, firstBinding);
  assert.strictEqual(secondDb.$client, secondBinding);

  await firstDb.insert(schema.adminUsers).values({
    id: 'synthetic-user', username: 'synthetic', passwordHash: hashPassword('synthetic-password'),
    role: 'admin', permissions: 3, createdAt: new Date().toISOString(),
  });
  await secondDb.insert(schema.adminUsers).values({
    id: 'synthetic-user', username: 'synthetic', passwordHash: hashPassword('synthetic-password'),
    role: 'admin', permissions: 3, createdAt: new Date().toISOString(),
  });
  assert.ok(firstBinding.calls.some(({ method }) => method === 'run'));
  assert.ok(secondBinding.calls.some(({ method }) => method === 'run'));

  const created = await createSession('synthetic', 'synthetic-password', { db: firstDb, sessionSecret: secret });
  assert.ok(created);
  assert.equal(verifySignedSession(created.cookieValue, secret)?.length, 36);
  assert.equal(verifySignedSession(created.cookieValue, 'different-request-secret'), null);
  assert.equal((await getSession(cookiesFor(created.cookieValue), { db: firstDb, sessionSecret: secret }))?.id, 'synthetic-user');
  assert.equal(await getSession(cookiesFor(created.cookieValue), { db: firstDb, sessionSecret: 'different-request-secret' }), null);
  assert.equal(await getSession(cookiesFor(created.cookieValue), { db: secondDb, sessionSecret: secret }), null);

  await destroySession(cookiesFor(created.cookieValue), { db: firstDb, sessionSecret: secret });
  assert.equal(await getSession(cookiesFor(created.cookieValue), { db: firstDb, sessionSecret: secret }), null);
});

test('Node crypto defaults preserve the session cookie format', () => {
  const signed = signSession('synthetic-session-id');
  assert.match(signed, /^synthetic-session-id\.[a-f0-9]{64}$/);
  assert.equal(verifySignedSession(signed), 'synthetic-session-id');
});
