import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparisonHref, createCompareStore, normalizeCompareItems, normalizeCompareSlugs } from '../../src/lib/vehicle-comparison.ts';

const car = (slug) => ({ slug, title: `Bentley ${slug}`, thumb: `/media/${slug}.jpg`, year: '2022' });
function memoryStorage(seed = {}) {
  const entries = new Map(Object.entries(seed));
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}

test('comparison keeps at most four distinct nonempty slugs in user order', () => {
  assert.deepEqual(normalizeCompareSlugs([' A ', 'A', null, 2, '', 'B', 'C', 'D', 'E']), ['A', 'B', 'C', 'D']);
  for (const input of [null, {}, 'A', 4]) assert.deepEqual(normalizeCompareSlugs(input), []);
});

test('explicit empty comparison URL cannot restore a previously stored list', () => {
  const href = comparisonHref([]);
  const query = new URL(href, 'https://example.test').searchParams;
  assert.equal(query.has('ids'), true);
  assert.equal(query.get('ids'), '');
  assert.equal(new URL(comparisonHref(['車款 & 1', 'A']), 'https://example.test').searchParams.get('ids'), '車款 & 1,A');
});

test('old metadata is supported while malformed shapes and executable image URLs are discarded', () => {
  const items = normalizeCompareItems(['A', 'B', '__proto__'], JSON.parse('{"A":{"title":" Wraith ","model":"Wraith","thumb":"javascript:alert(1)"},"B":null}'));
  assert.deepEqual(items, [
    { slug:'A', title:'Wraith', thumb:'', year:'' },
    { slug:'B', title:'B', thumb:'', year:'' },
    { slug:'__proto__', title:'__proto__', thumb:'', year:'' },
  ]);
  assert.equal(normalizeCompareItems(['A'], { A:{title:'A', thumb:'https://example.test/car.jpg'} })[0].thumb, 'https://example.test/car.jpg');
});

test('corrupt saved JSON does not crash reads and the next real selection repairs both keys', () => {
  const storage = memoryStorage({ compare_slugs:'{broken', compare_meta:'[]' });
  const store = createCompareStore(storage);
  assert.deepEqual(store.read(), []);
  store.write([car('A')]);
  assert.deepEqual(createCompareStore(storage).read(), [car('A')]);
});

test('remove and clear survive new page reads without retaining orphan metadata', () => {
  const storage = memoryStorage();
  const store = createCompareStore(storage);
  store.write([car('A'),car('B')]);
  store.write(store.read().filter(item => item.slug !== 'A'));
  assert.deepEqual(createCompareStore(storage).read(), [car('B')]);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem('compare_meta'))), ['B']);
  store.write([]);
  assert.deepEqual(createCompareStore(storage).read(), []);
  assert.equal(storage.entries.size, 0);
});

test('storage unavailability and quota failures retain session state without claiming persistence', () => {
  const blocked = createCompareStore({ getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');} });
  assert.deepEqual(blocked.read(), []);
  blocked.write([car('A')]);
  assert.equal(blocked.persistent, false);
  assert.deepEqual(blocked.read(), [car('A')]);
  const quota = createCompareStore({ ...memoryStorage(),setItem(){throw new Error('quota');} });
  quota.write([car('B')]);
  assert.equal(quota.persistent, false);
  assert.deepEqual(quota.read(), [car('B')]);
});

test('later reads observe storage changes made by another page', () => {
  const storage = memoryStorage();
  const first = createCompareStore(storage), second = createCompareStore(storage);
  first.write([car('A')]);
  assert.deepEqual(second.read(), [car('A')]);
  second.write([]);
  assert.deepEqual(first.read(), []);
});
