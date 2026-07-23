# Verifier Receive-Key Flow

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier/dashboard` — Receive-key flow (mark a key returned)** screen. **The most significant addition here vs. the original prompt**: a full unverified/override return path, not just the code-confirmation path.

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

## Flow: Receive a returned key

1. From the outstanding-keys list, tap the relevant row → opens the return sheet.
2. Default path: ask the requester for their 6-digit return code (self-generated from the requester's own dashboard, 15-minute expiry) and enter it → "Confirm return".
3. Fallback path: if the requester can't produce a code, a "Requester can't provide a code?" link switches to an override form — a required reason textarea replaces the code input. This records an **unverified** return (`KEY_RETURNED_UNVERIFIED`) and automatically raises a `SUSPICIOUS_ACTIVITY` incident to the CSO.
4. Confirmation persists and the row is removed from outstanding. The unverified path's confirmation additionally discloses, in an amber note: "Returned without a requester code — CSO alerted."

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the receive-key flow — the return sheet, both its verified and unverified paths.

**Entry point**: from the verifier dashboard's outstanding-keys list, the verifier taps the row of the key being returned.

**Context card** (present at the top of the sheet regardless of path): key code (monospace, prominent), room name, "Issued to [name] at [time]", key_count if part of a bunch, and an overdue note if applicable.

**State 1 — Code entry (default path)**: helper text "Ask [requester name] for the 6-digit return code — they generate it from their own dashboard." A 6-digit segmented input. A text link below: "Requester can't provide a code?" — switches to State 2. Primary "Confirm return" button (full-width, sticky bottom on mobile). Secondary "Cancel" link.

**State 2 — Override path** (reached via the link in State 1): the code input is replaced by a warning line — "This is recorded as an unverified return and raised to the CSO for review" — followed by a **required** "Reason for returning without a code" textarea (placeholder example: "Requester lost their phone; a colleague returned the key."). A link "Enter a code instead" switches back to State 1. Primary button is labelled **"Return without code"**, not "Confirm return" — the label itself signals this is the unverified path.

**State 3 — Successfully returned (verified path)**: sheet collapses; key icon, "Key returned," code/room, "Returned by [name] at [time]." Done button.

**State 4 — Successfully returned (unverified/override path)**: same success layout as State 3, plus an amber `role="status"` line: **"Returned without a requester code — CSO alerted."** — this disclosure must be visually distinct (amber, with an icon) from the plain success confirmation, not just extra text in the same colour.

Generate at 1440px (desktop) and 390px (mobile) for each state.
