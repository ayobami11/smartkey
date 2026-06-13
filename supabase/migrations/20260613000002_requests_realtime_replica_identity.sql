-- Ensure UPDATE events on requests include the full old row for Realtime subscribers.
-- The table is already in supabase_realtime publication; replica identity defaulted to
-- primary-key-only which means filter-based subscriptions (e.g. status changes) receive
-- no old row data. FULL fixes this.
alter table public.requests replica identity full;
