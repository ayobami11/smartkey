# Requester Profile

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/me/profile` — Profile and settings** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## Requester area routes

- `/me` — Dashboard home: authorised keys grid, active request status
- `/me/request/:keyId` — Request a key (weekday or weekend variant)
- `/me/request/:requestId/code` — Active code display with countdown
- `/me/history` — Personal history of past requests
- `/me/profile` — Profile, theme, notifications

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the requester profile page (`/me/profile`).

**Layout**: single column on mobile, two-column with left navigation on desktop. Sections: "Account", "Notifications", "Appearance", "Security".

**Section 1 — Account**:

- Photo (avatar with initials fallback, with optional upload)
- Name (read-only with caption "Managed by your HOD/CSO")
- Institutional email (read-only, with caption "Managed by CSO")
- Department (read-only)

**Section 2 — Notifications**:

- "Code generated for me (in-app)" — toggle, default on
- "Code generated for me (email)" — toggle, default on, read-only with caption "Required — emails carry the code"
- "Key issued at the desk (in-app)" — toggle, default on
- "Return reminders before EOD (in-app + email)" — toggle, default on
- "Weekend request decisions (email)" — toggle, default on

**Section 3 — Appearance**:

- Theme select: System / Light / Dark.

**Section 4 — Security**:

- Last sign-in (read-only timestamp, in code-md monospace)
- Change password button
- Sign out — destructive button at the bottom of the section.

Use placeholder data: requester "Dr. Bakare, Faculty of Engineering", last sign-in this morning. Generate at 390px (mobile, primary) and 1440px (desktop).
