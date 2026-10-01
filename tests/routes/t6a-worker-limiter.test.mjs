import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { createD1RateLimiter } from '../../src/lib/shared-rate-limit.ts';

function syntheticD1() {
  const sqlite = new Database(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/d1/0002_shared_rate_limits.sql', import.meta.url), 'utf8'));
  const convert = (query) => {
    const statement = { query, args: [] };
    return Object.assign(statement, {
      bind(...values) { statement.args = values; return statement; },
      async first() { return sqlite.prepare(query).get(...statement.args) ?? null; },
      async all() { return { results: sqlite.prepare(query).all(...statement.args) }; },
      async run() {
        const result = sqlite.prepare(query).run(...statement.args);
        return { success: true, meta: { changes: result.changes } };
      },
    });
  };
  return {
    sqlite,
    prepare: convert,
    async batch(statements) {
      const transaction = sqlite.transaction(() => statements.map((statement) => {
        const query = statement.query;
        const prepared = sqlite.prepare(query);
        if (query.includes('RETURNING')) {
          const results = prepared.all(...statement.args);
          return { success: true, results, meta: { changes: results.length } };
        }
        const result = prepared.run(...statement.args);
        return { success: true, meta: { changes: result.changes } };
      }));
      return transaction();
    },
  };
}

// Keep query/args available to batch, matching the D1 prepared statement shape.
function d1() {
  return syntheticD1();
}

test('D1 worker limiter atomically accepts five sell attempts per window and then closes', async () => {
  const db = d1();
  const limiter = createD1RateLimiter(db);
  const results = await Promise.all(Array.from({ length: 8 }, () => limiter.consumeAttempt(' 192.0.2.5 ', 1_000)));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(await limiter.consumeAttempt('192.0.2.5', 3_600_999), false);
  assert.equal(await limiter.consumeAttempt('192.0.2.5', 3_601_000), true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM shared_rate_limits').get().count, 1);
});

test('D1 worker login locks on the fifth failure, expires, clears, and prunes old rows', async () => {
  const db = d1();
  const limiter = createD1RateLimiter(db);
  for (let attempt = 0; attempt < 5; attempt += 1) await limiter.recordFailure('192.0.2.5::admin', 10_000 + attempt);
  assert.equal(await limiter.isLocked('192.0.2.5::admin', 10_004), true);
  assert.equal(await limiter.isLocked('192.0.2.5::admin', 310_004), false);
  await limiter.clear('192.0.2.5::admin');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM shared_rate_limits').get().count, 0);
  await limiter.consumeAttempt('expired', 0);
  await limiter.consumeAttempt('new', 3_600_000);
  assert.equal(db.sqlite.prepare('SELECT limiter_key FROM shared_rate_limits').get().limiter_key, 'new');
});

test('D1 worker limiter rejects malformed and oversized keys and timestamps', async () => {
  const limiter = createD1RateLimiter(d1());
  await assert.rejects(limiter.consumeAttempt('x'.repeat(257), 1));
  await assert.rejects(limiter.consumeAttempt('valid', Number.NaN));
  await assert.rejects(limiter.isLocked('   ', 1));
});

test('D1 worker limiter prunes expired keys, caps rows, and rejects a new live key when full', async () => {
  const db = d1();
  const limiter = createD1RateLimiter(db);
  db.sqlite.prepare(`
    WITH RECURSIVE keys(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM keys WHERE n < 10000)
    INSERT INTO shared_rate_limits (limiter, limiter_key, count, window_started_at, expires_at)
    SELECT 'sell', 'key-' || n, 1, 1, 999999 FROM keys
  `).run();
  assert.equal(await limiter.consumeAttempt('new-key', 100), false);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM shared_rate_limits').get().count, 10_000);
  assert.equal(await limiter.consumeAttempt('key-1', 100), true);
});
