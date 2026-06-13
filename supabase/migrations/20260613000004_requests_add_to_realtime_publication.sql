-- Add requests table to the supabase_realtime publication.
-- The REPLICA IDENTITY FULL migration assumes the table is already published,
-- but no prior migration added it. Without this, Realtime fires nothing after
-- supabase db reset or in CI.
alter publication supabase_realtime add table public.requests;
