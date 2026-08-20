# SmartKey — Stitch Prompt Files

Ready-to-paste prompt files for generating each screen of the SmartKey UI in Google Stitch.

## How this works

`DESIGN.md` is loaded once into your Stitch project as persistent context — it carries the full design system (colours, typography, spacing, components). Every Stitch generation is automatically conditioned on it.

These prompt files live separately. Each file is for **one screen**. Open the file, copy everything below the dashed line, paste it into Stitch as a single prompt, and Stitch generates that specific screen.

## Folder structure

```
prompts/
├── _shared-blocks.md — canonical source text for blocks duplicated across
│                       every file below (Project Context, route tables, Flow
│                       blocks, AI-surface blocks, Notifications, Responsive).
│                       Not pasted into Stitch itself — edit here first, then
│                       propagate into the per-screen files that use it.
├── public/        — Pre-authentication + guest screens (8 files)
│   ├── 01-landing.md
│   ├── 02-login.md
│   ├── 03-activation.md
│   ├── 04-forgot-password.md
│   ├── 05-reset-password.md
│   ├── 06-help.md
│   ├── 07-weekend-access-request.md
│   └── 08-weekend-access-status.md
├── cso/           — Chief Security Officer (8 files)
│   ├── 01-dashboard.md
│   ├── 02-reports.md
│   ├── 03-audit.md
│   ├── 04-users.md
│   ├── 05-keys.md
│   ├── 06-settings.md
│   ├── 07-admin-keys.md
│   └── 08-weekend-requests.md
├── dean/          — Dean, formerly labelled "HOD" (6 files)
│   ├── 01-dashboard.md
│   ├── 02-keys.md
│   ├── 03-slot-management.md
│   ├── 04-weekend-requests.md
│   ├── 05-onboarding.md
│   └── 06-settings.md
├── verifier/      — Security personnel at the desk (5 files)
│   ├── 01-dashboard.md
│   ├── 02-issue-key.md
│   ├── 03-receive-key.md
│   ├── 04-shift-handover.md
│   └── 05-incidents.md
└── requester/     — University staff requesting keys (7 files)
    ├── 01-dashboard.md
    ├── 02-request-key.md
    ├── 03-code-display.md
    ├── 04-weekend-request.md
    ├── 05-return-code.md
    ├── 06-history.md
    └── 07-settings.md
```

34 prompt files total.

## Terminology (read this before editing anything)

- **Role name**: **Dean**, not "HOD" — the app renamed the role. Internal identifiers (`hod_decisions`, `HOD_APPROVED` audit events) keep the old name for historical continuity, but nothing user-facing should ever say "HOD".
- **Routes**: `/dean/*`, not `/hod/*`.
- **Grouping term**: **Unit**, not "Department" or "Faculty" — the app renamed `departments` to `units`; the UI label is always "Unit".

## Usage

1. **One-time setup**: in your Stitch project, load `DESIGN.md` as project context. (Stitch reads it natively as persistent design context.)
2. **Per screen**: open the prompt file for the screen you want to generate. Copy everything below the dashed line. Paste into Stitch as a single prompt. Generate.
3. **Iterate**: refine the prompt or the placeholder data inline if the first generation isn't right. The structure is intentionally readable — change a number, swap a label, regenerate.
4. **Export to Figma**: once you're happy with a generated screen, use Stitch's own "Export to Figma" action (in the Stitch UI) to send it to your Figma account. This is a manual, per-screen step Stitch handles itself — nothing in these prompt files needs to change for it.

## Generation order (suggested)

To build a coherent design pass quickly, generate in roughly this order:

1. **Public** (landing, login, activation, forgot/reset-password, help) — establishes the brand surface and the entry-point patterns.
2. **Verifier dashboard + issue-key + receive-key** — the highest-stakes screens; nailing these locks down the operational visual language.
3. **Requester dashboard + code display + request sheet + return-code** — the second most-used screens; mobile-first reference.
4. **Dean dashboard + keys + slot management + weekend reviews** — establishes the approval surfaces.
5. **CSO dashboard + admin-keys + reports + audit log + weekend-requests** — admin surfaces; build last, they reuse patterns from earlier screens.
6. **Settings screens** — generic patterns; build at the end.
7. **Dean onboarding** — last; depends on the established uploader patterns.
8. **Guest weekend-access request + status** — largely self-contained (no auth chrome); can be built any time after the public entry-point patterns are established.

## Editing the prompts

Every prompt file is plain Markdown. Things you'll commonly change:

- **Placeholder data**: names, key codes, times. Replace with anything realistic; don't worry about consistency across files unless you need it.
- **The imperative prompt at the bottom**: tighten it, expand it, ask for additional states. The format is conversational; Stitch handles natural language.
- **Which sections to include**: every prompt is built from chunks (Project Context, Role IA, Flows, Specs, AI surfaces, Notifications, Responsive) drawn from `_shared-blocks.md`. If you want a leaner generation, delete the sections you don't need.

## Keeping this in sync (read before the next terminology change)

If a route, role name, or shared flow changes again: edit `_shared-blocks.md` **first**, then grep the `Used by:` line under the changed block to find every file that needs the new text pasted in. This is the whole reason `_shared-blocks.md` exists — the HOD→Dean and Department→Unit renames each required an undocumented, file-by-file archaeology dig through all 27 files because there was no single source of truth to check against.

## Updating the design system

If the design system changes, update `DESIGN.md` directly and re-validate:

```
bunx @google/design.md lint DESIGN.md
```

Token changes do not need prompt-file updates — they reference DESIGN.md by name and Stitch picks up new tokens automatically. Structural changes (routes, screens, flows) do need the propagation described above.
