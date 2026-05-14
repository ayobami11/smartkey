# SmartKey — Stitch Prompt Files

Ready-to-paste prompt files for generating each screen of the SmartKey UI in Google Stitch.

## How this works

`DESIGN.md` is loaded once into your Stitch project as persistent context — it carries the full design system (colours, typography, spacing, components). Every Stitch generation is automatically conditioned on it.

These prompt files live separately. Each file is for **one screen**. Open the file, copy everything below the dashed line, paste it into Stitch as a single prompt, and Stitch generates that specific screen.

## Folder structure

```
prompts/
├── public/        — Pre-authentication screens (5 files)
│   ├── 01-landing.md
│   ├── 02-login.md
│   ├── 03-activation.md
│   ├── 04-forgot-password.md
│   └── 05-help.md
├── cso/           — Chief Security Officer (6 files)
│   ├── 01-dashboard.md
│   ├── 02-reports.md
│   ├── 03-audit.md
│   ├── 04-users.md
│   ├── 05-keys.md
│   └── 06-settings.md
├── hod/           — Head of Department (5 files)
│   ├── 01-dashboard.md
│   ├── 02-slot-management.md
│   ├── 03-weekend-requests.md
│   ├── 04-onboarding.md
│   └── 05-profile.md
├── verifier/      — Security personnel at the desk (5 files)
│   ├── 01-dashboard.md
│   ├── 02-issue-key.md
│   ├── 03-receive-key.md
│   ├── 04-shift-handover.md
│   └── 05-incidents.md
└── requester/     — University staff requesting keys (6 files)
    ├── 01-dashboard.md
    ├── 02-request-key.md
    ├── 03-code-display.md
    ├── 04-weekend-request.md
    ├── 05-history.md
    └── 06-profile.md
```

27 prompt files total.

## Usage

1. **One-time setup**: in your Stitch project, load `DESIGN.md` as project context. (Stitch reads it natively as persistent design context.)
2. **Per screen**: open the prompt file for the screen you want to generate. Copy everything below the dashed line. Paste into Stitch as a single prompt. Generate.
3. **Iterate**: refine the prompt or the placeholder data inline if the first generation isn't right. The structure is intentionally readable — change a number, swap a label, regenerate.

## Generation order (suggested)

To build a coherent design pass quickly, generate in roughly this order:

1. **Public** (landing, login, activation, forgot-password, help) — establishes the brand surface and the entry-point patterns.
2. **Verifier dashboard + issue-key** — the highest-stakes screens; nailing these locks down the operational visual language.
3. **Requester dashboard + code display + request sheet** — the second most-used screens; mobile-first reference.
4. **HOD dashboard + slot management + weekend reviews** — establishes the approval surfaces.
5. **CSO dashboard + reports + audit log** — admin surfaces; build last, they reuse patterns from earlier screens.
6. **Profile and settings screens** — generic patterns; build at the end.
7. **Onboarding** (HOD signature/stamp) — last; depends on the established uploader patterns.

## Editing the prompts

Every prompt file is plain Markdown. Things you'll commonly change:

- **Placeholder data**: names, key codes, times. Replace with anything realistic; don't worry about consistency across files unless you need it.
- **The imperative prompt at the bottom**: tighten it, expand it, ask for additional states. The format is conversational; Stitch handles natural language.
- **Which sections to include**: every prompt is built from chunks (Project Context, Role IA, Flows, Specs, AI surfaces, Notifications, Responsive). If you want a leaner generation, delete the sections you don't need.

## Updating the design system

If the design system changes, update `DESIGN.md` directly and re-validate:

```
npx @google/design.md lint DESIGN.md
```

These prompt files do not need to change for design-system updates — they reference DESIGN.md by name and Stitch picks up the new tokens automatically.
