# Ordinance DS

**Build for a future audit from the first commit. Because in an audit, every commit counts.**

Use Ordinance DS as a web starter pack with a minimal design system. It is meant as the start of a regulated product, and you and your agents will build much more on top of it.

It has a strict security policy, self-hosted assets, components built to WCAG 2.2, conventions that an AI agent can follow, and defaults that an auditor can check.

It is stable: its names and tokens change only with a release that says so. The built site in `dist/` documents it: open `dist/index.html`.

## Build, check and test (PowerShell)

```powershell
node scripts/build.mjs
node scripts/check.mjs
node --test
node scripts/browser-tests.mjs
Start-Process .\dist\index.html
```

The build, the check and the unit tests need Node.js 20 or later and nothing else. The browser test also needs Chrome or Edge.

To serve the site on your own computer with the security headers:

```powershell
node scripts/serve.mjs
```

## What is where

| Path | What it is |
|---|---|
| `AGENTS.md` | The rules for a change, for a developer or an AI agent |
| `NAMING.md` | The naming contract: the prefix, the class names, state as attributes, the token format |
| `site.json` | The name and the languages of the site, and the groups of the menu |
| `tokens/` | The design tokens in the Design Tokens format, light and dark; the colour pairs that the check measures; the typeface files |
| `names.json` | The register of the core's classes and data attributes |
| `strings/` | The texts of the interface, one file for each language |
| `src/css/` | The source of the core's stylesheet. It uses tokens only. |
| `plugins/` | One folder for each plugin: its `plugin.json`, page fragments, help and data |
| `third-party.json`, `third-party/` | The files from other projects, each with its checksum: the typefaces and the icons |
| `scripts/build.mjs` | Writes `dist/` from the sources. The same sources give the same bytes. |
| `scripts/check.mjs`, `scripts/rules.mjs` | The checks, and the list of their rules |
| `scripts/serve.mjs`, `scripts/headers.mjs` | The local server, and the security headers that it sends |
| `scripts/browser-tests.mjs` | The test in a browser without a window |
| `tools/lint/`, `eslint.config.mjs` | The linter for the scripts, with its own packages: run `npm ci --ignore-scripts` and then `npm run lint` in `tools/lint` |
| `scripts/history-check.mjs` | Reads every commit for secrets, personal addresses, paths of a computer and large files |
| `CONTRIBUTING.md`, `.github/pull_request_template.md` | How a change is made, and what a pull request must say |
| `tests/` | The unit tests |
| `tests/base-ui/` | A test with Base UI. It has its own packages: run `npm ci --ignore-scripts` and then `npm test` in that folder. |
| `.github/workflows/check.yml` | The pipeline: a copy of the template in `plugins/pipeline/assets/`. The check compares the two. |
| `LICENSE`, `NOTICE.md`, `SECURITY.md` | The licence, the notices for files from other projects, and how to report a vulnerability |
| `dist/` | Build output. Never edit it. |

## Add a page

1. Choose the plugin that the page belongs to, or make a new folder in `plugins/` with a `plugin.json`.
2. Write the page as a fragment in the plugin's `pages/` folder: the body of the page, without the menu.
3. Name the page in `plugin.json` with its file, title, group and order. The build then gives it an item in the menu. Add `under` with the file name of another page to set the item in under that page.
4. Add the help of the page to the plugin's `help.json`.
5. Build, check and test.

## Add a language

The pages are in English. To add a language, add its code to `languages` in `site.json`, copy `strings/en.json` to a file with that code, and put translated pages in `plugins/<id>/lang/<code>/pages/`. The page Core has the steps.

## Licence

MIT. See `LICENSE`. The files from other projects keep their own licences: see `NOTICE.md`.

## Not done yet

The pipeline has not run on a server, no release is signed, and no person has tested the pages with a screen reader. The page Home lists this.
