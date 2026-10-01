import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { handleSellInquiry } from '../../src/pages/api/sell.ts';

function settings() {
  return { featureLicenseMask: 1023, featureMask: 1023 };
}

function syntheticD1({ fail = false } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/d1/0002_shared_rate_limits.sql', import.meta.url), 'utf8'));
  const convert = (query) => {
    const statement = { query, args: [] };
    return Object.assign(statement, {
      bind(...values) { statement.args = values; return statement; },
      async first() { if (fail) throw new Error('synthetic D1 failure'); return sqlite.prepare(query).get(...statement.args) ?? null; },
      async all() { if (fail) throw new Error('synthetic D1 failure'); return { results: sqlite.prepare(query).all(...statement.args) }; },
      async run() {
        if (fail) throw new Error('synthetic D1 failure');
        const result = sqlite.prepare(query).run(...statement.args);
        return { success: true, meta: { changes: result.changes } };
      },
    });
  };
  return {
    sqlite,
    prepare: convert,
    async batch(statements) {
      if (fail) throw new Error('synthetic D1 failure');
      const transaction = sqlite.transaction(() => statements.map((statement) => {
        if (statement.query.includes('RETURNING')) {
          const results = sqlite.prepare(statement.query).all(...statement.args);
          return { success: true, results, meta: { changes: results.length } };
        }
        const result = sqlite.prepare(statement.query).run(...statement.args);
        return { success: true, meta: { changes: result.changes } };
      }));
      return transaction();
    },
  };
}

function context({ db, worker = true } = {}) {
  const form = new FormData();
  form.set('contactInfo', 'DEMO-contact');
  form.set('contactName', 'DEMO-name');
  let settingsCalls = 0;
  let inquiryCalls = 0;
  const request = new Request('https://synthetic.test/api/sell', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '192.0.2.20' },
    body: form,
  });
  return {
    input: { request, ...(worker ? { locals: { runtime: { env: { DB_PREVIEW: db } } } } : {}) },
    dependencies: {
      async getSettings() { settingsCalls += 1; return settings(); },
      async createSellInquiry() { inquiryCalls += 1; },
      async sendNotification() {},
    },
    counts: () => ({ settingsCalls, inquiryCalls }),
  };
}

test('Workers sell inquiry accepts five attempts per IP per hour and rejects the sixth', async () => {
  const db = syntheticD1();
  const ctx = context({ db });
  const responses = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const attemptContext = context({ db });
    responses.push(await handleSellInquiry(attemptContext.input, {
      ...attemptContext.dependencies,
      now: () => 1_000,
    }));
  }

  assert.deepEqual(responses.map(({ status }) => status), [200, 200, 200, 200, 200, 429]);
  assert.deepEqual(ctx.counts(), { settingsCalls: 0, inquiryCalls: 0 });
  assert.equal(db.sqlite.prepare("SELECT count FROM shared_rate_limits WHERE limiter = 'sell' AND limiter_key = ?").get('192.0.2.20').count, 5);
});

test('Workers sell inquiry allows a new attempt after one hour', async () => {
  const db = syntheticD1();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ctx = context({ db });
    const response = await handleSellInquiry(ctx.input, { ...ctx.dependencies, now: () => 1_000 });
    assert.equal(response.status, 200);
  }
  const next = context({ db });
  const response = await handleSellInquiry(next.input, { ...next.dependencies, now: () => 3_601_000 });
  assert.equal(response.status, 200);
  assert.deepEqual(next.counts(), { settingsCalls: 1, inquiryCalls: 1 });
});

test('Workers sell inquiry fails closed when the shared limiter binding is absent', async () => {
  const ctx = context();
  const response = await handleSellInquiry(ctx.input, ctx.dependencies);

  assert.equal(response.status, 429);
  assert.deepEqual(ctx.counts(), { settingsCalls: 0, inquiryCalls: 0 });
});

test('Workers sell inquiry fails closed on D1 error before settings or inquiry calls', async () => {
  const ctx = context({ db: syntheticD1({ fail: true }) });
  const response = await handleSellInquiry(ctx.input, ctx.dependencies);

  assert.equal(response.status, 429);
  assert.deepEqual(ctx.counts(), { settingsCalls: 0, inquiryCalls: 0 });
});

test('Node sell inquiry keeps the in-memory rate limit path', async () => {
  const ctx = context({ worker: false });
  const response = await handleSellInquiry(ctx.input, ctx.dependencies);

  assert.equal(response.status, 200);
  assert.deepEqual(ctx.counts(), { settingsCalls: 1, inquiryCalls: 1 });
});
