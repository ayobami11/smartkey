# Testing guide: external (guest) weekend key requests

How to verify the external/non-registered weekend-request feature end to end. Two
levels: a **fast DB-only smoke test** (no UI, ~30s) and a **full manual UI walkthrough**
across all four touchpoints. Plus edge cases, security checks, and cleanup.

Everything is already applied to the remote Supabase project `ocpsklbbksuymjdbfpja` and
the code passes `bun run typecheck` and `bun run lint`.

---

## 0. Prerequisites

- Run the app locally: `bun run dev` → http://localhost:3000. `.env.local` must hold the
  live Supabase URL + anon key + **service-role key** (the public guest routes and the
  letter upload run server-side via the admin client).
- Accounts already seeded on the remote project (use your own known passwords):
  | Role | Email | Notes |
  | --- | --- | --- |
  | CSO | `mohammedfirdous682@gmail.com` | audit log, oversight |
  | HOD | `tunwaseayobami11@gmail.com` | department `...0002` — approves guest requests |
  | VERIFIER | `rojes87653@lidugw.com` | issues the key at the desk |
- Seed IDs handy for SQL: HOD dept `10000000-0000-4000-8000-000000000002`, a key in that
  dept `20000000-0000-4000-8000-000000000007`.
- **Key timing rule:** a guest collection code can only be minted **on the requested
  date** (`requested_for = current_date`). The public form only accepts a future Sat/Sun,
  so to exercise the code step today you must SQL-shift `requested_for` to today — see
  §2 step 4.

---

## 1. Fast DB-only smoke test (no UI)

Run this in the Supabase SQL editor (or via MCP `execute_sql`). It drives the whole chain
create → approve+assign-key → mint code → issue → `KEY_ISSUED`, asserts the audit trail,
then cleans up after itself. Green = the backend contract is sound.

```sql
do $$
declare
  v_req uuid; v_tok uuid; v_code text;
begin
  -- 1. guest submits (requested_for = today so the code step is reachable now)
  select request_id, access_token into v_req, v_tok
  from public.create_guest_weekend_request(
    'Smoke Test','smoke@example.com','08000000000','National ID','NID-1',
    '10000000-0000-4000-8000-000000000002', current_date,
    now() + interval '8 hours', 'weekend-letters/smoke.png', 'Lab 102'
  );

  -- 2. HOD approves and assigns a key in their department
  perform public.approve_guest_weekend(
    v_req,
    (select id from public.profiles where role='HOD' limit 1),
    '20000000-0000-4000-8000-000000000007', 'looks good'
  );

  -- 3. guest mints the on-the-day code
  select code into v_code from public.generate_guest_weekend_code(v_tok);

  -- 4. verifier issues the key at the desk
  perform public.issue_key(v_req, (select id from public.profiles where role='VERIFIER' limit 1));

  -- assertions
  assert (select status from public.requests where id=v_req) = 'KEY_ISSUED', 'expected KEY_ISSUED';
  assert (select count(*) from public.audit_log where target_id=v_req) >= 3, 'expected >=3 audit rows';
  -- the two guest-initiated events must record a null actor + "(external)" name
  assert exists (
    select 1 from public.audit_log
    where target_id=v_req and event='REQUEST_CREATED'
      and actor_id is null and actor_name like '%(external)'
  ), 'guest REQUEST_CREATED should have null actor + external name';

  -- cleanup (audit_log delete works here only as the migration superuser)
  delete from public.audit_log where target_id=v_req;
  delete from public.hod_decisions where request_id=v_req;
  delete from public.requests where id=v_req;
  delete from public.guest_requesters where email='smoke@example.com';

  raise notice 'OK: full guest chain passed, code was %', v_code;
end $$;
```

No error raised = pass (the `assert`s throw on failure).

### Verify TOO_EARLY guard (negative case)

```sql
-- create with a FUTURE date, approve, then try to mint a code → must raise TOO_EARLY
select public.create_guest_weekend_request(
  'Early Test','early@example.com',null,'National ID','NID-2',
  '10000000-0000-4000-8000-000000000002', current_date + 5,
  now() + interval '8 hours', 'weekend-letters/early.png', 'Lab 102'
);
-- grab the access_token from the result, approve it, then:
--   select public.generate_guest_weekend_code('<token>');
-- expected: ERROR  TOO_EARLY: a collection code can only be generated on the requested date
-- cleanup: delete the request + guest by email as above
```

---

## 2. Full manual UI walkthrough

### Step 1 — Guest submits (no account)

1. Open an **incognito window** (prove no session is needed) → http://localhost:3000.
2. From the landing page or `/login`, click **"Request weekend access"** → `/weekend-access`.
3. Fill the form: name, email (use one you can open), optional phone, ID document type +
   number, **Requested Room** (enter a room name/number like "Lab 102"), **department**
   (pick the HOD's department), **weekend date** (an upcoming Sat/Sun), and **upload a
   letter** (any small PNG/JPG/PDF ≤ 5 MB).
4. Submit. Expect a **persistent confirmation card** with a status link and a "check your
   email" note, then a redirect to `/weekend-access/<token>` showing **"Awaiting HOD
   authorisation"** (status `PENDING_HOD`). The status email should also arrive.

### Step 2 — HOD assigns a key and approves

1. New normal window → log in as the **HOD** (`tunwaseayobami11@gmail.com`).
2. Go to `/hod/weekend-requests`. The new request appears flagged **"External"** with the
   guest's name, email, ID type + number, the **Requested Room** name/number, and a
   **"View authorisation letter"** button (opens a signed URL in a new tab).
3. Pick a **key** from the department in the key selector — the **Approve** button stays
   disabled until a key is chosen. Approve.
4. Back on the guest's `/weekend-access/<token>` page, refresh (focus or the Refresh
   button): status is now **APPROVED**, showing the assigned key.

### Step 3 — Guest mints the code on the day

- If you set the weekend date to a **future** day, the page shows _"Your code will be
  available on <date>"_ and the generate button is gated. To test now, shift the date to
  today:

  ```sql
  update public.requests
     set requested_for = current_date
   where access_token = '<token-from-the-url>';
  ```

- Refresh the status page → tap **"Generate collection code"**. A 6-digit code shows with
  a **10-minute countdown** (same component behaviour as the registered flow). When the
  countdown hits 0 the page auto-fires the expire endpoint and offers to generate again.

### Step 4 — Verifier issues the key at the desk

1. New window → log in as the **VERIFIER** (`rojes87653@lidugw.com`) → `/verifier`.
2. Enter the 6-digit code the guest is showing.
3. The issue panel reveals an **amber "External requester — verify physical ID"** card
   with the guest's name + declared ID document (no passport photo). Confirm and issue.
4. Guest's status page now reads **"Key issued — return by <deadline>"**.

### Step 5 — CSO confirms the audit trail

1. Log in as **CSO** → `/cso/audit`.
2. You should see `REQUEST_CREATED` and `CODE_ISSUED` attributed to **"<name> (external)"**
   (no linked profile), plus `HOD_APPROVED` (the HOD) and the key-issued event (the
   verifier). This proves guest actions are journaled even though the actor isn't a user.

---

## 3. Edge / error cases worth a click

- **Validation:** submit the form with a missing field, a **non-weekend** date, or a
  letter > 5 MB → inline errors; oversized letter returns `413`.
- **Unknown token:** open `/weekend-access/<random-uuid>` → graceful "not found" state
  (the API returns `404`).
- **Approve without a key:** confirm the HOD Approve button is disabled until a key is
  picked (guests only).
- **Decline path:** decline a guest request as HOD → guest status shows `DECLINED`.
- **Code reuse:** after the verifier issues, the code is cleared — re-entering it fails.

---

## 4. Security checks (must hold)

- **No anon RPC access:** the guest RPCs are revoked from `anon`/`public`. Confirm a
  browser/anon client cannot call them directly:

  ```sql
  -- as the anon role this must fail with "permission denied for function"
  set local role anon;
  select public.create_guest_weekend_request(
    'x','x@x.com',null,'t','n','10000000-0000-4000-8000-000000000002',
    current_date, now(), 'weekend-letters/x.png', 'Lab 102'
  );
  reset role;
  ```

- **Service key stays server-side:** the public routes use `createAdminClient()` inside
  `route.ts` only. Grep the client bundle / `"use client"` files — the service key must
  never appear there.
- **Letter privacy:** `/api/requests/[id]/letter` returns a 5-minute signed URL and is
  gated to the HOD whose department owns the request; another HOD gets `403`.

---

## 5. Cleanup after manual testing

```sql
-- replace with the email you used on the form
delete from public.audit_log
 where target_id in (select id from public.requests where guest_id in
   (select id from public.guest_requesters where email = 'YOUR_TEST_EMAIL'));
delete from public.hod_decisions
 where request_id in (select id from public.requests where guest_id in
   (select id from public.guest_requesters where email = 'YOUR_TEST_EMAIL'));
delete from public.requests
 where guest_id in (select id from public.guest_requesters where email = 'YOUR_TEST_EMAIL');
delete from public.guest_requesters where email = 'YOUR_TEST_EMAIL';
-- optionally remove the uploaded letter from the weekend-letters Storage bucket
```

> Deleting `audit_log` rows only works as the project owner/superuser (e.g. the SQL
> editor / MCP). The app roles cannot — the log is immutable by design.

---

## 6. Automated tests (not yet written)

Per the plan, a Playwright happy-path + error-path with axe-core for `/weekend-access`
is still outstanding, and the Playwright harness (`playwright.config.ts`, `tests/`) is not
scaffolded yet. `bun run test:e2e` will not do anything useful until that's set up. The
risk engine has Vitest coverage; no new pure logic was added that needs a unit test.
