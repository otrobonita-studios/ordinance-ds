# Third-party notices

Ordinance DS contains files from the projects below. Each file is listed in `third-party.json` with its SHA-256 value, and the check compares them.

| Project | Files | Copyright | Licence |
|---|---|---|---|
| Noto Sans, Noto Serif and Noto Sans Mono, from the packages `@fontsource-variable/noto-sans`, `noto-serif` and `noto-sans-mono` 5.3.0 | `third-party/fonts/` | Copyright 2022 The Noto Project Authors | SIL Open Font License 1.1. The full text is beside the files. |
| Heroicons 2.2.0 | `third-party/icons/` | Copyright (c) Tailwind Labs, Inc. | MIT. The full text is beside the files. |

When a file from another project is added, it is listed here with its copyright line and its licence.

The test in `tests/base-ui` installs React and Base UI (both MIT) from the npm registry. They are not in this folder and not in the built site.

The linter in `tools/lint` installs ESLint (MIT) from the npm registry, in the same way.
