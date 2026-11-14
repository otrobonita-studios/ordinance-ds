import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessProblems } from '../scripts/a11y.mjs';
import { buildAll } from '../scripts/build.mjs';

const page = (body) => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title></head><body><main id="content">${body}</main></body></html>`;
const finds = (body, re) => assert.ok(accessProblems(page(body)).some((p) => re.test(p)), `expected ${re} for: ${body}\ngot: ${JSON.stringify(accessProblems(page(body)))}`);
const clean = (body) => assert.deepEqual(accessProblems(page(body)), []);

test('a sound page has no problem', () => {
  clean('<h1>Title</h1><a href="a.html">The report for May</a><button type="button">Save</button>');
});

test('a link and a button need a name in words', () => {
  finds('<button type="button"></button>', /has no name/);
  finds('<a href="a.html"><svg aria-hidden="true"><path/></svg></a>', /has no name/);
  clean('<a href="a.html" aria-label="Home"><svg aria-hidden="true"><path/></svg></a>');
  clean('<a href="a.html"><img src="a.png" alt="Home"></a>');
  finds('<a href="a.html">Click here</a>', /does not say where it leads/);
  finds('<a href="a.html">Read more.</a>', /does not say where it leads/);
  finds('<a>Nowhere</a>', /link without an address/);
});

test('a form control needs a label', () => {
  finds('<input type="text" id="n">', /has no label/);
  finds('<select><option>A</option></select>', /has no label/);
  clean('<label for="n">Name</label><input type="text" id="n">');
  clean('<label>Name <input type="text"></label>');
  clean('<input type="search" aria-label="Search the pages">');
  clean('<input type="hidden" name="x">');
  finds('<fieldset><input type="radio" aria-label="A"></fieldset>', /legend/);
});

test('a reference must lead to an element on the page', () => {
  finds('<section aria-labelledby="gone"><p>Text</p></section>', /aria-labelledby="gone" names no element/);
  finds('<label for="gone">Name</label>', /for="gone" names no element/);
  clean('<section aria-labelledby="h"><h2 id="h">Head</h2></section>');
  finds('<button type="button" commandfor="gone" command="show-modal">Open</button>', /commandfor="gone" names no element/);
});

test('a picture is hidden from a screen reader, or it has a name', () => {
  finds('<svg viewBox="0 0 1 1"><path/></svg>', /svg/);
  clean('<svg aria-hidden="true"><path/></svg>');
  clean('<svg role="img" aria-label="A rising line"><path/></svg>');
  finds('<iframe src="a.html"></iframe>', /iframe/);
});

test('tables, the keyboard, zoom and landmarks', () => {
  finds('<table><caption>C</caption><tr><th>A</th></tr></table>', /th\) has no scope/);
  finds('<button type="button" tabindex="3">A</button>', /tabindex="3"/);
  clean('<div tabindex="-1">A</div>');
  finds('<button type="button" accesskey="s">Save</button>', /accesskey/);
  finds('<input type="text" aria-label="A" autofocus>', /autofocus/);
  finds('<p lang="english">Text</p>', /not a language code/);
  finds('<div aria-hidden="true"><button type="button">A</button></div>', /aria-hidden/);
  finds('<nav aria-label="Menu"></nav><nav aria-label="Menu"></nav>', /same name/);
  assert.ok(accessProblems(page('').replace('initial-scale=1', 'initial-scale=1, user-scalable=no')).some((p) => /zooming/.test(p)));
  assert.ok(accessProblems('<html lang="en"><body><p>No main</p></body></html>').some((p) => /exactly one main/.test(p)));
});

test('every built page passes these rules', () => {
  const { files, pages } = buildAll();
  for (const p of pages) assert.deepEqual(accessProblems(String(files[p.file])), [], p.file);
});
