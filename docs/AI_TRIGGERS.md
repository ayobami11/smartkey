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
| `weekend_without_memo`         | 4      | Weekend request with no HOD-approved memo         |
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
**Who calls it:** Dean (role: HOD) or CSO  
**When it runs:** Only when `submitted_signature_url` is present in the request body.

### Request body that triggers verification

```json
{
  "request_id": "<uuid>",
  "decision": "APPROVED",
  "submitted_signature_url": "<url-to-signed-letter-in-weekend-letters-bucket>"
}
```

The `submitted_signature_url` must be a reachable URL to the signature region extracted from
the Dean's authorisation letter. The Dean's onboarded reference (`profiles.signature_ref_url`)
is fetched server-side automatically.

### Paths that skip verification

| Condition                        | Why skipped                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| `submitted_signature_url` absent | No letter was uploaded with the request                                   |
| Actor is CSO                     | CSO has no reference signature on file                                    |
| Request has a `guest_id`         | Guest path uses `approve_guest_weekend`; Dean reviews the letter manually |

### Server-side sequence

1. Fetch `profile.signature_ref_url` and `submitted_signature_url` in parallel.
2. Call `verifySignature(refBuffer, subBuffer)` — Sharp preprocessing (greyscale, 800×400,
   binary threshold) then Pixelmatch pixel-by-pixel diff.
3. Returns `{ mismatch_ratio: number, passed: boolean }`.

### Outcome: passed (`mismatch_ratio ≤ 0.15`)

`approve_weekend` RPC is called with `signature_verified: true` and the real `mismatch_pct`.

```json
{
  "data": { "request_id": "<uuid>", "status": "APPROVED" },
  "error": null,
  "status": 200
}
```

### Outcome: failed (`mismatch_ratio > 0.15`)

The RPC is **not called**. A `SIGNATURE_MISMATCH` audit entry is written with both image
URLs and the mismatch percentage. The CSO sees this in the signature-alerts feed
(`GET /api/ai/signature-alerts`).

```json
{
  "data": {
    "request_id": "<uuid>",
    "status": "HELD_SIGNATURE_MISMATCH",
    "mismatch_pct": 22.5,
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

Default: `0.15` (15% of pixels differ). Configurable via the `SIGNATURE_DIFF_THRESHOLD`
environment variable (a decimal between 0 and 1).

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

| Component              | Route                             | Trigger                                            | Who         |
| ---------------------- | --------------------------------- | -------------------------------------------------- | ----------- |
| Risk scoring           | `POST /api/requests/submit`       | Every key request — automatic                      | REQUESTER   |
| Signature verification | `POST /api/requests/hod-decision` | Only when `submitted_signature_url` is in the body | DEAN or CSO |
| Gemini shift report    | `POST /api/reports/generate`      | On-demand by the CSO                               | CSO         |

All three components run server-side only. No AI key or model is ever exposed to the browser.
