#!/usr/bin/env node
// The history check: `node scripts/history-check.mjs`. It reads every commit that git holds, not only the files of today.
// A secret, a private address or a path of someone's computer stays in the history after the file is corrected, and a
// history that is published cannot be taken back. So run this before the first push, and before a release.
// It needs git and Node.js, and nothing else. It changes nothing.
//   node scripts/history-check.mjs            every commit that can be reached from any branch
//   node scripts/history-check.mjs main..HEAD only the commits of this branch
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root } from './lib.mjs';

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const range = process.argv[2] ? [process.argv[2]] : ['--all'];
let commits;
try { commits = git('log', ...range, '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%x1f%P%x1f%s%x1f%b%x1e').split('\x1e').map((c) => c.trim()).filter(Boolean).map((c) => { const [hash, an, ae, cn, ce, sig, parents, subject, body] = c.split('\x1f'); return { hash, an, ae, cn, ce, sig, parents: parents ? parents.split(' ') : [], subject, body: body || '' }; }); } catch (e) { console.error('This folder has no git history that can be read.'); process.exit(2); }

// What must never be in a commit. Each pattern is written so that this file does not match itself.
const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'a token of a code host'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an access key of a cloud'],
  [/\bsk-[A-Za-z0-9_-]{24,}/, 'a key of an API'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a token of a chat service'],
  [/\b(?:password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'a password or a key with a value'],
];
const LOCAL = [[/\b[A-Za-z]:\\Users\\[^\\\s"']+/, 'a path of someone\'s computer'], [/(?:^|[\s"'(=])\/(?:home|Users)\/[a-z][\w.-]+\//, 'a path of someone\'s computer']];
const MAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const MAIL_OK = /@(?:users\.noreply\.github\.com|example\.(?:com|org|net))$|^(?:git|x-access-token)@/i;
const BIG = 1024 * 1024;
// A commit names the person who is responsible for it, and no tool. The names of AI tools are held as hashes, so that
// this file does not advertise them: a word of a message is hashed and compared.
const TOOLS = new Set(['c857d09db23e6822', 'c70eca6b0f88f44d', '3ea125d0bff386e6', '60965168ce762e94', '7d3194f79e645c42', '053ea4804ef1bb33', '5d72436256ada538', '57de4cf40144bdf7', '5792d2981981be5a', 'ebde709e306badca', '5d0c0ab127fdea24', '84829dbd81531188', '0ac0192d441f96da', '97f128115e33c769', 'add92b9cde2bdbf3', '487b91042c7cf27a']);
const namesTool = (text) => (text.toLowerCase().match(/[a-z]+/g) || []).some((w) => TOOLS.has(createHash('sha256').update(w).digest('hex').slice(0, 16)));
const TOOL_LINE = /generated (?:with|by)\b|\bwritten by an? (?:ai|agent|assistant|model)\b|\bai[- ](?:generated|assisted|agent|assistant)\b|\[bot\]|\u{1F916}/iu;
// a commit of more than this is hard to review as one change (the first commit of a repository is not counted)
const MANY_FILES = 40, MANY_LINES = 800;

const problems = []; const notes = [];
const fail = (commit, why) => problems.push(`${commit.hash.slice(0, 7)}  ${why}`);

for (const c of commits) {
  // the message: a reader of the history must see what changed without opening the change
  if (!c.subject.trim()) fail(c, 'the commit has no message');
  else if (c.subject.length > 72) fail(c, `the first line of the message has ${c.subject.length} characters; keep it under 72`);
  else if (/^(wip|fix|update|changes?|stuff|tmp|test)\.?$/i.test(c.subject.trim())) fail(c, `the message "${c.subject}" does not say what changed`);
  const message = `${c.subject}\n${c.body}`;
  if (namesTool(message) || TOOL_LINE.test(message) || namesTool(`${c.an} ${c.ae} ${c.cn} ${c.ce}`) || /\[bot\]/.test(`${c.an}${c.cn}`)) fail(c, 'the commit names a tool or an AI agent: a commit names the responsible person only');
  if (c.parents.length === 1) {
    const stat = git('show', c.hash, '--format=', '--numstat', '--', '.', ':(exclude)*package-lock.json', ':(exclude)third-party').split('\n').filter(Boolean).map((l) => l.split('\t'));
    const lines = stat.reduce((n, [add]) => n + (+add || 0), 0);
    if (stat.length > MANY_FILES || lines > MANY_LINES) notes.push(`${c.hash.slice(0, 7)}  ${stat.length} files and ${lines} added lines: is this one change?`);
  }
  if (c.parents.length > 1) notes.push(`${c.hash.slice(0, 7)}  a merge commit: fine, when the main branch does not require one line of history`);

  // the lines that the commit added
  let patch = '';
  try { patch = git('show', c.hash, '--format=', '--unified=0', '--no-color', '--text', '--', '.', ':(exclude)*package-lock.json', ':(exclude)*.woff2'); } catch { fail(c, 'the change could not be read'); continue; }
  let file = '';
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    if (file === 'scripts/history-check.mjs') continue;
    const text = line.slice(1);
    for (const [re, what] of SECRETS) if (re.test(text)) fail(c, `${file}: ${what}`);
    for (const [re, what] of LOCAL) if (re.test(text)) fail(c, `${file}: ${what}`);
    for (const m of text.match(MAIL) || []) if (!MAIL_OK.test(m) && !/\.(png|svg|woff2|json)$/.test(m)) fail(c, `${file}: the address ${m.replace(/^(.).*(@.*)$/, '$1…$2')} of a person`);
  }
}

// large files stay in the history for ever, and every copy of the repository carries them
const blobs = git('rev-list', '--objects', ...range).split('\n').filter(Boolean);
const sizes = execFileSync('git', ['cat-file', '--batch-check=%(objecttype) %(objectsize) %(objectname)'], { cwd: root, encoding: 'utf8', input: blobs.map((b) => b.split(' ')[0]).join('\n') + '\n', maxBuffer: 64 * 1024 * 1024 }).split('\n');
const names = new Map(blobs.map((b) => { const i = b.indexOf(' '); return i < 0 ? [b, ''] : [b.slice(0, i), b.slice(i + 1)]; }));
for (const s of sizes) { const [type, size, id] = s.split(' '); if (type === 'blob' && +size > BIG) problems.push(`${id.slice(0, 7)}  ${names.get(id)}: a file of ${(size / BIG).toFixed(1)} MB in the history`); }

// facts for a reader of the history. They are not failures: the owner decides what the code host must require.
const people = new Map();
for (const c of commits) for (const [n, e] of [[c.an, c.ae], [c.cn, c.ce]]) people.set(`${n} <${e}>`, (people.get(`${n} <${e}>`) || 0) + 1);
const signed = commits.filter((c) => /^gpgsig /m.test(git('cat-file', 'commit', c.hash).split('\n\n')[0])).length;
const personal = [...people.keys()].filter((p) => !MAIL_OK.test(p.slice(p.indexOf('<') + 1, -1)));

for (const p of [...new Set(problems)]) console.log(`FAIL  ${p}`);
for (const n of notes) console.log(`NOTE  ${n}`);
console.log(`\n${commits.length} commits read.`);
console.log(`Commits that carry a signature: ${signed} of ${commits.length}. This command does not verify a signature; the code host does.`);
console.log(`Names and addresses in the history (they become public with the first push):`);
for (const [p, n] of people) console.log(`  ${p.replace(/<(.).*(@.*)>/, '<$1…$2>')}${MAIL_OK.test(p.slice(p.indexOf('<') + 1, -1)) ? '' : '  (a personal address)'}`);
if (personal.length) console.log('A personal address in the history cannot be removed after a push. Your code host can give you an address that hides it.');
const n = new Set(problems).size;
console.log(`\n${n ? `${n} problems in the history` : 'OK: no secret, no path of a computer, no address of a person, no name of a tool and no large file in the history'}`);
process.exit(n ? 1 : 0);
