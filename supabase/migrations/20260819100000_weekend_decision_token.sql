-- One-click Approve/Decline in the weekend-request submitted email

alter table public.requests
  add column if not exists decision_token uuid;

create unique index if not exists idx_requests_decision_token
  on public.requests (decision_token)
  where decision_token is not null;
