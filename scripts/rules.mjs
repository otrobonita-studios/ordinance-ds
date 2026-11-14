// The rules that scripts/check.mjs enforces. The page "Checks" and the table on Home are written from this list, and
// the check fails when a rule here has no code, or code has no rule here. A plugin adds its own rules in its manifest.
export const RULES = [
  { id: 'names', rule: 'Every name is registered', does: 'It compares each class, data attribute and token in the stylesheet and the pages with the registers.' },
  { id: 'contrast', rule: 'Text reaches a contrast of 7:1, and the edge of a control 3:1', does: 'It measures every listed colour pair in the light theme and in the dark theme. Each pair has its own least value in the list.' },
  { id: 'tokens', rule: 'Colours and sizes come from tokens', does: 'It refuses a colour value, a pixel size above one, and an unknown token in the source of the stylesheet.' },
  { id: 'no-inline', rule: 'A page has no inline style or script', does: 'It refuses a style attribute, a style element, a script that is written into a page, and an event attribute.' },
  { id: 'same-origin', rule: 'Nothing loads from another server', does: 'It refuses an import and a remote address in the stylesheet, and a remote file in a page.' },
  { id: 'scripts', rule: 'A script is a declared file', does: 'It allows a script only on a page that declares it, from a plugin that may ship one. It refuses code that writes HTML from data.' },
  { id: 'menu', rule: 'The menu is written from one list', does: 'It compares every link with the built pages, and it requires that each menu marks exactly one current page.' },
  { id: 'structure', rule: 'Every page has the same sound structure', does: 'It requires a language, a title, one main heading, headings in order, a help text, and ids that are used once.' },
  { id: 'accessible', rule: 'Every control has a name, and every reference leads somewhere', does: 'It requires a name for each link, button and picture, and a label for each form control. It requires a scope for each head cell of a table. It refuses a reference to an id that does not exist, a keyboard order that differs from the page, and a page that stops zoom.' },
  { id: 'plugins', rule: 'A plugin is complete in one folder', does: 'It builds the site again without each plugin, and requires that every other page still builds and passes.' },
  { id: 'third-party', rule: 'Every third-party file is listed', does: 'It compares each file from another project with the SHA-256 value in the list, and refuses a file that is not listed.' },
  { id: 'sbom', rule: 'The bill of materials is complete', does: 'It compares the built bill of materials with the list of third-party files.' },
  { id: 'build', rule: 'The build is repeatable', does: 'It builds again and compares the result with the built files, byte for byte.' },
  { id: 'words', rule: 'A page claims no conformity', does: 'It refuses a claim that a product conforms to a rule, a name from another product, and a path on a local computer.' },
];
