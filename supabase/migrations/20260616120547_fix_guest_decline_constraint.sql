-- Migration: allow null key_id on DECLINED guest weekend requests
--
-- The constraint `requests_key_required_after_pending` was written as:
--   key_id is not null or status = 'PENDING_HOD'
--
-- This works for registered-user requests (key_id is set at creation) but
-- breaks for guest requests that are DECLINED before the HOD assigns a key:
-- the status leaves 'PENDING_HOD' while key_id is still NULL.
--
-- Fix: extend the allowed-null window to include 'DECLINED', the only other
-- state a guest request can reach without a key_id.

alter table public.requests
  drop constraint requests_key_required_after_pending;

alter table public.requests
  add constraint requests_key_required_after_pending
  check (key_id is not null or status in ('PENDING_HOD', 'DECLINED'));
