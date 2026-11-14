# Contributing

Read `AGENTS.md` first. It holds the rules for a change, with the full rules for commits and pull requests.

## A change

1. Make a branch from `main`. Nobody commits to `main` directly.
2. Make one commit for each change that has one reason. Each commit builds and passes the check by itself.
3. Run the commands in the template of the pull request.
4. Open a pull request with one purpose. Say in which order to read the commits. A second person approves it, and the check must pass.

## The history

- The first line of a message says what changed, in under 72 characters. The lines after it say why.
- A commit and a pull request name the responsible person only. They name no tool and no AI agent, whatever helped to write the change.
- A commit holds no secret, no personal data and no path of a computer. `node scripts/history-check.mjs` reads every commit for these.
- A mistake in a published commit is corrected with a new commit. Nobody rewrites the history of `main`.
- Use an address that your code host gives you, if you do not want your own address to be public.

The built page History explains the reasons.
