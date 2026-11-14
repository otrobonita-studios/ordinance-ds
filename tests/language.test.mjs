import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../scripts/lib.mjs';
import { buildAll } from '../scripts/build.mjs';

// A second language, made for this test and removed again: one translated page, one title and two texts of the interface.
const lang = 'zz';
const dir = join(root, 'plugins', 'example', 'lang', lang);
const strings = join(root, 'strings', `${lang}.json`);

test('a second language gets its own folder, and falls back to the first language', () => {
  try {
    mkdirSync(join(dir, 'pages'), { recursive: true });
    writeFileSync(join(dir, 'pages', 'example-plugin.html'), '<header class="ord-page__head"><h1>Zz example</h1></header>\n');
    writeFileSync(join(dir, 'titles.json'), '{ "example-plugin.html": "Zz plugin" }\n');
    writeFileSync(strings, '{ "menu": "Zz menu", "language-name": "Zzish", "group-build": "Zz build" }\n');
    const { files, pages } = buildAll({ languages: ['en', lang] });

    // the first language stays at the top, and the second one is in its folder
    assert.ok('index.html' in files && `${lang}/index.html` in files);
    assert.equal(pages.filter((p) => p.lang === lang).length, pages.length / 2);

    const page = String(files[`${lang}/example-plugin.html`]);
    assert.match(page, /<html lang="zz">/);
    assert.match(page, /<h1>Zz example<\/h1>/);                       // the translated fragment
    assert.match(page, /<title>Zz plugin · /);                        // the translated title
    assert.match(page, />Zz menu<\/button>/);                        // a translated text of the interface
    assert.match(page, />Zz build<\/p>/);                            // a translated group of the menu
    assert.match(page, />Close menu<\/button>/);                     // a text that is not translated falls back
    assert.match(page, /href="\.\.\/ordinance\.css"/);               // the stylesheet is shared
    assert.ok(!/<main[^>]* lang=/.test(page));                       // a translated page needs no second lang attribute

    // a page without a translation shows the first language, and says so
    const home = String(files[`${lang}/index.html`]);
    assert.match(home, /<main class="ord-page" id="content" lang="en">/);

    // each page links to itself in the other language
    assert.match(page, /href="\.\.\/example-plugin\.html" lang="en" hreflang="en">English</);
    assert.match(String(files['example-plugin.html']), /href="zz\/example-plugin\.html" lang="zz" hreflang="zz">Zzish</);
    // a file that is not a page is shared by all languages
    assert.match(String(files[`${lang}/sbom.html`]), /href="\.\.\/sbom\.cdx\.json"/);
  } finally {
    rmSync(join(root, 'plugins', 'example', 'lang'), { recursive: true, force: true });
    rmSync(strings, { force: true });
  }
});

test('with one language, the menu has no list of languages', () => {
  assert.ok(!String(buildAll().files['index.html']).includes('id="menu-lang"'));
});
