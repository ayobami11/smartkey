-- Migration: add APPROVED to request_status
--
-- Weekend requests now sit in APPROVED after the HOD approves but before the
-- requester generates a short-lived collection code on the requested day. This
-- keeps the OTP short-lived instead of issuing a code that is valid for the
-- whole week between approval and the weekend date.
--
-- Applied separately from the RPC changes: a new enum value cannot be used in
-- the same transaction that adds it.

alter type public.request_status add value if not exists 'APPROVED';
