# HOD Signature & Stamp Onboarding

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/hod/onboarding` — One-time signature and stamp upload** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## HOD area routes

- `/hod` — Dashboard home: department key grid, weekend requests requiring action
- `/hod/keys/:keyId` — Manage authorised collectors (max 3) for one key
- `/hod/weekend-requests` — Review and decide weekend access requests
- `/hod/onboarding` — One-time signature and stamp upload (forced on first login)
- `/hod/profile` — Profile, theme, notifications

## AI surface: Signature verification

- **On match**: no UI surface; subtle audit-log entry "Signature verified".
- **On mismatch**: CSO dashboard receives a tampering alert. Detail shows the reference signature, the failed sample, the mismatch percentage, and a link to the underlying request. Approval is held until CSO action.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the HOD onboarding screen (`/hod/onboarding`). This is a forced first-login flow that blocks all other HOD features until complete.

**Layout**: centred max-width 720px card on desktop, full-width on mobile. Stepper at top: "Signature" → "Departmental stamp" → "Confirm".

**Step 1 — Signature**:

- Heading: "Upload your signature"
- Body: "Sign on a clean white sheet of paper, scan or photograph it, and upload the image. We'll process it to compare against future approvals you sign."
- **Uploader**: drag-and-drop zone with dashed border. Supports drag-drop or click-to-browse. Accepts PNG, JPG, max 5MB.
- After upload, a **two-pane preview**:
  - Left: the original uploaded image as the user sees it.
  - Right: the system's processed reference (greyscale, normalised, the actual image used for matching). Caption beneath the right image: "This is what we'll compare future signatures against."
- "Replace" link below the previews to upload a different one.
- Primary "Continue" button (disabled until upload complete).

**Step 2 — Departmental stamp**:
Same pattern as Step 1, but for the stamp.

- Heading: "Upload your departmental stamp"
- Body: "Stamp on white paper, scan or photograph, upload."
- Same uploader and two-pane preview.
- Primary "Continue" button.

**Step 3 — Confirm**:

- Heading "Confirm and finish"
- Side-by-side cards showing both processed references (signature + stamp).
- Below: a confirmation paragraph "These references will be used to verify your future weekend approvals. You can update them later from your profile."
- Required checkbox: "I confirm these are my signature and departmental stamp."
- Primary "Finish setup" button.

**Done state**: success card with "Setup complete. You're ready to use SmartKey." and primary "Continue to dashboard" → `/hod`.

**Error state for upload**: file too large or wrong format — inline error below the uploader using standard error microcopy.

Generate at 1440px (desktop) and 390px (mobile). Show all three steps and the done state.
