// The writing check: the pages against the plain-language rules in rules.json and avoid.json.
// A team that follows another specification changes the two files, not this code.
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const plain = (html) => decode(html.replace(/<pre\b[\s\S]*?<\/pre>/g, ' ').replace(/<code\b[\s\S]*?<\/code>/g, ' code ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
export const sentences = (text) => text.split(/(?<=[.?!])\s+(?=[A-Z("])/).filter(Boolean);
const AMERICAN = /\b(organi[z]ation\w*|organi[z]e\w*|optimi[z]\w+|analy[z]\w+|customi[z]\w+|behavior\w*|centered|canceled|catalog)\b/i;

/* the problems of one page, as a list of reasons */
export function textProblems(html, cfg) {
  const out = [];
  const body = (/<main\b[\s\S]*<\/aside>|<main\b[\s\S]*<\/main>/.exec(html) || [html])[0].replace(/<script\b[\s\S]*?<\/script>/g, ' ');
  for (const m of body.matchAll(/<(p|li|td|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = plain(m[2]);
    for (const s of sentences(text)) { const n = s.split(' ').length; if (n > cfg.maxSentence) out.push(`${n} words in one sentence: "${s.slice(0, 60)}..."`); }
    if (/\d\s%/.test(text)) out.push(`a space before the percent sign: "${text.slice(0, 40)}"`);
  }
  const all = plain(body);
  for (const a of cfg.avoid) { const m = new RegExp(`\\b${a.phrase}\\b`, 'i').exec(all); if (m) out.push(`"${m[0]}": ${a.instead}`); }
  const am = AMERICAN.exec(all); if (am) out.push(`American spelling: "${am[0]}"`);
  for (const m of body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) { const t = plain(m[1]); if (t.split(' ').length > cfg.maxButton) out.push(`a button with more than ${cfg.maxButton} words: "${t}"`); }
  for (const m of body.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/g)) if (/\.$/.test(plain(m[1]))) out.push(`a heading that ends with a full stop: "${plain(m[1])}"`);
  return out;
}

export function config({ plugin, readJson }) {
  const rules = Object.fromEntries(readJson(plugin.dir, 'rules.json').rows.map((r) => [r.key, r.value]));
  return { maxSentence: rules['max-sentence'], maxButton: rules['max-button'], avoid: readJson(plugin.dir, 'avoid.json').rows };
}

export function check(ctx) {
  const cfg = config(ctx);
  const out = [];
  const first = ctx.built.pages[0]?.lang;
  // the rules are written for the default language; another language brings its own rules
  for (const page of ctx.built.pages.filter((p) => p.lang === first)) for (const why of textProblems(String(ctx.built.files[page.file]), cfg)) out.push({ rule: 'writing', file: `dist/${page.file}`, why });
  return out;
}
