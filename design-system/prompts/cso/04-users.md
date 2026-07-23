# CSO User Management

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/users` — User list and provisioning** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## CSO area routes

- `/cso/dashboard` — Dashboard home (pending decisions, live per-zone key counts, anomaly/signature alerts, trend charts)
- `/cso/admin-keys` — Administration-unit key inventory + collector slot management
- `/cso/audit` — Audit Log and Incidents in one tabbed screen, searchable and filterable
- `/cso/users` — User list, provisioning, editing, revoking access
- `/cso/keys` — Key inventory across both zones; create keys, mark lost/retired
- `/cso/reports` — Generated shift reports (Gemini-produced) list + detail; comment, download PDF
- `/cso/settings` — Operational hours, risk-rule weights, notifications, account
- `/cso/weekend-requests` — Review queue for Administration-unit weekend requests

## Flow: First-time login (any role)

1. User receives provisioning email from CSO with an activation link.
2. User clicks the link → `/activate`; sets a password. Passport-photo upload is required at this step for Requesters only — Verifiers do not upload a photo.
3. System sends a 6-digit email OTP; user enters it (segmented OTP input, 10-minute expiry, "Resend code" with a 60-second cooldown).
4. Privileged roles (CSO, Dean, Verifier) confirm MFA via email OTP on **every** login, not just the first.
5. Deans are routed to `/dean/onboarding` to upload their signature and stamp before any other action.
6. User lands on their role dashboard home.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the users screen (`/cso/users`), including its two dialogs.

**Screen — Users list (`/cso/users`)**: page heading "Users" with a primary "Provision new user" button on the right. A data table (TanStack-style) with: global search, a Role multi-filter (CSO / Dean / Verifier / Requester), a Status multi-filter (Active / Pending activation / Deactivated), and sortable columns: Name, Email, Role (badge), Unit, Status (badge — emerald Active / sky Pending / muted Deactivated), Last sign-in (nulls sort last). Each row has an actions dropdown (kebab menu): "Edit details" (opens EditUserDialog), "Resend invite" (only shown for Pending activation users), "Revoke access" (only shown for non-Deactivated users, opens a confirmation dialog first).

Loading = a table skeleton. Empty row = "No users match the current filters."

**Provision user dialog**: modal titled "Provision new user". Fields: Full name, Institutional email, Role select (Dean / Verifier / Requester — CSO accounts aren't self-provisioned here), and a conditional Unit select shown only for Dean and Requester roles — for Dean, units that already have a Dean assigned are disabled in the list (a unit can only have one Dean). Helper text: "An activation email will be sent to this address. The user has 24 hours to activate before the link expires." Buttons: "Provision user" (primary), "Cancel". Success state: "Account created" with a confirmation that the activation email was sent, plus a "Provision another" option.

**Edit user dialog**: modal titled "Edit user". Full name is editable; institutional email is read-only (it's the login identity and can't change here); a conditional Unit select for Dean/Requester targets follows the same already-has-a-Dean disabling rule as provisioning, except the user's own current unit stays selectable.

Use placeholder data: 12 users spanning all four roles with a mix of statuses, including at least one Pending activation row (to show the Resend invite action) and one Deactivated row. Generate at 1440px (desktop). Mobile is a stacked read-only card list.
