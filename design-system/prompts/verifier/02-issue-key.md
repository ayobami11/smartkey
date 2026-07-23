# Verifier Issue-Key Flow

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier/dashboard` — Issue-key side sheet (two steps, not three)** screen. The sheet's own two-step structure (code entry → identity/confirm) is simpler than the original three-step description, and now has a guest-specific success variant.

---

## Project Context

SmartKey is a four-role web application replacing the paper-based key management workflow at the University of Lagos Senate Building. The roles are:

- **Chief Security Officer (CSO)**: senior administrator. Desktop-primary. Oversight, reports, audit log, user management.
- **Dean** (system role `DEAN`): faculty member. Mixed device usage. Authorises up to three collectors per unit key, signs weekend approvals. The Administration unit's keys are authorised by the CSO instead — no Dean exists for it.
- **Verifier (security personnel)**: 24/7 desk staff in 8-hour shifts. Shared desktop at the security desk. Issues and receives keys, performs shift handover.
- **Requester (university staff)**: lowest-frequency user. Phone-primary. Requests a key, receives a 6-digit code by email, presents it at the desk.

Three AI components run in the background: rule-based risk scoring (visible to verifiers as Low/Medium/High tier), Gemini-generated shift reports (CSO dashboard), and pixel-level signature verification (Dean-signed approvals). WCAG 2.2 AA conformance is the floor. Use the SmartKey design system from DESIGN.md — do not invent colours, typography, or component styling.

Grouping term: SmartKey organises keys by **Unit** (not "Department" or "Faculty").

## Verifier area routes

- `/verifier/dashboard` — Live request queue and outstanding keys, with the issue-key and return-key flows opening as side sheets from this one screen
- `/verifier/handover` — Shift handover acknowledgement, locked at the start of every shift; also covers the "no prior shift / start a shift" state
- `/verifier/incidents` — Log a new incident; review own shift's incidents

## Flow: Issue a key (highest-frequency flow)

1. Verifier enters the 6-digit code presented by the collector — either via the persistent code-entry shortcut or by tapping a queue row.
2. Screen reveals: requester name and photo (or, for a guest request, the declared ID document type/number instead), the requested key, and a RiskTierBadge with expandable factors.
3. Verifier confirms identity match → taps "Issue key". Persistent confirmation with timestamp; for a guest issue, the confirmation additionally reminds the verifier to check the physical ID document.

If risk is High: an explicit RiskAcknowledgement checkbox is inserted before the Issue button enables.

## AI surface: Risk scoring engine

- **Treatment**: RiskTierBadge — a pill with status colour + shield icon + tier label. Non-trivial size.
- **Factor reveal**: a "View factors" link opens a popover listing each contributing rule with its weight in plain English.
- **High-risk gating**: an explicit RiskAcknowledgement checkbox is inserted before the verifier can proceed.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the issue-key side sheet at every step. This is the highest-stakes interaction in the system — speed and clarity matter more than visual richness. The sheet has **two steps** — code entry, then identity/confirm — not a separate third "confirm" screen; confirmation is part of step 2.

**Sheet behaviour**: slides in from the right on desktop (480px wide), full-screen on mobile.

**State 1 — Code entry (default)**: sheet header "Issue key" + close (X). A large 6-digit segmented code input. Helper text "Ask the requester for the code from their email." Cancel link at the bottom.

**State 2 — Code valid, Low/Medium risk**: a context card at the top showing requester photo (or a generic avatar), name, requested key (code + room), and the RiskTierBadge with its factors popover. Primary "Issue key" button (full-width, sticky bottom on mobile), Cancel link.

**State 3 — Code valid, High risk**: same layout as State 2, but the badge is High-risk (destructive-tinted) and its contributing factors are shown directly beneath it as a visible list — not hidden behind the popover for this tier. The "Issue key" button is replaced by a RiskAcknowledgement checkbox ("I have reviewed the contributing factors above.") plus a "Confirm and issue" button, disabled until the checkbox is ticked. An amber banner above the checkbox reads "High-risk request — review before issuing."

**State 4 — Invalid/expired code**: the code input keeps its entered digits but shows a destructive border; below it, "Code not recognised or expired. Ask the requester to verify, or request a new code."

**State 5a — Issued (registered requester)**: sheet content replaced by a success card — key icon, code/room, key_count shown if the key is part of a bunch, "Issued to [name] at [time]."

**State 5b — Issued (guest)**: same success card, plus an amber note line: "Verify against [ID document type] [number]" — reminding the verifier to check the physical document against what the guest declared at request time, since there's no photo to compare against.

Generate at 1440px (desktop) and 390px (mobile) for each state.
