// Shared helpers for the build, the checks and the tests. No dependencies.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = (...p) => readFileSync(join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
export const readJson = (...p) => JSON.parse(read(...p));
export const exists = (...p) => existsSync(join(root, ...p));
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* every file under a folder, as paths from the project root, in a fixed order */
export function walk(dir, rel = '') {
  if (!exists(dir, rel)) return [];
  return readdirSync(join(root, dir, rel), { withFileTypes: true })
    .filter((e) => e.name !== 'node_modules' && !e.name.startsWith('.'))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => (e.isDirectory() ? walk(dir, `${rel}${e.name}/`) : [`${dir ? `${dir}/` : ''}${rel}${e.name}`]));
}

/* ---- tokens (the Design Tokens format): every token as { path, type, value }, with $type inherited from its group */
export function flatten(group, path = [], type = null, out = []) {
  const t = group.$type || type;
  for (const [key, node] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (node && typeof node === 'object' && '$value' in node) out.push({ path: [...path, key].join('.'), type: node.$type || t, value: node.$value, description: node.$description || '' });
    else if (node && typeof node === 'object') flatten(node, [...path, key], t, out);
  }
  return out;
}
export const cssName = (path) => `--ord-${path.replace(/\./g, '-')}`;
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-monospace', 'ui-sans-serif', 'ui-serif', '-apple-system']);
export function cssValue({ type, value, path }) {
  switch (type) {
    case 'color': return value.hex;
    case 'dimension': return value.value === 0 ? '0' : `${value.value}${value.unit}`;
    case 'duration': return `${value.value}${value.unit}`;
    case 'fontFamily': return (Array.isArray(value) ? value : [value]).map((f) => (GENERIC.has(f) ? f : `"${f}"`)).join(', ');
    case 'fontWeight': case 'number': return String(value);
    default: throw new Error(`${path}: the build does not know the token type ${type}`);
  }
}
/* A theme: a product changes tokens in tokens/theme.json (and tokens/theme.dark.json for the dark colours), and leaves
   tokens.json as it is. A theme has the same shape as tokens.json and holds only the tokens that it changes. The check
   measures the colours of the theme like any others, so a theme with too little contrast does not pass. */
export function applyTheme(base, theme) {
  for (const key of Object.keys(theme)) {
    if (key.startsWith('$')) continue;
    const from = base[key], to = theme[key];
    if (!from || typeof from !== 'object') throw new Error(`the theme changes ${key}, which is not a token`);
    if ('$value' in from) { if (!to || typeof to !== 'object' || !('$value' in to)) throw new Error(`the theme must give ${key} a $value`); base[key] = { ...from, $value: to.$value }; }
    else { try { applyTheme(from, to); } catch (e) { throw new Error(e.message.replace(/(changes|give) /, `$1 ${key}.`), { cause: e }); } }
  }
  return base;
}
const themed = (file, theme) => (exists('tokens', theme) ? applyTheme(readJson('tokens', file), readJson('tokens', theme)) : readJson('tokens', file));
export const lightTokens = () => flatten(themed('tokens.json', 'theme.json'));
export const darkTokens = () => flatten(themed('tokens.dark.json', 'theme.dark.json'));

/* ---- contrast (WCAG 2.2: relative luminance and contrast ratio) */
export const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export function measuredPairs() {
  const hex = (list) => new Map(list.filter((t) => t.type === 'color').map((t) => [t.path, t.value.hex]));
  const light = hex(lightTokens()), dark = hex(darkTokens());
  return readJson('tokens', 'contrast.json').pairs.map((p) => ({
    ...p,
    light: light.has(p.text) && light.has(p.on) ? contrast(light.get(p.text), light.get(p.on)) : null,
    dark: dark.has(p.text) && dark.has(p.on) ? contrast(dark.get(p.text), dark.get(p.on)) : null,
  }));
}

/* ---- plugins: every folder in plugins/ with a plugin.json, unless site.json disables it */
export function loadPlugins({ without = [] } = {}) {
  const site = readJson('site.json');
  const off = new Set([...(site.disabled || []), ...without]);
  if (!exists('plugins')) return [];
  return readdirSync(join(root, 'plugins'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && exists('plugins', e.name, 'plugin.json'))
    .map((e) => e.name).sort()
    .filter((id) => !off.has(id))
    .map((id) => ({ ...readJson('plugins', id, 'plugin.json'), dir: `plugins/${id}` }));
}

/* ---- a table from data: { caption, columns: [{ key, label, kind }], rows: [...], empty }
   kinds: text (default), code, codes (a list), num, tag ({ text, tone } or a string), swatch (a colour token's path) */
export function renderTable(table) {
  if (!table.rows || table.rows.length === 0) return `<p class="ord-empty">${esc(table.empty || 'Nothing is listed.')}</p>`;
  const cell = (col, v) => {
    if (v === undefined || v === null || v === '') return '';
    switch (col.kind) {
      case 'code': return `<code>${esc(v)}</code>`;
      case 'codes': return (Array.isArray(v) ? v : [v]).map((x) => `<code>${esc(x)}</code>`).join(', ');
      case 'tag': { const t = typeof v === 'string' ? { text: v } : v; return `<span class="ord-tag"${t.tone ? ` data-tone="${esc(t.tone)}"` : ''}>${esc(t.text)}</span>`; }
      case 'swatch': return `<span class="ord-swatch" data-token="${esc(String(v).replace(/\./g, '-'))}"></span>`;
      default: return esc(v);
    }
  };
  // "variant" on the table, and "wrap" and "width" on a column, choose the classes. An unknown word stops the build.
  const VARIANTS = ['compact', 'roomy', 'lines', 'zebra', 'fixed', 'sticky'];
  for (const v of table.variant || []) if (!VARIANTS.includes(v)) throw new Error(`a table has the variant ${v}; the variants are ${VARIANTS.join(', ')}`);
  const cls = (c) => {
    if (c.wrap && !['nowrap', 'break'].includes(c.wrap)) throw new Error(`a column has wrap ${c.wrap}; use nowrap or break`);
    if (c.width && !['narrow', 'wide'].includes(c.width)) throw new Error(`a column has width ${c.width}; use narrow or wide`);
    const list = [c.kind === 'num' && 'ord-table__num', c.wrap && `ord-table__${c.wrap}`, c.width && `ord-table__${c.width}`].filter(Boolean);
    return list.length ? ` class="${list.join(' ')}"` : '';
  };
  const head = table.columns.map((c) => `<th scope="col"${cls(c)}>${esc(c.label)}</th>`).join('');
  const rows = table.rows.map((r) => `<tr>${table.columns.map((c, i) => {
    const inner = cell(c, r[c.key]);
    if (i === 0) return `<th scope="row">${inner}</th>`;
    return `<td${cls(c)}>${inner}</td>`;
  }).join('')}</tr>`).join('\n');
  const foot = table.foot ? `<tfoot><tr>${table.columns.map((c, i) => (i === 0 ? `<th scope="row">${cell(c, table.foot[c.key])}</th>` : `<td${cls(c)}>${cell(c, table.foot[c.key])}</td>`)).join('')}</tr></tfoot>\n` : '';
  // a tall table scrolls inside its frame. The frame takes the focus, so that the keyboard can scroll it.
  const scroll = table.tall ? `<div class="ord-table-scroll ord-table-scroll--tall" tabindex="0" role="region" aria-label="${esc(table.caption || 'Table')}">` : '<div class="ord-table-scroll">';
  return `<div class="ord-panel">
${scroll}<table class="${['ord-table', ...(table.variant || []).map((v) => `ord-table--${v}`)].join(' ')}">
${table.caption ? `<caption>${esc(table.caption)}</caption>\n` : ''}<thead><tr>${head}</tr></thead>
<tbody>
${rows}
</tbody>
${foot}</table></div>
</div>`;
}
