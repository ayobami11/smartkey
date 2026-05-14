# Verifier Receive-Key Flow

> **How to use this file**: copy everything below the dashed line into Stitch as a single prompt. `DESIGN.md` is loaded as Stitch project context, so do not paste it; only paste this file. The output will be the **`/verifier` — Receive-key flow (mark a key returned)** screen.

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

## Flow: Verifier receives a returned key

1. From the outstanding-keys list, tap the relevant row.
2. Confirm key code matches; tap "Mark returned".
3. Confirmation persists; row removed from outstanding list.

## Responsive breakpoints

- xs ≤ 480px (phone)
- sm 481–768px (large phone, small tablet)
- md 769–1024px (tablet, small laptop)
- lg 1025–1440px (standard desktop)
- xl > 1440px (wide desktop)

Generate the screen at xs (mobile) and lg (desktop) at minimum. Touch targets minimum 44×44px.

---

## Generation request

Generate the receive-key flow.

**Entry point**: from the verifier dashboard's outstanding-keys list, the verifier taps the row of the key being returned.

**State 1 — Confirmation sheet**:
Side sheet slides in. Header: "Mark key returned". Content (top-down):

- Key code in code-md monospace (large, prominent): "NS-304"
- Room name: "Senate Room 304"
- Issued to: photo + name "Dr. Bakare", with the time issued.
- Quick verification: "Read the key code aloud back to the collector to confirm match." (helper microcopy in body-sm).
- Primary "Mark returned" button (full-width, sticky bottom on mobile).
- Secondary "Cancel" link.

**State 2 — Mismatch (variant)**:
If the verifier-input key code does not match the row's key code, generate a confirmation dialog: "The key being returned (NS-305) does not match the row you selected (NS-304). Are you returning a different key?" Buttons: "Switch to NS-305" (primary), "Cancel".

**State 3 — Successfully returned**:
Sheet collapses. On the dashboard, the row is removed from outstanding-keys with a 300ms fade. A persistent confirmation card appears at the top of outstanding-keys: "Returned NS-304 by Dr. Bakare at 14:48" with a small "View in audit log" link.

**State 4 — Returned by someone other than the original collector**:
A common case in the manual system, now handled explicitly. If the system's UI surfaces this (e.g., the verifier marks "different person returning"), show a small note before the primary button: "Different person returning? Tap to record." → opens an additional name field. The audit log records both the original collector and the returning person.

Generate at 1440px (desktop) and 390px (mobile) for each state.
