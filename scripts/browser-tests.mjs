#!/usr/bin/env node
// The browser test: `node scripts/browser-tests.mjs`. No dependencies, but it needs Chrome or Edge.
// It serves dist/ with scripts/serve.mjs, so every page runs under the security headers, and it opens the pages in a
// browser without a window. It writes nothing to this folder and removes its own temporary profile.
//   CHROME_PATH=<path to the browser>   when no browser is found
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { siteServer } from './serve.mjs';
import { buildAll } from './build.mjs';

const browser = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => existsSync(p));
if (!browser) { console.error('No Chrome or Edge found. Set CHROME_PATH to the path of the browser.'); process.exit(2); }

const { pages } = buildAll();
const server = siteServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(), 'ordinance-test-'));
const debugPort = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(browser, ['--headless=new', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

const results = [];
const check = (name, pass, extra) => results.push({ name, pass: !!pass, extra });
let code;
try {
  let list = null;
  for (let i = 0; i < 60 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); } catch { /* not up yet */ } }
  if (!list) throw new Error('The browser did not start.');
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let n = 0; const pending = new Map(); const requests = []; const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text);
  };
  const call = (method, params = {}) => new Promise((r) => { const id = ++n; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const value = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'the page could not run the test code'); return r.result?.result?.value; };
  const key = async (k, c, vk) => { await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: c, windowsVirtualKeyCode: vk }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: c, windowsVirtualKeyCode: vk }); };
  const size = (w, h) => call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const open = async (file) => { await call('Page.navigate', { url: `${origin}/${file}` }); await sleep(500); };
  await call('Page.enable'); await call('Network.enable'); await call('Runtime.enable'); await call('Log.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));' });

  await call('Accessibility.enable');
  // WCAG 2.5.8 Target Size: every control that is not a link inside a sentence is at least 24 by 24 px
  const SMALL = `[...document.querySelectorAll('button, .ord-button, .ord-menu__item, .ord-tabs__tab, .ord-switch, input, select, textarea, summary')].filter((e) => e.getClientRects().length && !e.closest('dialog:not([open])')).map((e) => { const r = e.getBoundingClientRect(); return { el: e.className || e.tagName, w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 24 || x.h < 24)`;
  // WCAG 4.1.2 Name, Role, Value: the browser's own accessibility tree gives every control, picture, table and menu a name
  const NAMED_ROLES = new Set(['button', 'link', 'switch', 'tab', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'slider', 'spinbutton', 'menuitem', 'img', 'image', 'table', 'navigation']);
  const noName = async () => ((await call('Accessibility.getFullAXTree')).result?.nodes || [])
    .filter((x) => !x.ignored && NAMED_ROLES.has(x.role?.value) && !String(x.name?.value || '').trim()).map((x) => x.role.value);
  // what the keyboard focus looks like on the element that has it, and whether something covers it (2.4.7 and 2.4.11)
  const FOCUS = `(() => { const e = document.activeElement; if (!e || e === document.body) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1), top = document.elementFromPoint(x, y);
    return { el: (e.className || e.tagName) + ' ' + (e.textContent || '').trim().slice(0, 20), outline: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2,
      inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, covered: !(top && (e === top || e.contains(top) || top.contains(e))) }; })()`;
  // every page, wide and narrow: it loads under the security headers, asks no other server, and does not overflow
  for (const [w, h, label] of [[1280, 900, 'wide'], [320, 800, 'narrow (320 px)']]) {
    await size(w, h);
    const bad = [];
    for (const page of pages) {
      requests.length = 0; errors.length = 0;
      await open(page.file);
      const s = await value(`({ csp: window.__csp, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, h1: document.querySelectorAll('h1').length, current: [...document.querySelectorAll('#menu [aria-current="page"]')].map((a) => a.getAttribute('href')).join(), small: ${SMALL} })`);
      const unnamed = await noName();
      const outside = requests.filter((u) => !u.startsWith(origin));
      if (s.csp.length || outside.length || errors.length || s.overflow || s.h1 !== 1 || s.current !== page.file || s.small.length || unnamed.length) bad.push({ page: page.file, ...s, unnamed, outside, errors: [...errors] });
    }
    check(`${label}: all ${pages.length} pages load under the security headers, ask no other server, fit the screen, and give every control a name and a size of 24 px`, bad.length === 0, bad.slice(0, 3));
  }

  // wide: the menu beside a centred page
  await size(1280, 900); await open('index.html');
  const wide = await value(`(() => { const m = document.getElementById('menu'), b = document.querySelector('.ord-shell__open'), p = document.querySelector('.ord-page').getBoundingClientRect(), s = document.querySelector('.ord-shell__side').getBoundingClientRect(); return { menu: getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().width > 100, button: getComputedStyle(b).display, gap: Math.round(p.left - s.right) }; })()`);
  check('wide: the menu stands beside the page, and the Menu button is not shown', wide.menu && wide.button === 'none' && wide.gap >= 0, wide);
  await key('Tab', 'Tab', 9); const t1 = await value('document.activeElement.className');
  await key('Tab', 'Tab', 9); const t2 = await value('document.activeElement.className');
  check('keyboard: the first stop is the skip link, the second is the name of the site', t1 === 'ord-skip' && t2 === 'ord-shell__brand', { t1, t2 });
  await size(1920, 900); await sleep(200);
  const centre = await value(`(() => { const p = document.querySelector('.ord-page').getBoundingClientRect(), s = document.querySelector('.ord-shell__side').getBoundingClientRect(); return { left: Math.round(p.left - s.right), right: Math.round(document.documentElement.clientWidth - p.right) }; })()`);
  check('very wide: the page is centred in the room beside the menu', Math.abs(centre.left - centre.right) <= 2, centre);

  // the help: it opens beside the page, stays open, and closes with its button
  await size(1600, 900); await open('help.html');
  const before = await value(`Math.round(document.querySelector('.ord-page').getBoundingClientRect().right)`);
  await value(`document.querySelector('.ord-shell__help').click()`); await sleep(300);
  const help = await value(`(() => { const hp = document.getElementById('help'); const r = hp.getBoundingClientRect(); return { open: hp.matches(':popover-open'), left: Math.round(r.left), pageRight: Math.round(document.querySelector('.ord-page').getBoundingClientRect().right), words: hp.textContent.trim().length }; })()`);
  check('help: the Help button opens the panel, and on a wide screen the page makes room for it', help.open && help.words > 40 && help.pageRight <= help.left && help.pageRight < before, { before, ...help });
  await value(`document.querySelector('.ord-page a, .ord-page button, .ord-page')?.scrollIntoView(); document.body.click()`); await sleep(200);
  check('help: the panel stays open while the reader uses the page', await value(`document.getElementById('help').matches(':popover-open')`));
  await value(`document.querySelector('.ord-help__close').click()`); await sleep(200);
  check('help: its Close button closes it', !(await value(`document.getElementById('help').matches(':popover-open')`)));

  // narrow: the menu opens from its button, and Escape closes it
  await size(390, 800); await open('excluded.html');
  const n0 = await value(`(() => { const m = document.getElementById('menu'), b = document.querySelector('.ord-shell__open'); return { closed: getComputedStyle(m).display === 'none', height: Math.round(b.getBoundingClientRect().height) }; })()`);
  check('narrow: the menu is closed, and the Menu button is at least 24 px high', n0.closed && n0.height >= 24, n0);
  await value(`document.querySelector('.ord-shell__open').click()`); await sleep(300);
  const n1 = await value(`(() => { const m = document.getElementById('menu'); return { open: m.matches(':popover-open'), current: [...m.querySelectorAll('[aria-current]')].map((a) => a.textContent.trim()).join() }; })()`);
  check('narrow: the button opens the menu, which marks the current page', n1.open && n1.current === 'Excluded', n1);
  await key('Escape', 'Escape', 27); await sleep(200);
  check('narrow: Escape closes the menu', !(await value(`document.getElementById('menu').matches(':popover-open')`)));
  await value(`document.querySelector('.ord-shell__open').click()`); await sleep(200);
  await value(`document.querySelector('#menu a[href="index.html"]').click()`); await sleep(600);
  check('narrow: an item in the menu opens its page', (await value('location.pathname')) === '/index.html');

  // data: the script checks the two examples
  if (pages.some((p) => p.file === 'data.html')) {
    await size(1280, 900); await open('data.html');
    const d = await value(`({ rows: document.querySelectorAll('#demo-out tbody tr').length, tone: document.getElementById('demo-refused').getAttribute('data-tone'), text: document.getElementById('demo-refused').textContent })`);
    check('data: the block that fits becomes a table, and the block that does not fit is refused in words', d.rows === 3 && d.tone === 'harm' && /^Error: the data was refused\. rows\[1\]\.pages must be a number/.test(d.text), d);
    const other = await value(`ordData.load('//other.example/data.json', { type: 'object', props: {} }).then(() => 'loaded', (e) => e.message)`);
    check('data: an address on another server is refused before any request', /is on another server/.test(other), { other });
    const same = await value(`ordData.load('sbom.cdx.json', { type: 'object', props: { bomFormat: { type: 'string' } } }).then((v) => v.bomFormat, (e) => 'refused: ' + e.message)`);
    check('data: a file on the site\'s own server is read and checked', same === 'CycloneDX', { same });
  }

  // forms: a label belongs to its control, an error shows without colour, and the keyboard changes a checkbox
  await size(1280, 900); await open('components.html');
  const form = await value(`(() => { const name = document.getElementById('f-name'), ref = document.getElementById('f-ref'); const a = getComputedStyle(name), b = getComputedStyle(ref);
    return { label: document.querySelector('label[for="f-name"]').control === name, hint: !!document.getElementById(name.getAttribute('aria-describedby')),
      error: document.getElementById(ref.getAttribute('aria-describedby')).textContent.startsWith('Error:'), thicker: parseFloat(b.borderTopWidth) > parseFloat(a.borderTopWidth), text: parseFloat(a.fontSize) >= 16 }; })()`);
  check('forms: a label belongs to its control, and an error has a thicker edge and a text that starts with Error', form.label && form.hint && form.error && form.thicker && form.text, form);
  await value(`document.querySelectorAll('.ord-check')[1].focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  const box = await value(`(() => { const c = document.querySelectorAll('.ord-check')[1]; return { checked: c.checked, mark: getComputedStyle(c, '::before').transform !== 'matrix(0, 0, 0, 0, 0, 0)' }; })()`);
  check('forms: the Space key ticks a checkbox, and a mark shows it', box.checked && box.mark, box);

  // the dialog: a button opens it without a script, the focus moves into it, and Escape closes it and gives the focus back
  await value(`(() => { const b = document.querySelector('[commandfor="demo-dialog"][command="show-modal"]'); b.focus(); b.click(); })()`); await sleep(300);
  const d1 = await value(`(() => { const d = document.getElementById('demo-dialog'); return { open: d.open, modal: d.matches(':modal'), focusInside: d.contains(document.activeElement), fits: d.getBoundingClientRect().right <= innerWidth }; })()`);
  await key('Escape', 'Escape', 27); await sleep(300);
  const d2 = await value(`({ open: document.getElementById('demo-dialog').open, back: document.activeElement.getAttribute('command') === 'show-modal' })`);
  check('dialog: a button opens it with no script, the focus moves into it, and Escape closes it and returns the focus', d1.open && d1.modal && d1.focusInside && d1.fits && !d2.open && d2.back, { ...d1, after: d2 });
  await size(320, 800); await open('components.html');
  await value(`document.querySelector('[commandfor="demo-dialog"][command="show-modal"]').click()`); await sleep(300);
  const d3 = await value(`(() => { const r = document.getElementById('demo-dialog').getBoundingClientRect(); return { open: document.getElementById('demo-dialog').open, left: Math.round(r.left), right: Math.round(r.right), width: innerWidth }; })()`);
  check('dialog: it fits a screen of 320 px', d3.open && d3.left >= 0 && d3.right <= d3.width, d3);

  // keyboard: Tab reaches every control of a page, each one shows its focus, and nothing covers it
  for (const [w, h, label, file] of [[1280, 900, 'wide', 'components.html'], [320, 800, 'narrow', 'index.html']]) {
    await size(w, h); await open(file);
    const expected = await value(`[...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex="0"]')].filter((e) => e.getClientRects().length && !e.closest('[popover]:not(:popover-open)')).length`);
    const seen = []; const wrong = [];
    for (let i = 0; i < expected + 5; i++) {
      await key('Tab', 'Tab', 9);
      const f = await value(FOCUS);
      if (!f || seen.includes(f.el + i) ) break;
      if (seen.length && f.el === seen[0].el && seen.length >= expected) break;
      seen.push(f);
      if (!f.outline || !f.inView || f.covered) wrong.push(f);
    }
    check(`keyboard, ${label}: Tab reaches all ${expected} controls of ${file}, and each shows a focus outline that nothing covers`, seen.length >= expected && wrong.length === 0, { expected, reached: seen.length, wrong: wrong.slice(0, 4) });
  }

  // WCAG 1.4.12 Text Spacing: with wider spacing of lines, letters and words, no text is cut off and no page overflows
  await size(320, 800);
  const spaced = [];
  for (const page of pages) {
    await open(page.file);
    const r = await value(`(() => { const sheet = new CSSStyleSheet(); sheet.replaceSync('* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'); document.adoptedStyleSheets = [sheet];
      const applied = getComputedStyle(document.querySelector('h1')).letterSpacing !== 'normal';
      const cut = [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.matches('.ord-skip:not(:focus)')).filter((e) => { const c = getComputedStyle(e); return (/hidden|clip/.test(c.overflowX) && e.scrollWidth > e.clientWidth + 1) || (/hidden|clip/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 1); }).map((e) => e.className || e.tagName);
      const wide = [...document.querySelectorAll('body *')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest('.ord-table-scroll, .ord-code')).map((e) => (e.className || e.tagName) + ' ' + (e.textContent || '').trim().slice(0, 24)).slice(0, 5);
      return { applied, cut, wide, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; })()`);
    if (!r.applied || r.cut.length || r.overflow) spaced.push({ page: page.file, ...r });
  }
  check(`text spacing: with wider spacing at 320 px, no text is cut off on any of the ${pages.length} pages`, spaced.length === 0, spaced.slice(0, 3));

  // forced colours (the high-contrast mode of the system): a control keeps an edge, and the focus keeps its outline
  await size(1280, 900);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await open('components.html');
  const forced = await value(`(() => { const on = matchMedia('(forced-colors: active)').matches; const edge = (e) => { const c = getComputedStyle(e); return c.borderTopStyle !== 'none' && parseFloat(c.borderTopWidth) >= 1; };
    const noEdge = [...document.querySelectorAll('.ord-button, .ord-switch, .ord-tag, .ord-notice, .ord-panel, .ord-input, .ord-select, .ord-check, .ord-radio')].filter((e) => !edge(e)).map((e) => e.className);
    const tab = document.querySelector('.ord-tabs__tab[aria-current="page"]'); const c = getComputedStyle(tab);
    return { on, noEdge, currentTab: parseFloat(c.borderBottomWidth) >= 2 || parseInt(c.fontWeight, 10) >= 600 }; })()`);
  await key('Tab', 'Tab', 9); await key('Tab', 'Tab', 9);
  const forcedFocus = await value(FOCUS);
  check('forced colours: every control keeps an edge, the current tab keeps its mark, and the focus keeps its outline', forced.on && forced.noEdge.length === 0 && forced.currentTab && forcedFocus?.outline, { ...forced, forcedFocus });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'none' }] });

  // themes: the dark theme is used when the system asks for it
  await open('index.html');
  const lightBg = await value(`getComputedStyle(document.body).backgroundColor`);
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await sleep(200);
  const darkBg = await value(`getComputedStyle(document.body).backgroundColor`);
  check('themes: the page follows the system between light and dark', lightBg !== darkBg, { lightBg, darkBg });

  ws.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '\n      ' + JSON.stringify(r.extra).slice(0, 600)}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${failed ? 'FAILED' : 'OK'} ${results.length - failed} of ${results.length} browser tests`);
  code = failed ? 1 : 0;
} catch (e) {
  console.error(String((e && e.stack) || e));
  code = 2;
} finally {
  proc.kill();
  server.close();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the profile is in the system's temporary folder */ }
}
process.exit(code);
