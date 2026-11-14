import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentences, textProblems } from '../plugins/writing/check.mjs';

const cfg = { maxSentence: 8, maxButton: 3, avoid: [{ phrase: 'click here', instead: 'Say where the link leads.' }] };
const page = (inner) => `<main>${inner}</main>`;

test('text is split into sentences', () => {
  assert.deepEqual(sentences('One sentence. A second one! Node.js is not split.'), ['One sentence.', 'A second one!', 'Node.js is not split.']);
});
test('a long sentence is reported with its number of words', () => {
  const p = textProblems(page('<p>This sentence has far more than eight words in it.</p>'), cfg);
  assert.equal(p.length, 1);
  assert.match(p[0], /^10 words in one sentence/);
});
test('text inside code is not counted', () => {
  assert.deepEqual(textProblems(page('<p>Run <code>a very long command with many many words in it</code> now.</p>'), cfg), []);
});
test('a phrase to avoid, a long button and a heading with a full stop are reported', () => {
  const p = textProblems(page('<h2>A heading.</h2><p>Please click here.</p><button type="button">Send the form now</button>'), cfg);
  assert.equal(p.length, 3);
  assert.ok(p.some((x) => x.includes('Say where the link leads.')));
  assert.ok(p.some((x) => x.includes('more than 3 words')));
  assert.ok(p.some((x) => x.includes('full stop')));
});
test('American spelling and a space before a percent sign are reported', () => {
  const p = textProblems(page('<p>The organization grew 5 %.</p>'), cfg);
  assert.ok(p.some((x) => x.includes('American spelling')));
  assert.ok(p.some((x) => x.includes('percent sign')));
});
