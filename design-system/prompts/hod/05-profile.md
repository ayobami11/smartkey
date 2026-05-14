# HOD Profile

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/hod/profile` — Profile, signature management, settings** screen.

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

Generate the HOD profile screen (`/hod/profile`).

**Layout**: left nav (sticky desktop, top tabs mobile) with four sections: "Account", "Signature & stamp", "Notifications", "Appearance".

**Section 1 — Account**:

- Photo upload (avatar with initials fallback)
- Name (editable)
- Institutional email (read-only with caption "Managed by CSO")
- Department (read-only)
- Save button.

**Section 2 — Signature & stamp**:
Two cards side-by-side (stack on mobile). Each card shows:

- Heading ("Signature" / "Departmental stamp")
- The current processed reference (greyscale preview)
- Caption: "Last updated [date]"
- "Replace" button — opens the same uploader pattern as onboarding.

Below the cards: a small note "Changes are logged to the audit trail. Pending approvals using your previous reference are not affected."

**Section 3 — Notifications**:
Toggles: "Weekend requests submitted (in-app)", "Weekend requests submitted (email)", "Daily digest of your department's activity (email)".

**Section 4 — Appearance**:
Theme select (System / Light / Dark).
Change password button.
Sign out (destructive button at the bottom).

Use placeholder data: HOD "Prof. Okonkwo", Faculty of Engineering, signature and stamp uploaded 3 months ago. Generate at 1440px (desktop) and 390px (mobile).
