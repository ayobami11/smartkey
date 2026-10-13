-- create_request takes the risk result and the weekend letter/stamp.
--
-- POST /api/requests/submit used to call create_request and then back-fill
-- risk_tier/risk_factors and letter_url/stamp_url with two separate
-- service-role UPDATEs, each "best-effort": a failure left a HIGH-risk
-- request stored as LOW, or a weekend request without the letter the Dean's
-- approval is verified against. The REQUEST_CREATED entry never carried the
-- tier at all, although docs/AUDIT_EVENTS.md said it did.
--
-- Four defaulted parameters are added; everything they replace now lands in
-- the same INSERT, and the audit payload carries the tier and factors. The
-- letter/stamp ownership check the route does is repeated here, since the
-- RPC is the real boundary.
--
-- The body is copied from 20261013090000_decision_token_in_create_rpcs.sql;
-- only the new parameters, the ownership check, the insert columns and the
-- audit payload differ. Adding parameters changes the signature, so the old
-- function is dropped explicitly rather than left as an overload.
--
-- Known gap (unchanged from before): a requester calling this RPC directly
-- can choose its own risk tier, just as a direct call previously stored LOW.
-- Making create_request service-only is a follow-up.

drop function if exists public.create_request(uuid, text, timestamptz, date);

create function public.create_request(
  p_key_id          uuid,
  p_type            text,
  p_return_deadline timestamptz,
  p_weekend_date    date default null,
  p_risk_tier       public.risk_tier default 'LOW',
  p_risk_factors    jsonb default null,
  p_letter_url      text default null,
  p_stamp_url       text default null
)
returns table(request_id uuid, code text, code_expires_at timestamptz, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id    uuid;
  v_actor_role      public.user_role;
  v_type_enum       public.request_type;
  v_request_id      uuid;
  v_code            text;
  v_expires_at      timestamptz;
  v_status          public.request_status;
  v_requested_for   date;
  v_expiry_minutes  int;
  v_decision_token  uuid;
  v_own_letter      text;
begin
  v_type_enum := p_type::public.request_type;

  v_requester_id := auth.uid();
  if v_requester_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0001';
  end if;

  select pr.role
  into   v_actor_role
  from   public.profiles pr
  where  pr.id = v_requester_id;

  if v_actor_role <> 'REQUESTER' then
    raise exception 'FORBIDDEN: only REQUESTER role can create requests'
      using errcode = 'P0002';
  end if;

  -- The letter/stamp are what the Dean's approval is verified against, so
  -- they must be objects this requester uploaded: weekend-letters, in their
  -- own folder. Any other URL — e.g. the Dean's own reference in
  -- hod-signatures — would let the check compare a reference against itself.
  -- Mirrors parseStorageUrl + the folder check in POST /api/requests/submit;
  -- re-checked here because the RPC, not the route, is the boundary.
  if (p_letter_url is not null or p_stamp_url is not null)
     and v_type_enum <> 'WEEKEND' then
    raise exception 'VALIDATION: a letter or stamp is only accepted on a WEEKEND request'
      using errcode = 'P0004';
  end if;

  v_own_letter :=
    '^https?://[^/?#]+/(?:[^?#]*/)?storage/v1/object/(?:public/|sign/|authenticated/)?weekend-letters/'
    || v_requester_id::text
    || '/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:[?#].*)?$';

  if (p_letter_url is not null
        and (p_letter_url !~ v_own_letter
             or position('..' in split_part(p_letter_url, '?', 1)) > 0))
     or (p_stamp_url is not null
        and (p_stamp_url !~ v_own_letter
             or position('..' in split_part(p_stamp_url, '?', 1)) > 0)) then
    raise exception 'VALIDATION: letter or stamp is not an upload of this requester'
      using errcode = 'P0004';
  end if;

  if not exists (
    select 1
    from   public.authorisations a
    where  a.key_id    = p_key_id
      and  a.profile_id = v_requester_id
  ) then
    raise exception 'NOT_AUTHORISED: requester is not whitelisted for this key'
      using errcode = 'P0005';
  end if;

  if exists (
    select 1
    from   public.requests r
    where  r.requester_id = v_requester_id
      and  r.key_id       = p_key_id
      and  r.status not in (
             'KEY_RETURNED', 'EXPIRED', 'CANCELLED', 'DECLINED'
           )
  ) then
    raise exception 'CONFLICT: an active request already exists for this key'
      using errcode = 'P0006';
  end if;

  select code_expiry_minutes into v_expiry_minutes
  from   public.operational_config
  where  id = '00000000-0000-0000-0000-000000000002';

  -- Determine status, code, and requested_for date.
  if v_type_enum = 'WEEKDAY' then
    v_status        := 'CODE_ISSUED';
    v_requested_for := current_date;
    v_code          := lpad(floor(random() * 1000000)::int::text, 6, '0');
    v_expires_at    := now() + (coalesce(v_expiry_minutes, 10) || ' minutes')::interval;
  else
    -- WEEKEND: no code now. The requester generates a short-lived code on the
    -- requested day via generate_weekend_code, after the HOD approves.
    v_status        := 'PENDING_HOD';
    v_requested_for := coalesce(p_weekend_date, current_date);
    v_code          := null;
    v_expires_at    := null;

    -- One-click Approve/Decline for the Dean's email. Only Dean-routed units
    -- get one: Administration (authoriser = 'CSO') requests are decided on
    -- the CSO dashboard and never receive a token.
    if exists (
      select 1
      from   public.keys k
      join   public.units u on u.id = k.unit_id
      where  k.id = p_key_id
        and  u.authoriser = 'DEAN'
    ) then
      v_decision_token := gen_random_uuid();
    end if;
  end if;

  insert into public.requests (
    requester_id,
    key_id,
    type,
    requested_for,
    status,
    code,
    code_expires_at,
    return_deadline,
    risk_tier,
    risk_factors,
    letter_url,
    stamp_url,
    decision_token
  ) values (
    v_requester_id,
    p_key_id,
    v_type_enum,
    v_requested_for,
    v_status,
    v_code,
    v_expires_at,
    p_return_deadline,
    coalesce(p_risk_tier, 'LOW'),
    p_risk_factors,
    p_letter_url,
    p_stamp_url,
    v_decision_token
  )
  returning id into v_request_id;

  perform public._write_audit(
    'REQUEST_CREATED',
    v_requester_id,
    v_actor_role,
    'request',
    v_request_id,
    jsonb_build_object(
      'key_id',          p_key_id,
      'type',            p_type,
      'status',          v_status::text,
      'return_deadline', p_return_deadline,
      'risk_tier',       coalesce(p_risk_tier, 'LOW')::text,
      'risk_factors',    coalesce(p_risk_factors, '[]'::jsonb)
    )
  );

  return query
    select v_request_id,
           v_code,
           v_expires_at,
           v_status::text;
end;
$$;

revoke execute on function public.create_request(
  uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text
) from public, anon;
grant execute on function public.create_request(
  uuid, text, timestamptz, date, public.risk_tier, jsonb, text, text
) to authenticated;
