# Verifier Issue-Key Flow

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier` — Issue-key side sheet (three steps)** screen.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Head of Department (HOD)**: faculty member. Mixed device usage. Authorises up to three collectors per departmental key, signs weekend approvals.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (HOD signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

## Verifier area routes

- `/verifier` — Dashboard home: pending requests, outstanding keys, shift state
- `/verifier/issue` — Issue-key flow: enter code, confirm collector, mark issued
- `/verifier/return` — Receive-key flow: select outstanding key, confirm return
- `/verifier/handover` — Shift handover acknowledgement (locked screen until complete)
- `/verifier/incidents` — Log a new incident; review own shift history

## Flow: Verifier issues a key (highest-frequency flow)

1. Verifier enters the 6-digit code presented by the collector.
2. Screen reveals: collector name, photo, requested key, risk tier (factors expandable).
3. Verifier confirms identity match → taps "Issue key". Done. Persistent confirmation with timestamp.

If risk is High: an explicit acknowledgement step is inserted between 2 and 3, requiring the verifier to read the contributing factors before the Issue button enables.

## Screen spec: Issue-key flow (verifier side sheet)

A side sheet that opens from the queue or via the code-entry shortcut. Three logical steps, never more than three taps.

**Step 1 — Code:**

- VerificationCodeInput receives the 6-digit code. Auto-validates as the sixth digit lands.
- Invalid code: input flashes destructive border, error microcopy below: "Code not recognised. Ask the requester to verify, or request a new code."

**Step 2 — Identity match:**

- Reveals: requester name and photo (if available), key code and room, risk tier badge.
- If risk is High, factors are visible (not hidden behind a tooltip), and the Issue button is replaced with an Acknowledgement checkbox + Confirm button.

**Step 3 — Confirm:**

- Single primary "Issue key" button. On tap: brief 300ms confirmation animation, sheet collapses, queue updates, persistent confirmation card appears at the top of the queue: "Issued to [name], 14:32".

## AI surface: Risk scoring engine

- **Treatment**: RiskTierBadge (pill with status colour + icon + tier label "Low" / "Medium" / "High"). At heading-md size — non-trivial.
- **Factor reveal**: a "View factors" link beneath the badge opens a popover listing each contributing rule with its weight in plain English ("Outside operational hours for New Senate (weight 3)").
- **High-risk gating**: explicit acknowledgement step inserted in the issue flow before the verifier can proceed.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the issue-key side sheet at every step of the flow. This is the highest-stakes interaction in the system — speed and clarity matter more than visual richness.

**Sheet behaviour**: slides in from the right on desktop (480px wide), full-screen on mobile.

**Generate the following states**:

**State 1 — Code entry (default)**:
Sheet header "Issue a key" + close (X). VerificationCodeInput (six segmented numeric input boxes, very large — at least 64px tall — using the input pattern that auto-advances and matches code-md typography). Below the input: helper text "Ask the requester for the 6-digit code from their email." That's the entire content. Cancel link at the bottom.

**State 2 — Code valid, identity match (Low risk)**:
Sheet now shows: code at top in code-md monospace, then a card with requester photo (large, 96px), name "Dr. Bakare", department "Faculty of Engineering", requested key "NS-304, Senate Room 304", and a Low-risk badge. Below: primary "Issue key" button (full-width, sticky bottom on mobile), secondary "Cancel" link.

**State 3 — Code valid, identity match (High risk)**:
Same layout as State 2 but the risk badge is High (red-soft surface, dark red text). The factors are visible directly beneath the badge as a list:

- Outside operational hours for New Senate (weight 3)
- Outstanding key not returned (weight 5)
  The "Issue key" button is replaced with: a required acknowledgement checkbox "I have reviewed the contributing factors above." and below it, a primary "Confirm and issue" button (disabled until checkbox is ticked). Above the checkbox, a high-risk-banner component: "High-risk request — review before issuing."

**State 4 — Invalid code error**:
Code input retains the entered digits but shows destructive border. Below: error microcopy "Code not recognised. Ask the requester to verify, or request a new code." A secondary action "Clear and re-enter" link.

**State 5 — Successfully issued**:
Sheet collapses (animate). Generate a snapshot of the resulting state on the verifier dashboard: at the top of the queue, a persistent confirmation card (success-soft surface) "Issued NS-304 to Dr. Bakare at 14:32" with a small "View in audit log" link. The card is dismissible but persists for the whole shift if not dismissed.

Generate at 1440px (desktop) and 390px (mobile) for each state.
