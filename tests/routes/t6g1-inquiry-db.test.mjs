import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1Db } from '../../src/db/d1.ts';

const fields = ['id', 'brand', 'model', 'year', 'mileage', 'exterior_color', 'notes', 'contact_info', 'contact_name', 'photo_urls', 'created_at', 'read_at'];

function createBinding(seed = []) {
  const rows = [...seed];
  const calls = [];
  return {
    rows,
    calls,
    prepare(query) {
      let params = [];
      const normalized = query.toLowerCase();
      const matching = () => rows.filter((row) => !normalized.includes('"read_at" is null') || row.read_at === null);
      return {
        bind(...values) { params = values; return this; },
        async run() {
          calls.push({ query, params: [...params], method: 'run' });
          if (normalized.startsWith('insert')) {
            const values = Object.fromEntries(fields.map((field, index) => [field, params[index]]));
            rows.push(values);
          } else if (normalized.startsWith('update')) {
            const row = rows.find((entry) => entry.id === params[1]);
            if (row) row.read_at = params[0];
          }
          return { success: true };
        },
        async raw() {
          calls.push({ query, params: [...params], method: 'raw' });
          if (normalized.includes('count(')) return [[matching().length]];
          let selected = [...matching()].sort((a, b) => b.created_at.localeCompare(a.created_at));
          const limit = normalized.match(/limit\s+\?/);
          if (limit) selected = selected.slice(0, Number(params.at(-1)));
          const projectedFields = fields.filter((field) => normalized.includes(`"${field}"`));
          return selected.map((row) => projectedFields.map((field) => row[field]));
        },
      };
    },
  };
}

test('inquiries support D1 create, bounded newest-first list, read state, count, and empty results', async () => {
  const binding = createBinding();
  const db = await createD1Db(binding);
  const inquiries = await import('../../src/lib/sell-inquiries.ts');
  const input = {
    brand: 'Example', model: 'Model', year: 2024, mileage: 12000, exteriorColor: 'Blue',
    notes: 'Synthetic test', contactInfo: 'test@example.invalid', contactName: 'Test', photoUrls: ['/synthetic.jpg'],
  };

  assert.deepEqual(await inquiries.listSellInquiries(db), []);
  assert.equal(await inquiries.countUnreadSellInquiries(db), 0);
  const id = await inquiries.createSellInquiry(input, db);
  const [created] = await inquiries.listSellInquiries(db);
  assert.equal(created.id, id);
  assert.deepEqual(created.photoUrls, input.photoUrls);
  assert.equal(created.readAt, null);
  assert.equal(await inquiries.countUnreadSellInquiries(db), 1);

  await inquiries.markSellInquiryRead(id, db);
  assert.ok((await inquiries.listSellInquiries(db))[0].readAt);
  assert.equal(await inquiries.countUnreadSellInquiries(db), 0);

  for (let index = 0; index < 105; index += 1) {
    await inquiries.createSellInquiry({ ...input, model: `Model ${index}` }, db);
  }
  const latest = await inquiries.listSellInquiries(db);
  assert.equal(latest.length, 100);
  const listQuery = binding.calls.find(({ query }) => /from\s+"sell_inquiries"/i.test(query) && /order by/i.test(query));
  assert.match(listQuery.query, /order by\s+"sell_inquiries"\."created_at"\s+desc/i);
  assert.match(listQuery.query, /limit\s+\?/i);
  assert.equal(Number(listQuery.params.at(-1)), 100);
  assert.match(binding.calls.find(({ query }) => /count\(/i.test(query)).query, /count\s*\(/i);
  assert.ok(binding.calls.some(({ query }) => /limit\s+\?/i.test(query)));
  assert.ok(binding.calls.every(({ query }) => !/select\s+"id"[^\n]*from\s+"sell_inquiries"[^\n]*"read_at" is null/i.test(query)));
});
