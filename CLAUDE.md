# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server at http://localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
npm run lint:fix     # Run ESLint with auto-fix
npm run format       # Format src/** with Prettier
npm run format:check # Check formatting without writing
```

## Agent Rules

See @AGENTS.md for additional rules that apply when working in this repository.

## Claude Code Customisations

**PostToolUse hook** (`.claude/settings.json`): Prettier runs automatically on every file after Write, Edit, or MultiEdit — no need to format manually.

**`/commit` skill** (`.claude/commands/commit.md`): generates a Conventional Commits message from `git diff --staged` (falls back to `git diff`).

**`jq` is not available** on this machine. Use `node` for any JSON parsing in shell commands (e.g. hook commands, scripts).

## Installed Agent Skills

Six skills are installed in `.agents/skills/` and tracked in `skills-lock.json`. They are automatically available to Claude Code:

| Skill                         | What it covers                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `next-best-practices`         | Next.js file conventions, RSC boundaries, async APIs, data patterns, routing, image/font, bundling |
| `shadcn`                      | shadcn/ui component management — add, update, compose, style                                       |
| `vercel-react-best-practices` | React performance: re-renders, async patterns, bundling, rendering                                 |
| `frontend-design`             | General frontend design guidance                                                                   |
| `web-design-guidelines`       | Visual/UX design guidelines                                                                        |
| `find-skills`                 | Discover and install new skills from skills.sh                                                     |

To update skills: `npx skills update`. To find new ones: `npx skills find <query>`.

## Architecture

This is a Next.js 16 (App Router) project using React 19, TypeScript, and Tailwind CSS v4.

- `src/app/` — App Router root. `layout.tsx` wraps all pages with Geist fonts and base body styles. `globals.css` holds global styles.
- `next.config.ts` — Next.js config (currently empty placeholder).

## Code Quality Tooling

**Pre-commit hook** (`lint-staged`): on staged JS/TS files runs ESLint with auto-fix; on JSON/CSS/MD files runs Prettier.

**Commit-msg hook** (`commitlint`): enforces Conventional Commits. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `setup`. Subject max 72 chars, must not be start-case, pascal-case, or upper-case.

**Prettier config** (`.prettierrc`): single quotes, semicolons, 2-space tabs, trailing commas (ES5), 80 char print width, LF line endings.

**ESLint config** (`eslint.config.mjs`): Next.js core-web-vitals + TypeScript rules, Prettier integration (disables conflicting rules).
