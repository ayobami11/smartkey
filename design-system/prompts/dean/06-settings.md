# Dean Settings

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/dean/settings` — Account, signature &amp; stamp, notifications** screen.

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
- **On mismatch (weekend approval)**: the approval is held for CSO review.
- **On mismatch (Dean replacing their own reference here in Settings)**: the update is **held for CSO review** instead of applying immediately — an amber state shows the mismatch percentage; pending approvals already using the previous reference are unaffected by the hold.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the Dean settings screen (`/dean/settings`).

**Layout**: left navigation (sticky desktop, top tabs mobile) with three sections: "Account", "Signature & stamp", "Notifications".

**Section 1 — Account**: photo upload (avatar with initials fallback, Update/Remove photo with a confirmation dialog on remove), Full name (editable), Institutional email (read-only), **Unit** (read-only, caption "Managed by your CSO. Contact them to update."), "Update profile" button (enabled only once something changed). Below: a separate "Change password" card (current/new/confirm fields, show/hide toggles).

**Section 2 — Signature & stamp**: two side-by-side cards ("Signature" / "Departmental stamp"), each showing the current reference image (or an empty placeholder if none), a "Replace" button that opens a file picker → preview state → "Apply replacement" / "Cancel" buttons. On applying, generate **three possible outcomes**:

- **Success**: green check, "Reference updated successfully."
- **Held**: amber state, "Update held for CSO review." — shows the mismatch percentage and a note that the CSO has been notified via the audit trail.
- **Error**: destructive banner with a generic retry message.

Footer note beneath both cards: "Changes are logged to the audit trail. Pending approvals using your previous reference are not affected."

**Section 3 — Notifications**: three toggles — "Weekend requests submitted (in-app)", "Weekend requests submitted (email)", "Daily digest email".

Use placeholder data: Dean "Prof. Okonkwo", Faculty of Engineering, signature and stamp uploaded 3 months ago. Generate the Account and Signature & stamp sections at all three outcome states (success/held/error) plus the Notifications section. At 1440px (desktop) and 390px (mobile).
