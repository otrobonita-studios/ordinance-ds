import { test } from 'node:test';
import assert from 'node:assert/strict';
import { META_CSP, CSP, NOT_IN_META } from '../scripts/headers.mjs';
import { buildAll } from '../scripts/build.mjs';

test('the page carries the server policy, without the one directive that a meta tag cannot set', () => {
  assert.ok(!META_CSP.includes('frame-ancestors'));
  assert.equal(META_CSP, CSP.split('; ').filter((d) => !d.startsWith('frame-ancestors')).join('; '));
  const { files, pages } = buildAll();
  for (const p of pages) assert.ok(String(files[p.file]).includes(`content="${META_CSP}"`), p.file);
});

test('the page names every header that a meta tag cannot set', () => {
  assert.deepEqual(NOT_IN_META, ['frame-ancestors', 'X-Content-Type-Options', 'Cross-Origin-Opener-Policy', 'Permissions-Policy', 'Cache-Control']);
  const page = String(buildAll().files['secure-by-default.html']);
  for (const h of NOT_IN_META) assert.ok(page.includes(h), h);
});
