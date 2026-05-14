# CSO User Management

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/cso/users` — User list and provisioning** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## CSO area routes

- `/cso` — Dashboard home (live key counts per zone, anomaly alerts, today's events)
- `/cso/reports` — Generated shift reports (Gemini-produced); download, comment
- `/cso/audit` — Searchable, filterable audit log of every event
- `/cso/users` — User management (provision new accounts, deactivate)
- `/cso/keys` — Key inventory across both zones; create / retire key records
- `/cso/settings` — Operational hours, risk-rule weights, profile, theme

## Flow: First-time login (any role)

1. User receives provisioning email from CSO with activation link.
2. User clicks link → `/activate/:token`; sets password and accepts terms.
3. System sends 6-digit email OTP; user enters it.
4. Privileged roles (CSO, HOD, Verifier) confirm MFA preference (email OTP).
5. HODs are routed to `/hod/onboarding` to upload signature and stamp before any other action.
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

Generate two screens: user list and provision new user.

**Screen 1 — Users list (`/cso/users`)**:
Layout: page heading "Users" with primary "Provision new user" button on the right. Filter chips below: "All", "Active", "Pending activation", "Deactivated", "By role: CSO / HOD / Verifier / Requester". Search input next to chips.

Table with columns: Name, Email (institutional), Role (badge), Department (HODs and Requesters only), Status (badge: green Active / amber Pending / grey Deactivated), Last sign-in, Actions (kebab menu: View, Deactivate, Resend activation).

Sortable column headers. Sticky header on scroll. Use placeholder data: 12 users spanning all four roles, with mix of statuses.

**Empty state**: "No users yet." with primary "Provision first user" button.

**Screen 2 — Provision new user dialog**:
Modal dialog (max-width 480px) titled "Provision new user". Fields:

- Full name
- Institutional email (with format validation @unilag.edu.ng)
- Role select (CSO, HOD, Verifier, Requester)
- Department select (only shown when role is HOD or Requester; populated from existing departments; "Add new" option)

Helper text below: "An activation email will be sent to this address. The user has 24 hours to activate before the link expires."

Buttons: "Provision user" (primary), "Cancel" (secondary).

After successful provisioning: dialog replaced by success state with "Account provisioned. Activation email sent to [email]." and a "Provision another" link plus a "Done" primary button.

Generate at 1440px (desktop). Mobile is read-only via a stacked card list.
