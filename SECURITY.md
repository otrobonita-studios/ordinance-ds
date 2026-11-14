# Security

## Reporting a vulnerability

Report a vulnerability through https://otrobonita.com. Do not open a public issue for a vulnerability.

No time for an answer is promised yet.

## What holds today

Each line is enforced by `node scripts/check.mjs`, or tested by `node scripts/browser-test.mjs`.

| Area | Fact | Where to check |
|---|---|---|
| Dependencies | The build and the checks use Node.js and no package. One test, in `tests/base-ui`, installs three packages with exact versions. | `package.json`, `tests/base-ui/package.json` |
| Third-party files | Three typefaces and one set of icons. Each file is listed with its SHA-256 value, and the check compares them. | `third-party.json`, the rule `third-party` |
| Code in pages | No inline style, no inline script and no event attribute. | The rule `no-inline` |
| Requests | The stylesheet and the pages load nothing from another server. | The rule `same-origin`, the browser test |
| Scripts | One page loads a script. A script may not write HTML from data, store anything in the browser, or use the network, except for the one data function that asks the site's own server. | The rule `scripts` |
| Headers | The local server sends a Content-Security-Policy with no exception for inline code. | `scripts/headers.mjs` |
| Bill of materials | The build writes `sbom.cdx.json` in the CycloneDX format. | The rule `sbom` |

## What is not in place

- A time within which a report is answered.
- A pipeline that runs the checks on every change. A template exists and has not run live.
- A signed release.

## What Ordinance DS does not do

Ordinance DS has no server, no sign-in and no gateway for data. It does not decide who may read a page. The page Excluded lists what is left out, and why.
