-- Extends signature-mismatch verification to the Dean's stamp

alter table public.requests
  add column if not exists stamp_url text;

comment on column public.requests.stamp_url is
  'Storage path (weekend-letters bucket) to a Dean stamp image the requester
   uploaded at submit, compared pixel-level against the Dean''s
   stamp_ref_url at approval time. Optional; mirrors letter_url.';
