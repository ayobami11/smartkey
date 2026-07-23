# HOD Dashboard Home

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/hod` — HOD dashboard home** screen.

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

## Flow: HOD authorises a collector

1. On `/hod`, tap a key tile in the grid → opens slot management for that key.
2. Tap a vacant slot (max 3) → search staff by name or email; select.
3. Confirm authorisation; the staff member is now whitelisted for that key.

## Flow: HOD reviews weekend access request

1. On `/hod`, the weekend-requests panel shows pending items with badge count in nav.
2. Tap a request → detail sheet shows requester, key, date, description.
3. Choose Approve or Decline (with optional note). Approval auto-expires after 24 hours.

## Screen spec: HOD dashboard home

**Layout**: two stacked sections on phone, two columns on desktop. Top: weekend requests requiring action (collapsible, badge with count). Bottom: department key grid showing each key with its three slots filled or vacant.

**Required surfaces:**

- **Pending requests panel**: list of weekend requests with requester, key, date, time. Accept/decline or open detail.
- **Key grid**: KeyTile per key. Each tile shows three slot indicators (filled/vacant). Tap → slot management.
- **Filter**: segmented control: "All keys" / "Has vacant slot" / "Recently used".
- **Onboarding nudge**: if signature or stamp not yet uploaded, persistent banner at top until complete; blocks weekend approvals until done.

## Notifications and realtime behaviour

- Persistent banners are for state that affects what the user can do (offline, onboarding incomplete, shift not handed over).
- Toasts are for transient confirmations only (3-second auto-dismiss). Never show critical information solely via toast.
- Realtime updates: small dot in app bar (green/amber/red) shows connection state.
- Notification centre: top-right bell icon with badge count.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the HOD dashboard home (`/hod`) using the spec above.

**Placeholder data**:

- HOD name "Prof. Okonkwo, Faculty of Engineering"
- Pending weekend requests (2 items): Dr. Bakare requesting NS-304 for Sat 3 May, "Lab equipment maintenance"; Mrs. Adeleke requesting OS-12 for Sun 4 May, "Departmental retreat preparation".
- Department key grid (6 keys): NS-304 (3 slots filled), NS-305 (2 of 3 filled, 1 vacant), NS-306 (3 filled), OS-11 (1 of 3, 2 vacant), OS-12 (3 filled), OS-13 (0 of 3, all vacant — show this prominently).

**Onboarding nudge state**: also generate a variant where the HOD has not yet uploaded their signature — top of page shows a persistent maroon-soft banner: "Upload your signature and stamp to enable weekend approvals." with a primary "Set up now" button → `/hod/onboarding`. While this banner shows, the weekend requests panel is greyed out with a caption "Available after signature setup."

Generate at 1440px (desktop, two-column) and 390px (mobile, stacked). Both with and without the onboarding nudge.
