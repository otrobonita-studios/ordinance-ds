# Instructions for a change

These rules are for anyone who changes this folder: a developer or an AI agent. This is the only instruction file.

## What Ordinance DS is

A framework of HTML and CSS for teams that work under rules. It is a set of tokens, a stylesheet, a shell, a build and checks, with every other part as a plugin. The site in `dist/` documents the framework and is built from it.

## Read first

- [README.md](README.md): what is where, and the commands.
- [NAMING.md](NAMING.md): the naming contract. Read it before you add a class, a token or a data attribute.
- `dist/checks.html`, or [scripts/rules.mjs](scripts/rules.mjs): every rule that the check enforces.
- `dist/plugins.html`: how a plugin is made.

## Work

- Edit the sources, never `dist/`. The build writes `dist/` again each time.
- Register a name before you use it: a class or a data attribute in `names.json` or in the plugin's `plugin.json`, a token in `tokens/`.
- After every change, run these and report the result:

  ```powershell
  node scripts/build.mjs
  node scripts/check.mjs
  node --test
  ```

- When you change the shell, a part, the help or a script, also run the browser test. It needs Chrome or Edge:

  ```powershell
  node scripts/browser-test.mjs
  ```

- The build and the checks have no dependency. Do not add a package.
- A file from another project goes in `third-party/`, listed with its project, version, licence, source and SHA-256 value. The check refuses a file that is not listed.
- A new part of the site is a plugin: one folder in `plugins/`, complete with its pages, help and data. A page links only to pages of its own plugin.
- A page has no inline style, no inline script and no event attribute. A script is a file that a plugin declares.
- Write for readers whose first language is not English. The page Writing has the rules, and the check enforces them.
- When something is removed, remove it everywhere: its page, its item in the menu, its names and every mention.
- Never put a credential, personal data or a path on your own computer in a file.

## Commits

Work on a branch, never on `main`. A reviewer, a person or a program, reads one commit at a time. So each commit must be whole and small.

- One commit is one change that has one reason. If the message needs the word "and", make two commits.
- Each commit builds and passes the check by itself. Do not leave a fix for an earlier commit of the same branch: change that commit.
- A change of names, a move of files or a new format is its own commit, apart from a change of behaviour. A reader can then skip what did not change.
- A rule and its code, a part and its registered name, a page and its help go in the same commit. They do not pass the check apart.
- Never commit `dist/` or `node_modules/`.
- The first line of the message says what changed, in under 72 characters, and starts with a verb: "Add the compact variant of the table". The lines after it say why, and what a reviewer should look at.
- A commit and a pull request name no tool and no AI agent: no `Co-Authored-By` line for one, and no "generated with" line. The person who commits is responsible for the change, and the history names that person only.

## Pull requests

- One pull request has one purpose. Keep it small enough to read in one sitting: aim for under 400 changed lines, not counting data files and files from other projects.
- The title says the purpose. The description follows the template in `.github/pull_request_template.md`: what changes, why, how to review it, what could go wrong, and what was run.
- "How to review" lists the commits in the order to read them, and says where the reviewer should look hardest.
- Say what you did not do, and what you could not test. A reviewer cannot see what is missing.
- Run `node scripts/history-check.mjs main..HEAD` before you open the pull request.
- A pull request never changes a rule and the code that the rule protects without saying so in its first line.

## What a page may say

- A page says "checked" only for a rule that the check enforces. If you add such a statement, add the rule and its code in the same change.
- A page never says that Ordinance DS, or a product built on it, conforms to a law or holds a certificate. It says what the framework does and which rule that answers.
- A part that is not built is listed as not built. It is never described as if it works.
- Record a decision with its reason in `plugins/record/decisions.json`, and a change with its date in `plugins/record/changelog.json`.
- Never give the framework a version number. A version exists only as a tag that the owner has made in the repository. Until then no file, no page and no commit message names one. The version of a file from another project is a fact, and it stays.

## When a request is open

- If a request can be read in more than one way, build the most likely reading and say which reading you chose.
- Ask first only when a step is hard to undo or reaches outside this folder: publishing, deleting, downloading a file, or anything with a credential.
- A new name for the framework, a plugin or a token is a decision. Use it only when the request gives it, or record your choice as a decision.
