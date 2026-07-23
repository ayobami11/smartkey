# Dean Signature &amp; Stamp Onboarding

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/dean/onboarding` — One-time signature and stamp upload** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Dean area routes

- `/dean/dashboard` — Dashboard home: pending weekend requests, recent key activity, collectors table (no key grid here — that moved to its own route)
- `/dean/keys` — Unit key inventory grid
- `/dean/keys/:keyId` — Manage authorised collectors (max 3) for one key
- `/dean/weekend-requests` — Review and decide weekend access requests (registered and guest)
- `/dean/onboarding` — One-time signature and stamp upload, forced on first login
- `/dean/settings` — Account, signature & stamp replacement, notifications

## AI surface: Signature verification

- **On match**: no UI surface; a subtle audit-log entry "Signature verified".
- **On mismatch (weekend approval)**: the approval is held for CSO review — the reference signature, the submitted sample, and the mismatch percentage are shown side by side on the CSO dashboard.
- **On mismatch (Dean replacing their own reference later, from Settings)**: the update itself is held for CSO review instead of applying immediately — see `06-settings.md`.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the Dean onboarding screen (`/dean/onboarding`). This is a forced first-login flow that blocks all other Dean features until complete. It's a **3-step wizard with a numbered/checkmark stepper**, plus an implicit 4th "done" state — generate all four.

**Layout**: centred max-width 720px card on desktop, full-width on mobile. Stepper at the top showing 3 steps with the current one highlighted and completed ones checkmarked: "Signature" → "Stamp" → "Confirm".

**Step 1 — Signature**: heading "Upload your signature". Body: "Sign on a clean white sheet of paper, scan or photograph it, and upload the image." A drag/click dropzone (dashed border, cloud-upload icon, "Click to browse," PNG/JPG max 5MB) that swaps to a live preview with a "Replace" button once a file is chosen. Primary "Continue" button, disabled until a file is uploaded.

**Step 2 — Stamp**: identical pattern to Step 1, but for the departmental/unit stamp. Heading "Upload your departmental stamp." Back/Continue buttons.

**Step 3 — Confirm**: heading "Confirm and finish". Side-by-side thumbnail previews of both uploaded images (signature, stamp). Password field + Confirm password field (both with show/hide toggles). A required confirmation checkbox: "I confirm this is my signature and departmental stamp." Back / "Finish setup" buttons — "Finish setup" disabled until the checkbox is ticked and passwords are valid.

**Step 4 — Done**: green check icon, heading "Setup complete," body "You're ready to use SmartKey." Primary "Continue to dashboard" button → `/dean/dashboard`.

Generate at 1440px (desktop) and 390px (mobile). Show all four steps.
