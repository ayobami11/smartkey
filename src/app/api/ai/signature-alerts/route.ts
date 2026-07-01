import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

type MismatchPayload = {
  ref_url?: string;
  submitted_url?: string;
  mismatch_pct?: number;
  threshold_pct?: number;
};

export const GET = async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  // A request only ever gets a SIGNATURE_MISMATCH entry via the Dean approval
  // path in POST /api/requests/hod-decision, which holds the request (never
  // calls approve_weekend) — so it stays PENDING_HOD until the CSO resolves it
  // via the override RPC path. Once resolved, it naturally drops off here.
  const { data: auditRows, error: auditError } = await supabase
    .from('audit_log')
    .select('target_id, payload, occurred_at')
    .eq('event', 'SIGNATURE_MISMATCH')
    .eq('target_type', 'request')
    .order('occurred_at', { ascending: false })
    .limit(200);

  if (auditError) {
    return NextResponse.json(err('Failed to fetch signature alerts', 500), {
      status: 500,
    });
  }

  // Keep only the most recent mismatch per request (rows are already ordered
  // most-recent-first).
  const latestByRequest = new Map<
    string,
    { payload: MismatchPayload; occurred_at: string }
  >();
  for (const row of auditRows ?? []) {
    if (!latestByRequest.has(row.target_id)) {
      latestByRequest.set(row.target_id, {
        payload: (row.payload ?? {}) as MismatchPayload,
        occurred_at: row.occurred_at,
      });
    }
  }

  const requestIds = [...latestByRequest.keys()];
  if (requestIds.length === 0) {
    return NextResponse.json(ok({ alerts: [] }), { status: 200 });
  }

  const { data: requests, error: requestsError } = await supabase
    .from('requests')
    .select(
      `id, requested_for,
       requester:profiles!requester_id(id, full_name, institutional_email),
       key:keys!key_id(id, code, room_name, zone)`
    )
    .in('id', requestIds)
    .eq('status', 'PENDING_HOD');

  if (requestsError) {
    return NextResponse.json(err('Failed to fetch signature alerts', 500), {
      status: 500,
    });
  }

  const alerts = (requests ?? [])
    .map((request) => {
      const mismatch = latestByRequest.get(request.id);
      if (!mismatch) return null;
      return {
        ...request,
        occurred_at: mismatch.occurred_at,
        ref_url: mismatch.payload.ref_url ?? null,
        submitted_url: mismatch.payload.submitted_url ?? null,
        mismatch_pct: mismatch.payload.mismatch_pct ?? null,
        threshold_pct: mismatch.payload.threshold_pct ?? null,
      };
    })
    .filter((alert): alert is NonNullable<typeof alert> => alert !== null)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  return NextResponse.json(ok({ alerts }), { status: 200 });
};
