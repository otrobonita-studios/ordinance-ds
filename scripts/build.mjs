#!/usr/bin/env node
// The build: `node scripts/build.mjs`. No dependencies. The same input gives the same bytes.
//   tokens/ + src/css/ + each plugin's styles          ->  dist/ordinance.css
//   each plugin's page fragments, inside the shell     ->  dist/*.html
//   each plugin's assets, and the third-party files    ->  dist/
//   the list of third-party files                      ->  dist/sbom.cdx.json
// A plugin is a folder in plugins/ with a plugin.json. A page fragment is the body of a page, and it may ask for
// a table that the build writes from data:
//   <!-- ord:core checks -->        a table from the framework's own data (see CORE_TABLES below)
//   <!-- ord:table decisions.json --> a table from a JSON file in the plugin's folder
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, read, readJson, exists, esc, walk, cssName, cssValue, lightTokens, darkTokens, measuredPairs, loadPlugins, renderTable } from './lib.mjs';
import { RULES } from './rules.mjs';
import { HEADERS, META_CSP } from './headers.mjs';

const LAYERS = '@layer ord.reset, ord.tokens, ord.base, ord.components, ord.utilities;';
const CSS_SOURCES = ['base.css', 'components.css', 'shell.css', 'utilities.css'];

/* ---------------------------------------------------------------- the stylesheet */
export function fontFaces() {
  const faces = exists('tokens', 'fonts.json') ? readJson('tokens', 'fonts.json').faces : [];
  return faces.map((f) => `@font-face { font-family: "${f.family}"; src: url("fonts/${f.file.split('/').pop()}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style || 'normal'}; font-display: swap;${f.unicodeRange ? ` unicode-range: ${f.unicodeRange};` : ''} }`);
}
export function tokensCss() {
  const light = lightTokens();
  const dark = new Map(darkTokens().map((t) => [t.path, t]));
  const lines = light.map((t) => {
    const d = dark.get(t.path);
    return `    ${cssName(t.path)}: ${d ? `light-dark(${cssValue(t)}, ${cssValue(d)})` : cssValue(t)};`;
  });
  const still = light.filter((t) => t.type === 'duration').map((t) => `${cssName(t.path)}: 0ms;`).join(' ');
  const swatches = light.filter((t) => t.type === 'color').map((t) => `  .ord-swatch[data-token="${t.path.replace(/\./g, '-')}"] { background: var(${cssName(t.path)}); }`);
  return [
    '/* Tokens: written by scripts/build.mjs from the files in tokens/. Do not edit. */',
    ...fontFaces(),
    '@layer ord.tokens {',
    '  :root {',
    '    color-scheme: light dark;',
    ...lines,
    '  }',
    '  /* The system decides the theme. A page may pin one with data-theme on <html>. */',
    '  :root[data-theme="light"] { color-scheme: light; }',
    '  :root[data-theme="dark"] { color-scheme: dark; }',
    `  @media (prefers-reduced-motion: reduce) { :root { ${still} } }`,
    '}',
    '/* One rule for each colour token, so that a page can show the colour without a style attribute. */',
    '@layer ord.components {',
    ...swatches,
    '}',
  ].join('\n');
}
export function buildCss(plugins) {
  const pluginCss = plugins.flatMap((p) => (p.styles || []).map((f) => `/* plugin: ${p.id} */\n${read(p.dir, f).trim()}`));
  return [LAYERS, tokensCss(), ...CSS_SOURCES.map((f) => read('src', 'css', f).trim()), ...pluginCss].join('\n\n') + '\n';
}

/* ---------------------------------------------------------------- third-party files and the bill of materials */
export function thirdParty(plugins) {
  const own = exists('third-party.json') ? readJson('third-party.json').components : [];
  return [...own.map((c) => ({ ...c, from: 'core' })), ...plugins.flatMap((p) => (p.thirdParty || []).map((c) => ({ ...c, from: p.id })))];
}
export function sbom(plugins) {
  const components = thirdParty(plugins).map((c) => ({
    type: 'library', 'bom-ref': `${c.name}@${c.version}`, name: c.name, version: c.version,
    licenses: [{ license: { id: c.licence } }],
    ...(c.integrity?.startsWith('sha512-') ? { hashes: [{ alg: 'SHA-512', content: Buffer.from(c.integrity.slice(7), 'base64').toString('hex') }] } : {}),
    externalReferences: [{ type: 'distribution', url: c.source }],
    components: c.files.map((f) => ({ type: 'file', name: f.path, hashes: [{ alg: 'SHA-256', content: f.sha256 }] })),
  }));
  return JSON.stringify({
    bomFormat: 'CycloneDX', specVersion: '1.6', version: 1,
    metadata: { component: { type: 'framework', 'bom-ref': 'ordinance-ds', name: 'ordinance-ds' } },
    components,
  }, null, 2) + '\n';
}

/* ---------------------------------------------------------------- tables from the framework's own data */
const checked = { text: 'Checked', tone: 'accent' };
export function allRules(plugins) {
  return [...RULES.map((r) => ({ ...r, from: 'core' })), ...plugins.flatMap((p) => (p.rules || []).map((r) => ({ ...r, from: p.id })))];
}
const CORE_TABLES = {
  checks: ({ plugins }) => ({
    caption: 'Rules that node scripts/check.mjs enforces',
    columns: [{ key: 'rule', label: 'Rule' }, { key: 'does', label: 'What the check does' }, { key: 'id', label: 'Name in the check', kind: 'code' }, { key: 'status', label: 'Status', kind: 'tag' }],
    rows: allRules(plugins).map((r) => ({ ...r, status: checked })),
  }),
  contrast: () => ({
    caption: 'Colour pairs, as the check measures them',
    columns: [{ key: 'text', label: 'Colour', kind: 'code' }, { key: 'on', label: 'On', kind: 'code' }, { key: 'min', label: 'Must reach', kind: 'num' }, { key: 'light', label: 'Light theme', kind: 'num' }, { key: 'dark', label: 'Dark theme', kind: 'num' }],
    rows: measuredPairs().map((p) => ({ text: p.text, on: p.on, min: `${p.min}:1`, light: `${p.light.toFixed(2)}:1`, dark: `${p.dark.toFixed(2)}:1` })),
  }),
  'tokens-color': () => {
    const dark = new Map(darkTokens().map((t) => [t.path, t]));
    return {
      caption: 'Colour tokens',
      columns: [{ key: 'name', label: 'Token', kind: 'code' }, { key: 'swatch', label: 'Colour', kind: 'swatch' }, { key: 'light', label: 'Light', kind: 'code' }, { key: 'dark', label: 'Dark', kind: 'code' }, { key: 'use', label: 'Use' }],
      rows: lightTokens().filter((t) => t.type === 'color').map((t) => ({ name: cssName(t.path), swatch: t.path, light: t.value.hex, dark: dark.get(t.path)?.value.hex, use: t.description })),
    };
  },
  'tokens-other': () => ({
    caption: 'Tokens for type, space, size and time',
    columns: [{ key: 'name', label: 'Token', kind: 'code' }, { key: 'value', label: 'Value', kind: 'code' }, { key: 'use', label: 'Use' }],
    rows: lightTokens().filter((t) => t.type !== 'color').map((t) => ({ name: cssName(t.path), value: cssValue(t), use: t.description })),
  }),
  names: ({ plugins }) => {
    const blocks = { ...readJson('names.json').blocks };
    const from = Object.fromEntries(Object.keys(blocks).map((b) => [b, 'core']));
    for (const p of plugins) for (const [b, def] of Object.entries(p.names?.blocks || {})) { blocks[b] = def; from[b] = p.id; }
    return {
      caption: 'Registered blocks',
      columns: [{ key: 'block', label: 'Block', kind: 'code' }, { key: 'elements', label: 'Elements', kind: 'codes' }, { key: 'modifiers', label: 'Modifiers', kind: 'codes' }, { key: 'from', label: 'From' }],
      rows: Object.entries(blocks).map(([b, def]) => ({ block: `.${b}`, elements: def.elements.map((e) => `__${e}`), modifiers: def.modifiers.map((m) => `--${m}`), from: from[b] })),
    };
  },
  plugins: ({ plugins }) => ({
    caption: 'Plugins in this build',
    columns: [{ key: 'id', label: 'Plugin', kind: 'code' }, { key: 'purpose', label: 'What it is for' }, { key: 'pages', label: 'Pages' }, { key: 'permissions', label: 'Permissions', kind: 'codes' }],
    rows: plugins.map((p) => ({ id: p.id, purpose: p.purpose, pages: (p.pages || []).map((x) => x.title).join(', '), permissions: p.permissions })),
    empty: 'This build has no plugin.',
  }),
  headers: () => ({
    caption: 'Headers that scripts/serve.mjs sends with every page',
    columns: [{ key: 'name', label: 'Header', kind: 'code' }, { key: 'value', label: 'Value', kind: 'code' }, { key: 'why', label: 'What it does' }],
    rows: HEADERS,
  }),
  'third-party': ({ plugins }) => ({
    caption: 'Files from other projects',
    columns: [{ key: 'name', label: 'Project' }, { key: 'version', label: 'Version', kind: 'code' }, { key: 'licence', label: 'Licence' }, { key: 'count', label: 'Files', kind: 'num' }, { key: 'from', label: 'Used by' }],
    rows: thirdParty(plugins).map((c) => ({ ...c, count: c.files.length })),
    empty: 'Ordinance DS contains no file from another project today.',
  }),
};
export const coreTableNames = Object.keys(CORE_TABLES);

/* ---------------------------------------------------------------- pages */
export function loadPages(plugins) {
  const pages = [];
  for (const p of plugins) for (const page of p.pages || []) pages.push({ ...page, plugin: p.id, dir: p.dir });
  return pages;
}
/* Languages. The first language in site.json is the default one, and its pages are at the top of dist/. Every other
   language gets a folder, for example dist/sv/. To translate, a language adds:
     strings/<lang>.json                          the texts of the interface (a missing text falls back to the default)
     plugins/<id>/lang/<lang>/pages/<file>        a page fragment
     plugins/<id>/lang/<lang>/help.json           the help of the plugin's pages
     plugins/<id>/lang/<lang>/titles.json         { "<file>": "the title in the menu" }
   A page that is not translated yet is shown in the default language, and says so with its lang attribute. */
export function languages(options = {}) {
  const site = readJson('site.json');
  return options.languages || site.languages || [site.lang];
}
function localise(page, lang, isDefault) {
  if (isDefault) return { title: page.title, source: [page.dir, page.source], translated: true, help: [page.dir, 'help.json'] };
  const at = [page.dir, 'lang', lang];
  const titles = exists(...at, 'titles.json') ? readJson(...at, 'titles.json') : {};
  const translated = exists(...at, page.source);
  return {
    title: titles[page.file] || page.title,
    source: translated ? [...at, page.source] : [page.dir, page.source],
    translated,
    help: exists(...at, 'help.json') && readJson(...at, 'help.json')[page.file] ? [...at, 'help.json'] : [page.dir, 'help.json'],
  };
}
function fill(body, page, ctx) {
  return body.replace(/<!-- ord:(core|table) ([\w./-]+) -->/g, (all, kind, name) => {
    if (kind === 'core') {
      if (!CORE_TABLES[name]) throw new Error(`${page.dir}/${page.source}: no table is called ${name}`);
      return renderTable(CORE_TABLES[name](ctx));
    }
    if (name.includes('..')) throw new Error(`${page.dir}/${page.source}: a table file is inside the plugin's folder`);
    return renderTable(readJson(page.dir, name));
  });
}
function iconHtml(name) {
  if (!name || !exists('third-party', 'icons', `${name}.svg`)) return '';
  const svg = read('third-party', 'icons', `${name}.svg`).replace(/<\?xml[^>]*\?>/, '').replace(/\s(?:aria-hidden|data-slot)="[^"]*"/g, '').trim();
  return svg.replace('<svg', '<svg class="ord-menu__icon" aria-hidden="true" focusable="false"');
}
/* The menu is written from the plugins' pages, in the order of the groups in site.json. It is a native popover: on a
   narrow screen the Menu button opens it, and on a wide screen the stylesheet shows it beside the page. */
function menuHtml(site, strings, pages, current, langs) {
  const groups = site.groups.map((group, i) => {
    // a page can stand under another page: "under" in plugin.json names the file of that page. It then follows that
    // page in the menu, set in. When the page above is not built, it is an item of its own group like any other.
    const above = (p) => (p.under && pages.some((x) => x.file === p.under && !x.under) ? p.under : null);
    const byOrder = (a, b) => a.order - b.order || (a.title < b.title ? -1 : 1);
    const link = (p, sub) => `<a class="ord-menu__item${sub ? ' ord-menu__sub' : ''}" href="${esc(p.file)}"${p.file === current.file ? ' aria-current="page"' : ''}>${sub ? '' : iconHtml(p.icon)}${esc(p.local.title)}</a>`;
    // The pages under a page are in a details element, so the reader can open and close them without a script.
    // They are open on the page above and on each of the pages under it, and closed on every other page.
    const items = pages.filter((p) => p.group === group.id && !above(p)).sort(byOrder).map((p) => {
      const under = pages.filter((x) => above(x) === p.file).sort(byOrder);
      if (!under.length) return `<li>${link(p)}</li>`;
      const open = p.file === current.file || under.some((x) => x.file === current.file);
      return `<li class="ord-menu__branch">${link(p)}
<details class="ord-menu__more"${open ? ' open' : ''}><summary class="ord-menu__toggle" aria-label="${esc(strings['menu-under'])}: ${esc(p.local.title)}"></summary>
<ul class="ord-menu__list">
${under.map((x) => `<li>${link(x, true)}</li>`).join('\n')}
</ul>
</details></li>`;
    });
    for (const label of group.planned || []) items.push(`<li><span class="ord-menu__item" data-status="planned">${esc(label)} <span class="ord-menu__note">${esc(strings.planned)}</span></span></li>`);
    if (!items.length) return '';
    return `<div class="ord-menu__group" role="group" aria-labelledby="menu-${i + 1}">
<p class="ord-menu__head" id="menu-${i + 1}">${esc(strings[`group-${group.id}`] || group.label)}</p>
<ul class="ord-menu__list">
${items.join('\n')}
</ul>
</div>`;
  }).filter(Boolean);
  // with more than one language, the menu ends with the same page in each language
  if (langs.all.length > 1) {
    const links = langs.all.map((l) => {
      const href = `${langs.up}${l === langs.all[0] ? '' : `${l}/`}${current.file}`;
      return `<li><a class="ord-menu__item" href="${esc(href)}" lang="${esc(l)}" hreflang="${esc(l)}"${l === langs.lang ? ' aria-current="true"' : ''}>${esc(langs.names[l] || l)}</a></li>`;
    });
    groups.push(`<div class="ord-menu__group" role="group" aria-labelledby="menu-lang">
<p class="ord-menu__head" id="menu-lang">${esc(strings.language)}</p>
<ul class="ord-menu__list">
${links.join('\n')}
</ul>
</div>`);
  }
  return `<nav class="ord-menu" id="menu" popover aria-label="${esc(strings['menu-label'])}">
<button type="button" class="ord-button ord-menu__close" popovertarget="menu" popovertargetaction="hide">${esc(strings['menu-close'])}</button>
${groups.join('\n')}
</nav>`;
}
/* The help of a page: a panel that opens beside the page and stays open while the reader works. It is a native popover too. */
function helpHtml(strings, title, help) {
  if (!help) return '';
  const topics = (help.topics || []).map((t) => `<section class="ord-help__topic">
<h3>${esc(t.title)}</h3>
${t.text.map((x) => `<p>${esc(x)}</p>`).join('\n')}
</section>`).join('\n');
  return `<aside class="ord-help" id="help" popover="manual" aria-label="${esc(strings['help-label'])}: ${esc(title)}">
<div class="ord-help__head">
<h2 class="ord-help__title">${esc(strings['help-label'])}: ${esc(title)}</h2>
<button type="button" class="ord-button ord-help__close" popovertarget="help" popovertargetaction="hide">${esc(strings['help-close'])}</button>
</div>
<div class="ord-help__body">
<p class="ord-help__lead">${esc(help.lead)}</p>
${topics}
</div>
</aside>`;
}
/* returns { files: { path: html }, pages: [{ ...page, file: path in dist, name, lang }] } */
export function buildPages(plugins, options = {}, assetNames = []) {
  const site = readJson('site.json');
  const all = languages(options);
  const base = readJson('strings', `${all[0]}.json`);
  const names = Object.fromEntries(all.map((l) => [l, (exists('strings', `${l}.json`) ? readJson('strings', `${l}.json`) : {})['language-name'] || l]));
  const basePages = loadPages(plugins);
  const ctx = { plugins, pages: basePages, site };
  const files = {}; const pages = [];
  for (const lang of all) {
    const isDefault = lang === all[0];
    const up = isDefault ? '' : '../';
    const strings = { ...base, ...(!isDefault && exists('strings', `${lang}.json`) ? readJson('strings', `${lang}.json`) : {}) };
    const local = basePages.map((p) => ({ ...p, local: localise(p, lang, isDefault) }));
    for (const page of local) {
      const help = exists(...page.local.help) ? readJson(...page.local.help)[page.file] : undefined;
      const home = local.some((p) => p.file === site.home) ? site.home : page.file;
      const scripts = (page.scripts || []).map((s) => `<script src="${esc(up + s)}" defer></script>`).join('\n');
      let body = fill(read(...page.local.source).trim(), page, ctx);
      // a file of the site that is not a page is at the top of dist/, for every language
      if (!isDefault) body = body.replace(/\s(href|src)="([^"/:#]+)"/g, (m, attr, name) => (assetNames.includes(name) ? ` ${attr}="${up}${name}"` : m));
      const path = `${isDefault ? '' : `${lang}/`}${page.file}`;
      files[path] = `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(META_CSP)}">
<meta name="referrer" content="no-referrer">
<title>${esc(page.local.title)} · ${esc(site.name)}</title>
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${up}ordinance.css">
</head>
<body>
<a class="ord-skip" href="#content">${esc(strings.skip)}</a>
<div class="ord-shell">
<div class="ord-shell__side">
<header class="ord-shell__bar">
<a class="ord-shell__brand" href="${esc(home)}">${esc(site.name)}</a>
${help ? `<button type="button" class="ord-button ord-shell__help" popovertarget="help">${esc(strings['help-label'])}</button>\n` : ''}<button type="button" class="ord-button ord-shell__open" popovertarget="menu">${esc(strings.menu)}</button>
</header>
${menuHtml(site, strings, local, page, { all, lang, up, names })}
</div>
<main class="ord-page" id="content"${page.local.translated ? '' : ` lang="${esc(all[0])}"`}>
${body}
<footer class="ord-page__foot"><p>${esc(strings.foot)}</p></footer>
</main>
${helpHtml(strings, page.local.title, help)}
</div>${scripts ? `\n${scripts}` : ''}
</body>
</html>
`;
      const { local: _local, ...plain } = page;
      pages.push({ ...plain, file: path, name: page.file, lang, title: page.local.title });
    }
  }
  return { files, pages };
}

/* every file of dist/, as text or as bytes */
export function buildAll(options = {}) {
  const plugins = loadPlugins(options);
  const assets = { 'ordinance.css': buildCss(plugins), 'favicon.svg': read('src', 'favicon.svg'), 'sbom.cdx.json': sbom(plugins) };
  for (const p of plugins) for (const a of p.assets || []) assets[a.split('/').pop()] = readFileSync(join(root, p.dir, a));
  const faces = exists('tokens', 'fonts.json') ? readJson('tokens', 'fonts.json').faces : [];
  for (const f of faces) assets[`fonts/${f.file.split('/').pop()}`] = readFileSync(join(root, f.file));
  const built = buildPages(plugins, options, Object.keys(assets));
  return { files: { ...assets, ...built.files }, plugins, pages: built.pages };
}
export const sameBytes = (a, b) => Buffer.from(a).equals(Buffer.from(b));

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const { files } = buildAll();
  rmSync(join(root, 'dist'), { recursive: true, force: true });
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, 'dist', name)), { recursive: true });
    writeFileSync(join(root, 'dist', name), body);
  }
  console.log(`built dist/: ${Object.keys(files).length} files`);
}
export { walk };
