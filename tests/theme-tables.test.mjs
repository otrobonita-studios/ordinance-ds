import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme, renderTable } from '../scripts/lib.mjs';

const base = () => ({
  color: { $type: 'color', accent: { $value: { hex: '#1b3fa0' }, $description: 'The action colour.' }, text: { $value: { hex: '#111111' } } },
  radius: { $type: 'dimension', sm: { $value: { value: 0.125, unit: 'rem' } } },
});

test('a theme changes the value of a token, and keeps everything else', () => {
  const t = applyTheme(base(), { color: { accent: { $value: { hex: '#00594d' } } } });
  assert.equal(t.color.accent.$value.hex, '#00594d');
  assert.equal(t.color.accent.$description, 'The action colour.');
  assert.equal(t.color.text.$value.hex, '#111111');
  assert.equal(t.radius.sm.$value.value, 0.125);
});

test('a theme cannot add a token, and it must give a value', () => {
  assert.throws(() => applyTheme(base(), { color: { brand: { $value: { hex: '#000000' } } } }), /color\.brand, which is not a token/);
  assert.throws(() => applyTheme(base(), { shadow: { sm: { $value: 1 } } }), /shadow, which is not a token/);
  assert.throws(() => applyTheme(base(), { color: { accent: { hex: '#000000' } } }), /color\.accent a \$value/);
});

const table = (more = {}, col = {}) => renderTable({ caption: 'C', columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', ...col }], rows: [{ a: 'x', b: 'y' }], ...more });

test('a table gets a class for each variant, and an unknown variant stops the build', () => {
  assert.match(table({ variant: ['compact', 'zebra'] }), /<table class="ord-table ord-table--compact ord-table--zebra">/);
  assert.match(table(), /<table class="ord-table">/);
  assert.throws(() => table({ variant: ['dense'] }), /variant dense/);
});

test('a column gets classes for its kind, its wrap and its width', () => {
  const html = table({}, { kind: 'num', wrap: 'nowrap', width: 'narrow' });
  assert.match(html, /<th scope="col" class="ord-table__num ord-table__nowrap ord-table__narrow">B<\/th>/);
  assert.match(html, /<td class="ord-table__num ord-table__nowrap ord-table__narrow">y<\/td>/);
  assert.throws(() => table({}, { wrap: 'clip' }), /wrap clip/);
  assert.throws(() => table({}, { width: 'huge' }), /width huge/);
});

test('a tall table scrolls in a frame that takes the focus and has a name, and a foot is the last row', () => {
  const html = table({ tall: true, foot: { a: 'Sum', b: '2' } });
  assert.match(html, /<div class="ord-table-scroll ord-table-scroll--tall" tabindex="0" role="region" aria-label="C">/);
  assert.match(html, /<tfoot><tr><th scope="row">Sum<\/th><td>2<\/td><\/tr><\/tfoot>/);
  assert.ok(!table().includes('tfoot') && !table().includes('tabindex'));
});
