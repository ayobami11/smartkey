-- requests.guest_id has an FK (requests_guest_id_fkey) with no covering index,
-- flagged by the performance advisor. Every guest-flow lookup and RLS check that
-- joins on guest_id (guest_requesters policies, admin_decision routes) benefits.
CREATE INDEX IF NOT EXISTS idx_requests_guest_id ON public.requests (guest_id);
