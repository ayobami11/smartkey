Generate a commit message for the current staged changes (or all tracked changes if nothing is staged), following Conventional Commits and this project's commitlint rules.

## Steps

1. Run `git diff --staged` to get staged changes. If the output is empty, run `git diff` for unstaged tracked changes. If both are empty, tell the user there is nothing to commit.

2. Analyse the diff and produce **one** commit message.

## Commit message rules

**Format:**

```
<type>[(<scope>)][!]: <subject>

[body]

[footer(s)]
```

**type** — choose exactly one (no others allowed):

- `feat` – new feature
- `fix` – bug fix
- `docs` – documentation only
- `style` – formatting, whitespace, missing semicolons (no logic change)
- `refactor` – code restructure with no feature or bug change
- `perf` – performance improvement
- `test` – adding or fixing tests
- `build` – build system, dependencies, tooling config
- `ci` – CI/CD pipeline changes
- `chore` – maintenance tasks that don't fit elsewhere
- `revert` – reverts a previous commit
- `setup` – initial project setup or configuration of new tools/libraries

**scope** — optional, lowercase noun naming the affected area (e.g. `auth`, `layout`, `api`).

**!** — append after type/scope when the change is a breaking change.

**subject** — imperative mood, sentence-case or lower-case (never Title Case, PascalCase, or ALL CAPS). No period at the end. Maximum **72 characters**.

**body** — optional. Must be separated from the subject by a **blank line**. Explain _what_ and _why_, not _how_.

**footer(s)** — optional. Must be separated from the body (or subject if no body) by a **blank line**. Use git trailer format: `Token: value` or `Token #value`. Breaking changes must include a `BREAKING CHANGE: <description>` footer (in addition to, or instead of, `!`).

## Output

Print only the final commit message — no commentary, no code fences, no explanation — so the user can copy it directly.
