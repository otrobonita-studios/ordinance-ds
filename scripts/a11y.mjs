// The accessibility rules that a script can read from the HTML of one page. scripts/check.mjs runs them on every built
// page, and tests/a11y.test.mjs proves each rule with a page that breaks it.
// A script cannot judge whether a name is a good name. It can only see that a name exists.

const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const has = (tag, name) => new RegExp(`\\s${name}(?:[\\s=>/]|$)`).test(tag);
// the words that a reader of the page can perceive inside a piece of markup
const words = (inner) => inner
  .replace(/<svg\b[\s\S]*?<\/svg>/g, (svg) => (/\saria-hidden="true"/.test(svg) ? '' : (attr(svg, 'aria-label') || (/<title>([^<]*)<\/title>/.exec(svg) || [])[1] || '')))
  .replace(/<img\b[^>]*>/g, (img) => attr(img, 'alt') || '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();

const VAGUE = new Set(['click here', 'here', 'read more', 'more', 'link', 'this link', 'learn more', 'details']);
const SKIPPED_INPUTS = new Set(['hidden', 'submit', 'reset', 'button', 'image']);
const REFERENCES = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-details', 'aria-errormessage', 'aria-activedescendant', 'headers', 'for', 'form', 'list', 'commandfor', 'popovertarget'];

export function accessProblems(html) {
  const out = [];
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const named = (tag) => (attr(tag, 'aria-label') || '').trim() || (attr(tag, 'aria-labelledby') || '').split(/\s+/).some((id) => ids.has(id)) || (attr(tag, 'title') || '').trim();
  const show = (tag) => tag.replace(/\s+/g, ' ').slice(0, 70);

  // 4.1.2 Name, Role, Value and 2.4.4 Link Purpose: a link and a button have a name in words
  for (const m of html.matchAll(/<(a|button|summary)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const tag = `<${m[1]}${m[2]}>`; const text = words(m[3]);
    if (!text && !named(tag)) out.push(`${show(tag)} has no name: give it words, or an aria-label`);
    if (m[1] === 'a' && VAGUE.has(text.toLowerCase().replace(/[.!»›>]+$/, '').trim())) out.push(`the link "${text}" does not say where it leads`);
    if (m[1] === 'a' && !has(tag, 'href')) out.push(`${show(tag)} is a link without an address: use a button, or plain text`);
  }

  // 1.3.1 and 3.3.2 Labels or Instructions: a form control has a label
  const labelled = new Set([...html.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
  const inLabel = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map((m) => [m.index, m.index + m[0].length]);
  for (const m of html.matchAll(/<(input|select|textarea|meter|progress)\b([^>]*)>/g)) {
    const tag = m[0];
    if (m[1] === 'input' && SKIPPED_INPUTS.has(attr(tag, 'type') || 'text') && !['image'].includes(attr(tag, 'type'))) continue;
    if (m[1] === 'input' && attr(tag, 'type') === 'image') { if (!(attr(tag, 'alt') || '').trim()) out.push(`${show(tag)} is an image button without alt text`); continue; }
    const id = attr(tag, 'id');
    if (named(tag) || (id && labelled.has(id)) || inLabel.some(([a, b]) => m.index > a && m.index < b)) continue;
    out.push(`${show(tag)} has no label: add a label element, or an aria-label`);
  }

  // 1.3.1: a reference to another element leads to an element that exists
  for (const m of html.matchAll(/<[a-z][^>]*>/g)) for (const name of REFERENCES) {
    const value = attr(m[0], name); if (value === null) continue;
    if (name === 'for' && !/^<(label|output)\b/.test(m[0])) continue;
    if ((name === 'form' || name === 'list') && !/^<(input|button|select|textarea|fieldset|output|object)\b/.test(m[0])) continue;
    for (const id of value.split(/\s+/).filter(Boolean)) if (!ids.has(id)) out.push(`${name}="${id}" names no element on the page`);
  }

  // 1.1.1 Non-text Content: a picture is hidden from a screen reader, or it has a name
  for (const m of html.matchAll(/<svg\b[^>]*>/g)) if (attr(m[0], 'aria-hidden') !== 'true' && !(attr(m[0], 'role') === 'img' && named(m[0]))) out.push('a picture (svg) is not hidden with aria-hidden="true" and has no name');
  for (const m of html.matchAll(/<(iframe|object|embed|audio|video)\b[^>]*>/g)) if (!named(m[0])) out.push(`<${m[1]}> has no name: add a title or an aria-label`);
  for (const m of html.matchAll(/<area\b[^>]*>/g)) if (!(attr(m[0], 'alt') || '').trim()) out.push('an area of an image map has no alt text');

  // 1.3.1: every head cell of a table says what it heads
  for (const m of html.matchAll(/<th\b[^>]*>/g)) if (!/^(col|row|colgroup|rowgroup)$/.test(attr(m[0], 'scope') || '')) out.push('a head cell of a table (th) has no scope');
  for (const m of html.matchAll(/<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/g)) if (!/^\s*<legend\b/.test(m[1])) out.push('a group of form controls (fieldset) does not start with a legend');

  // 2.4.3 Focus Order and 2.1.1 Keyboard: the order of the page is the order of the keyboard
  for (const m of html.matchAll(/\stabindex="(-?\d+)"/g)) if (+m[1] > 0) out.push(`tabindex="${m[1]}" changes the order of the keyboard: use 0 or -1`);
  if (/\saccesskey=/.test(html)) out.push('accesskey: a key of the page can clash with a key of the reader\'s own tools');
  if (/\sautofocus\b/.test(html)) out.push('autofocus moves the reader without asking');

  // 1.4.4 Resize Text and 2.2.1 Timing Adjustable
  const viewport = (/<meta\b[^>]*name="viewport"[^>]*>/.exec(html) || [''])[0];
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*[0-4](\.\d+)?\b/.test(viewport)) out.push('the viewport stops the reader from zooming');
  if (/<meta\b[^>]*http-equiv="refresh"/i.test(html)) out.push('the page reloads or moves by itself (meta refresh)');
  if (/<(marquee|blink)\b/i.test(html)) out.push('moving or blinking text');

  // 1.3.1 and 2.4.1: the landmarks of the page
  if ((html.match(/<main\b/g) || []).length !== 1) out.push('a page has exactly one main element');
  const navs = [...html.matchAll(/<nav\b[^>]*>/g)].map((m) => (attr(m[0], 'aria-label') || '').trim());
  if (navs.some((n) => !n) && navs.length > 1) out.push('with several nav elements, each one needs a name (aria-label)');
  for (const n of new Set(navs)) if (n && navs.filter((x) => x === n).length > 1) out.push(`two nav elements have the same name: ${n}`);

  // 3.1.2 Language of Parts: a lang attribute holds a language code
  for (const m of html.matchAll(/\slang="([^"]*)"/g)) if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(m[1])) out.push(`lang="${m[1]}" is not a language code`);

  // 4.1.2: a role is one that browsers know, and a hidden element holds nothing that takes focus
  for (const m of html.matchAll(/<(\w+)\b[^>]*\saria-hidden="true"[^>]*>([\s\S]*?)<\/\1>/g)) if (/<(a\b[^>]*\shref|button|input|select|textarea)\b/.test(m[2])) out.push('an element with aria-hidden="true" holds a control that takes focus');

  return [...new Set(out)];
}
