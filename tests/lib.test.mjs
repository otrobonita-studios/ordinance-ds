import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, flatten, cssName, cssValue, renderTable, measuredPairs } from '../scripts/lib.mjs';

test('contrast follows the WCAG formula', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
});
test('every listed colour pair reaches its contrast in both themes', () => {
  for (const p of measuredPairs()) {
    assert.ok(p.light >= p.min, `${p.text} on ${p.on}, light`);
    assert.ok(p.dark >= p.min, `${p.text} on ${p.on}, dark`);
  }
});
test('a token inherits its type from its group, and gets a CSS name from its path', () => {
  const list = flatten({ size: { $type: 'dimension', big: { $value: { value: 2, unit: 'rem' } }, none: { $value: { value: 0, unit: 'rem' } } } });
  assert.equal(list[0].type, 'dimension');
  assert.equal(cssName(list[0].path), '--ord-size-big');
  assert.equal(cssValue(list[0]), '2rem');
  assert.equal(cssValue(list[1]), '0');
});
test('a typeface name with a space is quoted, and a generic name is not', () => {
  assert.equal(cssValue({ type: 'fontFamily', value: ['Segoe UI', 'sans-serif'] }), '"Segoe UI", sans-serif');
});
test('a table writes data as text, never as markup', () => {
  const html = renderTable({ caption: 'c', columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', kind: 'code' }], rows: [{ a: '<img src=x onerror=alert(1)>', b: '<b>' }] });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('<code>&lt;b&gt;</code>'));
});
test('a table without rows is an empty state in words', () => {
  assert.match(renderTable({ columns: [], rows: [], empty: 'Nothing today.' }), /class="ord-empty">Nothing today\./);
});
