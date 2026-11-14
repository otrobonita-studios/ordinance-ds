import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAll, sameBytes, sbom } from '../scripts/build.mjs';
import { loadPlugins } from '../scripts/lib.mjs';

test('the same sources give the same bytes', () => {
  const a = buildAll().files, b = buildAll().files;
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const k of Object.keys(a)) assert.ok(sameBytes(a[k], b[k]), k);
});
test('without a plugin, its pages and its items in the menu are gone', () => {
  const full = buildAll(), less = buildAll({ without: ['example'] });
  assert.ok('example-plugin.html' in full.files);
  assert.ok(!('example-plugin.html' in less.files));
  assert.ok(String(full.files['index.html']).includes('href="example-plugin.html"'));
  assert.ok(!String(less.files['index.html']).includes('example-plugin.html'));
});
test('a page with "under" follows that page in the menu, and stands alone when that page is not built', () => {
  const menu = (b) => String(b.files['example-plugin.html']);
  const items = [...menu(buildAll()).matchAll(/<a class="(ord-menu__item[^"]*)" href="([^"]+)"/g)].map((m) => [m[2], m[1]]);
  const at = items.findIndex(([file]) => file === 'plugins.html');
  assert.deepEqual(items[at + 1], ['example-plugin.html', 'ord-menu__item ord-menu__sub']);
  const alone = menu(buildAll({ without: ['guide'] }));
  assert.ok(!alone.includes('ord-menu__sub') && alone.includes('class="ord-menu__item" href="example-plugin.html" aria-current="page"'));
});
test('with no plugin, the stylesheet and the bill of materials still build', () => {
  const none = buildAll({ without: loadPlugins().map((p) => p.id) });
  assert.equal(none.pages.length, 0);
  assert.ok('ordinance.css' in none.files && 'sbom.cdx.json' in none.files);
});
test('every page marks itself, and only itself, as the current page', () => {
  const { files, pages } = buildAll();
  for (const p of pages) assert.deepEqual([...String(files[p.file]).matchAll(/class="ord-menu__item[^"]*" href="([^"]+)" aria-current="page"/g)].map((m) => m[1]), [p.file]);
});
test('the bill of materials is CycloneDX, with no date and one entry for each component', () => {
  const bom = JSON.parse(sbom(loadPlugins()));
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.metadata.timestamp, undefined);
  const withFile = JSON.parse(sbom([{ id: 'x', thirdParty: [{ name: 'lib', version: '1.0.0', licence: 'MIT', source: 'the project', files: [{ path: 'third-party/lib/a.js', sha256: 'ab' }] }] }]));
  assert.equal(withFile.components.length, bom.components.length + 1);
  const lib = withFile.components.find((c) => c.name === 'lib');
  assert.equal(lib.components[0].hashes[0].content, 'ab');
});
