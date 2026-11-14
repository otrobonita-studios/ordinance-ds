#!/usr/bin/env node
// The checks: `node scripts/check.mjs`. No dependencies. Each failure names the rule, the file and the reason.
// The rules are listed in scripts/rules.mjs, and a plugin lists its own in its plugin.json. NAMING.md has the naming rules.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, read, readJson, exists, walk, cssName, lightTokens, darkTokens, measuredPairs, loadPlugins } from './lib.mjs';
import { buildAll, sameBytes, thirdParty, coreTableNames } from './build.mjs';
import { RULES } from './rules.mjs';
import { accessProblems } from './a11y.mjs';

const problems = [];
const used = new Set();
const fail = (rule, file, why) => { problems.push(`[${rule}] ${file}: ${why}`); };
const rule = (id) => { used.add(id); return (file, why) => fail(id, file, why); };
const text = (v) => (Buffer.isBuffer(v) ? v.toString('utf8') : v);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const NAME = /^ord-[a-z0-9]+(-[a-z0-9]+)*$/;
const PART = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PERMISSIONS = ['page', 'style', 'script', 'network:same-origin', 'check', 'asset', 'third-party'];

/* the register of a build: the core's names and the names of the plugins in that build */
function register(plugins, report) {
  const names = readJson('names.json');
  const classes = new Set(); const data = { ...names.data };
  const add = (file, blocks = {}) => {
    for (const [block, def] of Object.entries(blocks)) {
      if (!NAME.test(block)) report?.(file, `${block}: a block is ord- and lower-case words with single hyphens`);
      if (classes.has(block)) report?.(file, `${block} is registered twice`);
      classes.add(block);
      for (const e of def.elements || []) { if (!PART.test(e)) report?.(file, `${block}__${e}: bad element name`); classes.add(`${block}__${e}`); }
      for (const m of def.modifiers || []) { if (!PART.test(m)) report?.(file, `${block}--${m}: bad modifier name`); classes.add(`${block}--${m}`); }
    }
  };
  add('names.json', names.blocks);
  for (const p of plugins) { add(`${p.dir}/plugin.json`, p.names?.blocks); Object.assign(data, p.names?.data || {}); }
  return { classes, data };
}
const colourTokens = () => new Set(lightTokens().filter((t) => t.type === 'color').map((t) => t.path.replace(/\./g, '-')));

// ---------------------------------------------------------------- tokens
function checkTokens() {
  const bad = rule('tokens');
  const light = lightTokens(), dark = darkTokens();
  const TYPES = new Set(['color', 'dimension', 'duration', 'fontFamily', 'fontWeight', 'number']);
  const hexOf = (c) => `#${c.components.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  for (const [file, list] of [['tokens/tokens.json', light], ['tokens/tokens.dark.json', dark]]) for (const t of list) {
    if (!TYPES.has(t.type)) bad(file, `${t.path} has no known $type (${t.type})`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/.test(t.path)) bad(file, `${t.path}: a token path uses lower-case letters, digits and single hyphens`);
    if (t.type === 'color') {
      if (t.value?.colorSpace !== 'srgb' || !Array.isArray(t.value.components) || !/^#[0-9a-f]{6}$/.test(t.value.hex || '')) bad(file, `${t.path}: a colour needs colorSpace srgb, components and a hex value`);
      else if (hexOf(t.value) !== t.value.hex) bad(file, `${t.path}: the components give ${hexOf(t.value)}, but hex says ${t.value.hex}`);
    }
    if (t.type === 'dimension' && !(t.value?.unit === 'rem' || (t.value?.unit === 'px' && t.value.value === 1))) bad(file, `${t.path}: a size is in rem; only a 1 px hairline may use px`);
  }
  const lightPaths = new Set(light.map((t) => t.path));
  for (const t of dark) {
    if (!lightPaths.has(t.path)) bad('tokens/tokens.dark.json', `${t.path} is not in tokens.json`);
    else if (t.type !== 'color') bad('tokens/tokens.dark.json', `${t.path}: only colours differ in the dark theme`);
  }
  for (const t of light) if (t.type === 'color' && !dark.some((d) => d.path === t.path)) bad('tokens/tokens.dark.json', `misses the colour ${t.path}`);
  // typefaces as files: each one is a listed third-party file
  const faces = exists('tokens', 'fonts.json') ? readJson('tokens', 'fonts.json').faces : [];
  for (const f of faces) if (!/^third-party\/[\w./-]+\.woff2$/.test(f.file) || !exists(f.file)) bad('tokens/fonts.json', `${f.file}: a typeface is a .woff2 file in third-party/`);
}

// ---------------------------------------------------------------- contrast
let lowest = Infinity;
function checkContrast() {
  const bad = rule('contrast');
  const pairs = measuredPairs();
  for (const p of pairs) for (const theme of ['light', 'dark']) {
    if (p[theme] === null) { bad('tokens/contrast.json', `${p.text} on ${p.on}: unknown colour`); continue; }
    lowest = Math.min(lowest, p[theme]);
    if (p[theme] < p.min) bad('tokens/contrast.json', `${theme}: ${p.text} on ${p.on} is ${p[theme].toFixed(2)}:1, and must be at least ${p.min}:1`);
  }
  for (const t of lightTokens()) if (t.type === 'color' && t.path !== 'color.line' && !pairs.some((p) => p.text === t.path || p.on === t.path)) bad('tokens/contrast.json', `${t.path} is in no pair, so nothing measures it`);
}

// ---------------------------------------------------------------- the stylesheet's source
function checkCss(plugins) {
  const badName = rule('names'), badToken = rule('tokens'), badOrigin = rule('same-origin');
  const reg = register(plugins, badName);
  const tokenVars = new Set(lightTokens().map((t) => cssName(t.path)));
  const usedClasses = new Set(); const usedData = new Map();
  const files = [...walk('src/css'), ...plugins.flatMap((p) => (p.styles || []).map((f) => `${p.dir}/${f}`))];
  for (const f of files) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    if (/@import\b/i.test(css)) badOrigin(f, 'must not use @import');
    if (/url\(/i.test(css)) badOrigin(f, 'must not use url(): the stylesheet loads nothing');
    if (/!important/.test(css)) badToken(f, 'must not use !important: the layers set the order');
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/g)) badToken(f, `a colour value (${m[0]}): use a token`);
    for (const m of css.matchAll(/(?<![\w.-])(\d*\.?\d+)px\b/g)) if (m[1] !== '1') badToken(f, `${m[0]}: sizes are in rem; only a 1px hairline may use px`);
    for (const m of css.matchAll(/var\((--[\w-]+)/g)) if (!tokenVars.has(m[1])) badToken(f, `${m[1]} is not a token`);
    for (const m of css.matchAll(/(?<=[{;\s])(--[\w-]+)\s*:/g)) badToken(f, `${m[1]}: a custom property is declared in the token files only`);
    for (const m of css.matchAll(/(?<=^|[{};])([^{};]+)\{/g)) {
      const sel = m[1];
      if (/^\s*@/.test(sel)) continue;
      for (const c of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) { if (!reg.classes.has(c[1])) badName(f, `the class .${c[1]} is not registered`); usedClasses.add(c[1]); }
      for (const a of sel.matchAll(/\[(data-[\w-]+)(?:="([^"]*)")?\]/g)) {
        if (!(a[1] in reg.data)) badName(f, `the attribute ${a[1]} is not registered`);
        else if (a[2] !== undefined && !reg.data[a[1]].includes(a[2])) badName(f, `${a[1]}="${a[2]}" is not a registered value`);
        if (!usedData.has(a[1])) usedData.set(a[1], new Set());
        if (a[2] !== undefined) usedData.get(a[1]).add(a[2]);
      }
      if (/#[A-Za-z]/.test(sel)) badName(f, `an id in a selector (${sel.trim()}): use a class`);
    }
  }
  for (const c of reg.classes) if (!usedClasses.has(c)) badName('the registers', `${c} is registered, but the stylesheet has no rule for it`);
  for (const [attr, values] of Object.entries(reg.data)) for (const v of values) if (attr !== 'data-theme' && !usedData.get(attr)?.has(v)) badName('the registers', `${attr}="${v}" is registered, but no rule uses it`);
}

// ---------------------------------------------------------------- the built pages of one build
const FORBIDDEN_JS = [
  [/\.(inner|outer)HTML\b/, 'innerHTML or outerHTML'], [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'], [/\bdocument\.write/, 'document.write'],
  [/\beval\s*\(/, 'eval'], [/\bnew\s+Function\b/, 'new Function'], [/\bimport\s*\(/, 'a dynamic import'], [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'], [/\bsendBeacon\b/, 'sendBeacon'], [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/, 'browser storage'], [/https?:\/\//, 'an address on another server'],
];
function pageProblems(build) {
  const out = [];
  const say = (id) => (file, why) => out.push({ rule: id, file, why });
  const inline = say('no-inline'), origin = say('same-origin'), script = say('scripts'), menu = say('menu'), structure = say('structure'), name = say('names'), access = say('accessible');
  const reg = register(build.plugins);
  const colours = colourTokens();
  const pluginOf = new Map(build.plugins.map((p) => [p.id, p]));
  for (const page of build.pages) {
    const file = `dist/${page.file}`; const html = text(build.files[page.file]); const plugin = pluginOf.get(page.plugin);
    // no inline code
    if (/<style\b/i.test(html)) inline(file, 'a <style> element: all CSS is in the stylesheet');
    if (/\sstyle\s*=/i.test(html)) inline(file, 'a style attribute: use a class');
    if (/\son[a-z]+\s*=/i.test(html)) inline(file, 'an event attribute (on...=): use a script file');
    // scripts: only declared files of a plugin that may ship a script
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/type="application\/json"/.test(m[1])) continue;
      const src = (/\ssrc="([^"]+)"/.exec(m[1]) || [])[1];
      if (!src || m[2].trim()) { inline(file, 'a script that is written into the page: a script is a file'); continue; }
      const srcName = src.startsWith('../') ? src.slice(3) : src;
      if (!(page.scripts || []).includes(srcName)) script(file, `the script ${src} is not declared for this page in plugin.json`);
      if (!(plugin.permissions || []).includes('script')) script(file, `the plugin ${plugin.id} has no permission "script"`);
      if (!(srcName in build.files)) script(file, `the script ${src} is not built`);
      if (!/\sdefer\b/.test(m[1])) script(file, `the script ${src} must be deferred, so that the page shows first`);
    }
    // nothing from another server
    for (const m of html.matchAll(/<(?:script|link|img|iframe|source|video|audio|object|embed)\b[^>]*?\s(?:src|href|data)="([^"]+)"/gi)) if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(m[1]) || /^data:/i.test(m[1])) origin(file, `${m[1].slice(0, 60)}: a file from another server, or a data address`);
    // names
    for (const m of html.matchAll(/\sclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/).filter(Boolean)) if (!reg.classes.has(c)) name(file, `the class ${c} is not registered`);
    for (const m of html.matchAll(/\s(data-[\w-]+)(?:="([^"]*)")?/g)) {
      if (m[1] === 'data-token') { if (!colours.has(m[2])) name(file, `data-token="${m[2]}" names no colour token`); continue; }
      if (!(m[1] in reg.data)) name(file, `the attribute ${m[1]} is not registered`);
      else if (m[2] !== undefined && !reg.data[m[1]].includes(m[2])) name(file, `${m[1]}="${m[2]}" is not a registered value`);
    }
    // structure
    if (!/<html lang="[a-z-]+">/.test(html)) structure(file, 'the page does not say its language');
    if (!/<title>[^<]+<\/title>/.test(html)) structure(file, 'the page has no title');
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => +m[1]);
    if (levels.filter((l) => l === 1).length !== 1 || levels[0] !== 1) structure(file, 'a page has exactly one h1, and it comes first');
    levels.forEach((l, i) => { if (i && l > levels[i - 1] + 1) structure(file, `a heading jumps from h${levels[i - 1]} to h${l}`); });
    if (!/^<a class="ord-skip" href="#content">/.test(html.slice(html.indexOf('<body>') + 7)) || !/<main\b[^>]*\sid="content"/.test(html)) structure(file, 'the first link of a page must skip to the content');
    for (const _m of html.matchAll(/<img\b(?![^>]*\salt=)[^>]*>/gi)) structure(file, 'an image without alt text');
    for (const m of html.matchAll(/<table\b[\s\S]*?<\/table>/g)) { if (!/<caption>/.test(m[0])) structure(file, 'a table without a caption'); if (!/<th scope="col"/.test(m[0])) structure(file, 'a table without column heads'); }
    for (const _m of html.matchAll(/<button\b(?![^>]*\stype=)[^>]*>/g)) structure(file, 'a button without a type');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) structure(file, `the id ${id} is used twice`);
    for (const m of html.matchAll(/\spopovertarget="([^"]+)"/g)) if (!new RegExp(`\\sid="${m[1]}" popover`).test(html)) structure(file, `popovertarget ${m[1]} names no popover`);
    if (!/<aside class="ord-help" id="help"/.test(html)) structure(file, `the page has no help: add it to ${page.dir}/help.json`);
    for (const m of html.matchAll(/<!-- ord:[^>]*-->/g)) structure(file, `${m[0]} was not filled in by the build`);
    // accessibility: names, labels, references, the keyboard and zoom (scripts/a11y.mjs)
    for (const why of accessProblems(html)) access(file, why);
    // the menu
    const nav =(/<nav\b[^>]*>[\s\S]*?<\/nav>/.exec(html) || [''])[0];
    if (!/<nav\b[^>]*\saria-label="[^"]+"/.test(nav)) menu(file, 'the menu has no name (aria-label)');
    const current = [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
    if (current.length !== 1 || current[0] !== (page.name || page.file)) menu(file, `the menu must mark this page, and only this page, as current (it marks: ${current.join(', ') || 'none'})`);
    if (/<a\b[^>]*data-status="planned"/.test(nav)) menu(file, 'a planned item must not be a link');
    for (const m of html.matchAll(/\shref="([^"]+)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
      const [rel, anchor] = m[1].split('#');
      const target = rel ? new URL(rel, `http://site/${page.file}`).pathname.slice(1) : page.file;
      if (!(target in build.files)) menu(file, `the link ${m[1]} leads to no built file`);
      if (anchor && !text(build.files[target] || '').includes(`id="${anchor}"`)) menu(file, `the link ${m[1]} leads to no id`);
    }
  }
  // scripts: what the code of a plugin may do
  for (const p of build.plugins) for (const a of (p.assets || []).filter((x) => /\.m?js$/.test(x))) {
    const code = read(p.dir, a).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const [re, what] of FORBIDDEN_JS) if (re.test(code)) script(`${p.dir}/${a}`, `must not use ${what}`);
    if (/\bfetch\s*\(/.test(code) && !(p.permissions || []).includes('network:same-origin')) script(`${p.dir}/${a}`, 'uses fetch, but the plugin has no permission "network:same-origin"');
  }
  return out;
}

// ---------------------------------------------------------------- plugins
function checkPlugins(plugins) {
  const bad = rule('plugins');
  const site = readJson('site.json');
  const groups = new Set(site.groups.map((g) => g.id));
  const files = new Map();
  for (const p of plugins) {
    const f = `${p.dir}/plugin.json`;
    if (p.dir !== `plugins/${p.id}`) bad(f, `the id (${p.id}) must be the folder's name`);
    for (const k of ['id', 'title', 'purpose', 'permissions']) if (!p[k] || (Array.isArray(p[k]) && !p[k].length)) bad(f, `misses "${k}"`);
    for (const perm of p.permissions || []) if (!PERMISSIONS.includes(perm)) bad(f, `"${perm}" is not a permission (${PERMISSIONS.join(', ')})`);
    // a plugin asks for exactly what it uses
    const scripts = (p.assets || []).filter((a) => /\.m?js$/.test(a));
    const needs = new Set();
    if (p.pages?.length) needs.add('page');
    if (p.styles?.length) needs.add('style');
    if (scripts.length) needs.add('script');
    if ((p.assets || []).length > scripts.length) needs.add('asset');
    if (p.check) needs.add('check');
    if (p.thirdParty?.length) needs.add('third-party');
    if (scripts.some((a) => /\bfetch\s*\(/.test(read(p.dir, a)))) needs.add('network:same-origin');
    for (const n of needs) if (!(p.permissions || []).includes(n)) bad(f, `uses "${n}" without the permission`);
    for (const perm of p.permissions || []) if (!needs.has(perm)) bad(f, `has the permission "${perm}" and does not use it`);
    for (const page of p.pages || []) {
      if (!/^[a-z0-9-]+\.html$/.test(page.file || '')) bad(f, `${page.file}: a page file is a lower-case name that ends in .html`);
      if (files.has(page.file)) bad(f, `${page.file} is also a page of ${files.get(page.file)}`);
      files.set(page.file, p.id);
      if (!groups.has(page.group)) bad(f, `${page.file}: the group ${page.group} is not in site.json`);
      if (!Number.isFinite(page.order)) bad(f, `${page.file}: needs an order in its group`);
      if (!exists(p.dir, page.source)) { bad(f, `${page.source} does not exist`); continue; }
      const src = read(p.dir, page.source);
      // a page links only to pages of its own plugin, so that every plugin can be taken away
      const own = new Set((p.pages || []).map((x) => x.file));
      for (const m of src.matchAll(/\shref="([^"#:]+\.html)(?:#[^"]*)?"/g)) if (!own.has(m[1])) bad(`${p.dir}/${page.source}`, `a link to ${m[1]}, a page of another plugin`);
      for (const m of src.matchAll(/<!-- ord:core ([\w-]+) -->/g)) if (!coreTableNames.includes(m[1])) bad(`${p.dir}/${page.source}`, `no table is called ${m[1]}`);
      for (const m of src.matchAll(/<!-- ord:table ([\w./-]+) -->/g)) if (!exists(p.dir, m[1])) bad(`${p.dir}/${page.source}`, `the table file ${m[1]} does not exist`);
    }
    for (const a of [...(p.styles || []), ...(p.assets || []), ...(p.check ? [p.check] : [])]) if (!exists(p.dir, a)) bad(f, `${a} does not exist`);
    // every file in the folder belongs to the plugin: nothing is left behind
    const translatable = new Set(['help.json', 'titles.json', ...(p.pages || []).map((x) => x.source)]);
    const known = new Set(['plugin.json', 'help.json', ...(p.pages || []).map((x) => x.source), ...(p.styles || []), ...(p.assets || []), ...(p.check ? [p.check] : []), ...(p.data || [])]);
    for (const file of walk(p.dir)) {
      const rel = file.slice(p.dir.length + 1);
      const tr = /^lang\/[a-z-]+\/(.+)$/.exec(rel); // a translation mirrors a file of the plugin
      if (tr ? !translatable.has(tr[1]) : !known.has(rel)) bad(file, tr ? 'translates no file of this plugin' : 'is not named in plugin.json');
    }
    for (const r of p.rules || []) { if (!r.id || !r.rule || !r.does) bad(f, 'a rule needs an id, a rule and what the check does'); if (!p.check) bad(f, `the rule ${r.id} has no check file`); }
    const helps = exists(p.dir, 'help.json') ? readJson(p.dir, 'help.json') : {};
    for (const [file, h] of Object.entries(helps)) { if (!own(p, file)) bad(`${p.dir}/help.json`, `${file} is not a page of this plugin`); if (!h.lead || !h.topics?.length) bad(`${p.dir}/help.json`, `${file}: help needs a lead and at least one topic`); }
  }
  if (!files.has(site.home)) bad('site.json', `the home page ${site.home} is not a page of any plugin`);
  // the proof: the site builds and passes without each plugin, and with no plugin at all
  for (const p of plugins) {
    try {
      const reduced = buildAll({ without: [p.id] });
      for (const x of pageProblems(reduced)) bad(x.file, `without the plugin ${p.id}: [${x.rule}] ${x.why}`);
    } catch (e) { bad(`${p.dir}/plugin.json`, `the site does not build without this plugin: ${e.message}`); }
  }
  try { buildAll({ without: plugins.map((p) => p.id) }); } catch (e) { bad('plugins/', `the site does not build with no plugin: ${e.message}`); }
}
const own = (p, file) => (p.pages || []).some((x) => x.file === file);

// ---------------------------------------------------------------- third-party files and the bill of materials
function checkThirdParty(plugins, built) {
  const bad = rule('third-party'), badSbom = rule('sbom');
  const components = thirdParty(plugins);
  const listed = new Map();
  for (const c of components) {
    for (const k of ['name', 'version', 'licence', 'source']) if (!c[k]) bad('third-party', `${c.name || 'a component'} misses "${k}"`);
    for (const f of c.files || []) {
      listed.set(f.path, f.sha256);
      if (!existsSync(join(root, f.path))) { bad(f.path, 'is listed, but missing'); continue; }
      const got = sha256(readFileSync(join(root, f.path)));
      if (got !== f.sha256) bad(f.path, `changed (SHA-256 ${got.slice(0, 12)}..., the list says ${String(f.sha256).slice(0, 12)}...)`);
    }
  }
  for (const f of walk('third-party')) if (!listed.has(f)) bad(f, 'is not listed with a checksum');
  let bom;
  try { bom = JSON.parse(text(built.files['sbom.cdx.json'])); } catch { badSbom('dist/sbom.cdx.json', 'is not valid JSON'); return; }
  if (bom.bomFormat !== 'CycloneDX' || !bom.specVersion) badSbom('dist/sbom.cdx.json', 'is not in the CycloneDX format');
  // The framework has no version number of its own: a version exists only as a tag that the owner has made.
  for (const f of ['site.json', 'package.json']) if ('version' in readJson(f)) badSbom(f, 'names a version: the framework has a version only as a tag in the repository');
  if (bom.metadata?.component?.version) badSbom('dist/sbom.cdx.json', 'names a version of the framework');
  const inBom = new Map((bom.components || []).map((c) => [`${c.name}@${c.version}`, c]));
  for (const c of components) {
    const b = inBom.get(`${c.name}@${c.version}`);
    if (!b) { badSbom('dist/sbom.cdx.json', `misses ${c.name} ${c.version}`); continue; }
    for (const f of c.files) if (!(b.components || []).some((x) => x.name === f.path && x.hashes?.[0]?.content === f.sha256)) badSbom('dist/sbom.cdx.json', `misses the file ${f.path} of ${c.name}`);
  }
  if (inBom.size !== components.length) badSbom('dist/sbom.cdx.json', 'lists a component that is not in the list of third-party files');
}

// ---------------------------------------------------------------- the build
function checkBuild(built) {
  const bad = rule('build');
  for (const [name, body] of Object.entries(built.files)) {
    const path = join(root, 'dist', name);
    if (!existsSync(path)) bad(`dist/${name}`, 'is not built: run node scripts/build.mjs');
    else if (!sameBytes(readFileSync(path), body)) bad(`dist/${name}`, 'differs from the sources: run node scripts/build.mjs');
  }
  const again = buildAll();
  for (const k of Object.keys(built.files)) if (!(k in again.files) || !sameBytes(again.files[k], built.files[k])) bad('scripts/build.mjs', `${k} is not the same on a second build`);
  for (const f of walk('dist')) if (!(f.slice(5) in built.files)) bad(f, 'is not written by the build: remove it');
}

// ---------------------------------------------------------------- words
function checkWords() {
  const bad = rule('words');
  // The names of other products are held as SHA-256 hashes, so that this file does not contain them either.
  const PRIVATE = new Set([
    'a59e4eb9a556c1484aea22e7d8f86c3c6c3e50a91aaaa1964b5e7f99cdcfca47', 'aa455d92ca26b6a78e138ae2db14631a00b8b81b0b0a714941591ab2b74c0df5',
    '1a6638ca7eb18fbd971104b30df6092c2d282a99ea3df9be2db7caed00b20658', '170f405eb046b133b696d6d943b309e9b69db93f75760f5b8f1c39c1a7eb0a86',
    '513e0195704a1405e2a41526f9df1b8ea588c0a974dd7e3a43e2e2ca0bdea817', 'fb3a5da14fac72dfaffedcf45dae1606152178be3c2dfd08809b7ad18c0511cb',
    '9410511938ed4890af9db191798448362edded2939b864d0f2c1b84816c8a778', 'e7bbb56d624e2fae2909adc7d6253d5d9747670b604ad21b730d5f53ce01231a',
    '6af4108390473c4a391508d9553728aaaa8aef64d55434090eb0dbf12c632467', '6e533337bd970a97d7ac74f6f8f891e70a702b45ac5d03469006d2835844e4d6',
  ]);
  const CLAIMS = /\b(compliant|compliance-ready|guarantee[sd]?|certified|100%)\b/i;
  const LOCAL = /\b[A-Za-z]:[\\/](?:Users|development|Documents|Downloads)\b|\/(?:Users|home)\/[\w.-]+\//;
  const TEXT = /\.(html|md|json|mjs|js|css|txt|svg|yml|yaml)$/;
  const seen = new Map();
  for (const f of walk('').filter((x) => TEXT.test(x) && !x.startsWith('third-party/'))) {
    const body = read(f);
    if (LOCAL.test(body)) bad(f, 'a path on a local computer');
    // a page may name the words it refuses only inside <code>, and the rule list and the checks name them to refuse them
    if (f.endsWith('.html') || f.endsWith('.md') || (f.endsWith('.json') && f.startsWith('plugins/'))) {
      const prose = body.replace(/<code>[\s\S]*?<\/code>/g, ' ').replace(/`[^`]*`/g, ' ');
      const m = CLAIMS.exec(prose); if (m) bad(f, `"${m[0]}": say what the framework does, never that it makes anyone conform`);
    }
    for (const w of new Set(body.toLowerCase().match(/[a-z0-9]+/g) || [])) {
      if (!seen.has(w)) seen.set(w, PRIVATE.has(sha256(w)));
      if (seen.get(w)) bad(f, `a name from another product (${w[0]}${'*'.repeat(w.length - 1)})`);
    }
  }
}

// ---------------------------------------------------------------- run
const plugins = loadPlugins();
let built = null;
checkTokens();
checkContrast();
checkCss(plugins);
try { built = buildAll(); } catch (e) { fail('build', 'scripts/build.mjs', e.message); }
if (built) {
  for (const id of ['no-inline', 'same-origin', 'scripts', 'menu', 'structure', 'accessible']) used.add(id);
  for (const x of pageProblems(built)) fail(x.rule, x.file, x.why);
  checkPlugins(plugins);
  checkThirdParty(plugins, built);
  checkBuild(built);
  // the checks that plugins bring
  for (const p of plugins.filter((x) => x.check)) {
    try {
      const mod = await import(pathToFileURL(join(root, p.dir, p.check)).href);
      const ids = new Set((p.rules || []).map((r) => r.id));
      for (const x of await mod.check({ root, built, plugins, plugin: p, read, readJson, exists, walk })) {
        if (!ids.has(x.rule)) fail('plugins', `${p.dir}/${p.check}`, `reports the rule ${x.rule}, which plugin.json does not list`);
        fail(x.rule, x.file, x.why);
      }
    } catch (e) { fail('plugins', `${p.dir}/${p.check}`, `the check could not run: ${e.message}`); }
  }
}
checkWords();
for (const r of RULES) if (!used.has(r.id)) fail('build', 'scripts/rules.mjs', `the rule ${r.id} is listed, but no check enforces it`);
for (const id of used) if (!RULES.some((r) => r.id === id)) fail('build', 'scripts/check.mjs', `the check ${id} is not in scripts/rules.mjs`);

if (problems.length) {
  for (const p of problems.slice(0, 100)) console.error(`FAIL ${p}`);
  console.error(`\n${problems.length} problems`);
  process.exit(1);
}
const ruleCount = RULES.length + plugins.reduce((n, p) => n + (p.rules || []).length, 0);
console.log(`OK ${ruleCount} rules, ${plugins.length} plugins, ${built.pages.length} pages, ${lightTokens().length} tokens, lowest contrast ${lowest.toFixed(2)}:1, ${Object.keys(built.files).length} built files`);
