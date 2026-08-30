# SmartKey — How to Trigger AI Validation

SmartKey has three AI components. Each runs server-side only and is triggered by a specific
API call. This document explains exactly what to call, what to send, and what comes back.

---

## 1. Risk Scoring Engine

**Triggered by:** `POST /api/requests/submit`  
**Who calls it:** Requester (authenticated)  
**When it runs:** Automatically on every key request — you cannot skip it.

The risk engine evaluates five rules and assigns a tier (LOW / MEDIUM / HIGH) before the
`create_request` RPC is called. The result is written back to `requests.risk_tier` and
`requests.risk_factors` via the admin client.

### Request body

```json
{
  "key_id": "<uuid>",
  "type": "WEEKDAY",
  "return_deadline": "2026-07-04T17:00:00+01:00"
}
```

For a weekend request, add `weekend_date` and optionally `letter_url`:

```json
{
  "key_id": "<uuid>",
  "type": "WEEKEND",
  "return_deadline": "2026-07-05T17:00:00+01:00",
  "weekend_date": "2026-07-05",
  "letter_url": "weekend-letters/path/to/letter.pdf"
}
```

### Response (weekday)

```json
{
  "data": {
    "request_id": "<uuid>",
    "code": "123456",
    "code_expires_at": "<iso>",
    "risk_tier": "LOW"
  },
  "error": null,
  "status": 201
}
```

### What the engine checks

| Rule                           | Weight | Triggers when                                     |
| ------------------------------ | ------ | ------------------------------------------------- |
| `outside_operational_hours`    | 3      | Request submitted outside zone operating hours    |
| `outstanding_key_not_returned` | 5      | Requester holds a key they are not authorised for |
| `weekend_without_memo`         | 4      | Weekend request with no authoriser-approved memo  |
| `excess_request_frequency`     | 2      | More than 5 requests in the last 24 hours         |
| `collector_not_whitelisted`    | 5      | Requester not in the key's authorisation slots    |

Tier thresholds (configurable via CSO settings):

- **LOW** — total weight ≤ 3
- **MEDIUM** — total weight ≤ 6
- **HIGH** — total weight > 6

The `risk_tier` and `risk_factors` are stored on the `requests` row and surfaced to the
verifier via `RiskTierBadge`. HIGH-tier requests require an explicit acknowledgement before
the verifier can issue the key.

---

## 2. Signature Verification (Sharp + Pixelmatch)

**Triggered by:** `POST /api/requests/hod-decision`  
**Who calls it:** Dean (role: DEAN) or CSO  
**When it runs:** When `submitted_signature_url` and/or `submitted_stamp_url` is present in
the request body — the two checks are independent; either, both, or neither may run depending
on what the requester uploaded.

### Request body that triggers verification

```json
{
  "request_id": "<uuid>",
  "decision": "APPROVED",
  "submitted_signature_url": "<url-to-signed-letter-in-weekend-letters-bucket>",
  "submitted_stamp_url": "<url-to-signed-stamp-image-in-weekend-letters-bucket>"
}
```

`submitted_signature_url` must be a reachable URL to the signature region extracted from the
Dean's authorisation letter; `submitted_stamp_url` is a close-up of the departmental stamp,
uploaded optionally alongside it. The Dean's onboarded references
(`profiles.signature_ref_url` / `profiles.stamp_ref_url`) are fetched server-side
automatically for whichever check(s) run.

### Paths that skip verification

| Condition                                                           | Why skipped                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Neither `submitted_signature_url` nor `submitted_stamp_url` present | No letter/stamp was attached to the request                               |
| Actor is CSO                                                        | CSO has no reference signature or stamp on file                           |
| Request has a `guest_id`                                            | Guest path uses `approve_guest_weekend`; Dean reviews the letter manually |

### Server-side sequence

1. For each present URL, fetch the matching reference (`signature_ref_url` or
   `stamp_ref_url`) and the submitted image in parallel.
2. Call `verifySignature(refBuffer, subBuffer)` independently per check — Sharp preprocessing
   (greyscale, binary threshold, `trim()` to the ink bounding box, resize to 800×400) then
   Pixelmatch pixel-by-pixel diff scored over the ink region.
3. Each call returns `{ mismatch_ratio: number, passed: boolean }`.

### Outcome: every submitted check passed (`mismatch_ratio ≤ 0.55`)

`approve_weekend` RPC is called with `signature_verified: true` and the signature check's
`mismatch_pct` (a stamp mismatch figure, if any, lives only in the audit entry on a hold —
the RPC param stays signature-specific).

```json
{
  "data": { "request_id": "<uuid>", "status": "APPROVED" },
  "error": null,
  "status": 200
}
```

### Outcome: either check failed (`mismatch_ratio > 0.55`)

The RPC is **not called**. A `SIGNATURE_MISMATCH` audit entry is written with a nested
payload covering whichever check(s) failed —
`{ signature: {ref_url, submitted_url, mismatch_pct} | null, stamp: {...} | null, threshold_pct }`.
The CSO sees this in the signature-alerts feed (`GET /api/ai/signature-alerts`).

```json
{
  "data": {
    "request_id": "<uuid>",
    "status": "HELD_SIGNATURE_MISMATCH",
    "mismatches": { "signature": 62.0 },
    "message": "Approval held: signature mismatch detected. The CSO has been notified."
  },
  "error": null,
  "status": 200
}
```

### CSO override (resolving a held mismatch)

```json
{
  "request_id": "<uuid>",
  "decision": "APPROVED",
  "cso_override": true
}
```

The RPC re-validates that a `SIGNATURE_MISMATCH` audit entry already exists for this
request before honouring the override. A CSO cannot use `cso_override` on an arbitrary
request — only one that was previously held.

### Threshold

Default: `0.55` (55% of ink-region pixels differ — see `docs/AI.md` §3 for why this is scored
over the ink bounding box rather than the whole canvas, and why the old `0.15` value was
mathematically unreachable and passed every input including forgeries). Configurable via the
`SIGNATURE_DIFF_THRESHOLD` environment variable (a decimal between 0 and 1).

---

## 3. Gemini Shift Reports

**Triggered by:** `POST /api/reports/generate`  
**Who calls it:** CSO (authenticated)  
**When it runs:** On demand — the CSO initiates it from `/cso/reports`.

### Request body

```json
{ "shift_id": "<uuid>" }
```

### What happens

1. The `generate_shift_report` RPC creates an immutable `shift_reports` placeholder row and
   writes an audit entry. If a report already exists for this shift, the RPC returns a 409.
2. The route fetches all `audit_log` events from the shift's `started_at` timestamp.
3. Those events are passed to `generateShiftReport(shiftId, events)` in
   `src/lib/ai/reports/client.ts`, which calls Gemini (`gemini-3.5-flash`) with a structured
   prompt.
4. If Gemini is unavailable or the API key is missing, a deterministic template report is
   produced instead — generation always succeeds.
5. The `{ markdown, timeline, metadata }` result is persisted to the `shift_reports` row via
   the admin client (RLS blocks direct UPDATE for authenticated users).

### Response

```json
{
  "data": { "report_id": "<uuid>", "generated_at": "<iso>" },
  "error": null,
  "status": 201
}
```

The report renders at `/cso/reports/[id]` with the `ShiftTimeline` component and an
"Generated by AI from shift event data" disclosure. CSO comments are added via
`POST /api/reports/[id]/comments` and are immutable after insert.

### Error: report already exists

```json
{
  "data": null,
  "error": "Report already generated for this shift",
  "status": 409
}
```

---

## Summary table

| Component              | Route                             | Trigger                                                                    | Who         |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------- | ----------- |
| Risk scoring           | `POST /api/requests/submit`       | Every key request — automatic                                              | REQUESTER   |
| Signature verification | `POST /api/requests/hod-decision` | When `submitted_signature_url` and/or `submitted_stamp_url` is in the body | DEAN or CSO |
| Gemini shift report    | `POST /api/reports/generate`      | On-demand by the CSO                                                       | CSO         |

All three components run server-side only. No AI key or model is ever exposed to the browser.
