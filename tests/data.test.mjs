import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read } from '../scripts/lib.mjs';

// the browser script, run here with a small stand-in for the page
function load(fetchImpl) {
  const win = { location: new URL('http://site.example/page.html'), URL, fetch: fetchImpl };
  win.globalThis = win;
  vm.runInNewContext(read('plugins', 'data', 'assets', 'ord-data.js'), win);
  return win.ordData;
}
const schema = { type: 'object', props: { name: { type: 'string', max: 10 }, n: { type: 'number', min: 0, max: 5 }, tags: { type: 'array', max: 2, items: { type: 'string' } }, note: { type: 'string', optional: true } } };
const message = (re) => (e) => re.test(e.message);

test('data that fits passes, and a key that the schema does not name is left out', () => {
  const out = load().validate({ name: 'a', n: 1, tags: ['x'], extra: '<script>' }, schema);
  assert.equal(out.extra, undefined);
  assert.equal(out.name, 'a');
});
test('a wrong type, a value out of range and a long list are refused with their path', () => {
  const d = load();
  assert.throws(() => d.validate({ name: 'a', n: 'one', tags: [] }, schema), (e) => e.path === 'n' && /must be a number/.test(e.message));
  assert.throws(() => d.validate({ name: 'a', n: 9, tags: [] }, schema), message(/at most 5/));
  assert.throws(() => d.validate({ name: 'a', n: 1, tags: ['a', 'b', 'c'] }, schema), message(/too many/));
  assert.throws(() => d.validate({ name: 'x'.repeat(11), n: 1, tags: [] }, schema), message(/too long/));
  assert.throws(() => d.validate({ n: 1, tags: [] }, schema), (e) => e.path === 'name');
});
test('text that is not JSON is refused', () => {
  assert.throws(() => load().parse('{', schema), message(/not valid JSON/));
});
test('an address on another server is refused, and no request is made', async () => {
  let asked = 0;
  const d = load(() => { asked++; return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') }); });
  await assert.rejects(d.load('//other.example/x.json', schema), message(/another server/));
  await assert.rejects(d.load('http://other.example/x.json', schema), message(/another server/));
  assert.equal(asked, 0);
});
test('an address on the same server is asked once, and its answer is checked', async () => {
  const calls = [];
  const d = load((url, opts) => { calls.push([url, opts]); return Promise.resolve({ ok: true, text: () => Promise.resolve('{"name":"a","n":2,"tags":[]}') }); });
  const out = await d.load('data/x.json', schema);
  assert.equal(out.n, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'http://site.example/data/x.json');
  assert.equal(calls[0][1].redirect, 'error');
  const bad = load(() => Promise.resolve({ ok: true, text: () => Promise.resolve('{"name":"a","n":"x","tags":[]}') }));
  await assert.rejects(bad.load('data/x.json', schema), message(/must be a number/));
});
