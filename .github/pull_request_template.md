## What changes

<!-- One or two sentences. One pull request has one purpose. -->

## Why

<!-- The reason, or the issue that this answers. -->

## How to review

<!-- The commits in the order to read them, one line each. Say where to look hardest. -->

1.

## What could go wrong

<!-- What this could break, and how to undo it. Say what you did not do, and what you could not test. -->

## Checked

- [ ] Each commit is one change, and builds and passes the check by itself
- [ ] `node scripts/build.mjs` and `node scripts/check.mjs` pass
- [ ] `node --test` passes
- [ ] `node scripts/browser-tests.mjs` passes (when a page, the stylesheet or a script changed)
- [ ] `npm run lint` passes in `tools/lint` (when a script changed)
- [ ] `node scripts/history-check.mjs main..HEAD` passes
- [ ] The change holds no secret, no personal data and no path of a computer
- [ ] No commit and no text here names a tool or an AI agent. I am responsible for this change.
