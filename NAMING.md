# Naming contract

Ordinance DS has one rule for every name: the name is registered before it is used. `node scripts/check.mjs` fails on a class, a token or a data attribute that is not registered, and on a registered name that nothing uses.

| What | Where it is registered |
|---|---|
| Tokens | `tokens/tokens.json` and `tokens/tokens.dark.json` |
| Classes and data attributes of the core | `names.json` |
| Classes and data attributes of a plugin | The `names` of its `plugin.json` |
| Interface strings | `strings/en.json` |

## 1. Prefix

The prefix is `ord`.

- Tokens: `--ord-color-text`
- Classes: `.ord-table`
- Cascade layers: `ord.reset`, `ord.tokens`, `ord.base`, `ord.parts`, `ord.utilities`
- Utilities: `.ord-u-nowrap`. A utility does one thing, and its value is a token.

## 2. Structure: block, element, modifier

- Block: `.ord-panel`
- Element: `.ord-panel__head`
- Modifier, for a variant that never changes while the page is open: `.ord-button--primary`

Names use lower-case letters, digits and single hyphens. An element belongs to one block, and there is no element of an element.

A block may style its native children by tag: `.ord-table th` is allowed, so that a table does not need a class on every cell.

The cascade layers keep specificity flat. The naming only says what belongs together.

## 3. State: attributes, never classes

A state that can change while the page is open is an attribute.

- Native attributes first: `disabled`, `open`, `aria-current`, `aria-pressed`, `aria-selected`.
- Then data attributes: `data-tone="harm"`, `data-theme="dark"`.

Base UI sets state the same way, so one stylesheet can style plain HTML and Base UI parts.

## 4. Tokens: the Design Tokens format

The token files follow the Design Tokens Community Group format: every token has a `$value` and a `$type`. The build writes one CSS custom property for each token, named by its path: `color.text` becomes `--ord-color-text`.

- A token is named by its role, never by its look: `color.harm`, not `color.red`.
- `tokens/tokens.json` holds the light theme and everything that has no theme.
- `tokens/tokens.dark.json` holds only the colours that differ in the dark theme.
- `tokens/contrast.json` lists the colour pairs and the contrast each pair must reach. The check measures them.

## 5. Icons

The menu shows an icon for an item when the file `third-party/icons/<name>.svg` exists. The name is the `icon` of the page in `plugin.json`.

The set is Heroicons 2.2.0, outline (MIT). The build puts the icon into the page as SVG, so the page makes no request for it. Each file is listed with its checksum in `third-party.json`, like every third-party file.

## 6. What is not in Ordinance DS

When something is left out of Ordinance DS, it is left out everywhere: no page, no menu item, no token and no mention.

- Motion and 3D pictures are not part of Ordinance DS. A product that needs them brings its own.
- Hiding items of the menu for a plan or a role is not part of Ordinance DS.
- Names from other products do not appear in this folder. The check holds a list of such names as hashes, so the list itself reveals none of them.

## 7. Standards that the names and pages follow

| Standard | Used for |
|---|---|
| Design Tokens Community Group format | The token files |
| CSS Cascading and Inheritance (`@layer`) | The order of the stylesheet |
| WCAG 2.2 and EN 301 549 | The accessibility rules, cited by criterion number |
| ISO 24495-1 | The plain-language rules, cited and not quoted |

Check the current version of each standard before a release, and write the version on the page that cites it.
