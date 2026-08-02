-- A guest weekend request has no key until the Dean assigns one at approval.
-- The constraint previously allowed a null key_id only in PENDING_HOD/DECLINED,
-- so moving such a request to EXPIRED or CANCELLED violated it. That broke
-- expire_stale_weekend_requests() on every run: one un-expirable guest row
-- aborted the whole batch transaction, so no stale request ever expired.
--
-- EXPIRED and CANCELLED are, like DECLINED, terminal states reachable before a
-- key is ever assigned. Every remaining status (APPROVED, CODE_ISSUED,
-- KEY_ISSUED, KEY_RETURNED) still requires a key.

alter table public.requests
  drop constraint if exists requests_key_required_after_pending;

alter table public.requests
  add constraint requests_key_required_after_pending
  check (
    key_id is not null
    or status in ('PENDING_HOD', 'DECLINED', 'EXPIRED', 'CANCELLED')
  );
