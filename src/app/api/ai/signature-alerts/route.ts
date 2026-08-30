import { NextResponse } from 'next/server';

import { toProxyUrl } from '@/lib/storage/object-url';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

type MismatchCheck = {
  ref_url: string;
  submitted_url: string;
  mismatch_pct: number;
};

// Audit payloads record canonical storage URLs. Both buckets they point at
// (`hod-signatures` for the reference, `weekend-letters` for the submitted
// image) are private, so rewrite them to proxy URLs before they reach the
// dialog that renders them as <img src>.
const toRenderableCheck = (check: MismatchCheck | null | undefined) =>
  check
    ? {
        ...check,
        ref_url: toProxyUrl(check.ref_url),
        submitted_url: toProxyUrl(check.submitted_url),
      }
    : null;

type MismatchPayload = {
  signature?: MismatchCheck | null;
  stamp?: MismatchCheck | null;
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
        signature: toRenderableCheck(mismatch.payload.signature),
        stamp: toRenderableCheck(mismatch.payload.stamp),
        threshold_pct: mismatch.payload.threshold_pct ?? null,
      };
    })
    .filter((alert): alert is NonNullable<typeof alert> => alert !== null)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));

  // Held reference-replacement mismatches (POST /api/profile/signature).
  // Represented by row existence rather than audit-log scraping — there is
  // no request.status to key an "unresolved" query off here, unlike the
  // weekend-request alerts above.
  const { data: pendingRefs, error: pendingRefsError } = await supabase
    .from('pending_signature_references')
    .select(
      `profile_id, type, pending_url, current_ref_url, mismatch_pct, threshold_pct, submitted_at,
       profile:profiles!profile_id(full_name)`
    )
    .order('submitted_at', { ascending: false });

  if (pendingRefsError) {
    return NextResponse.json(err('Failed to fetch signature alerts', 500), {
      status: 500,
    });
  }

  const reference_replacements = (pendingRefs ?? []).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return {
      profile_id: row.profile_id,
      type: row.type as 'signature' | 'stamp',
      dean_name: profile?.full_name ?? 'Unknown Dean',
      submitted_at: row.submitted_at,
      mismatch_pct: row.mismatch_pct,
      threshold_pct: row.threshold_pct,
      current_ref_url: toProxyUrl(row.current_ref_url),
      pending_url: toProxyUrl(row.pending_url),
    };
  });

  return NextResponse.json(ok({ alerts, reference_replacements }), {
    status: 200,
  });
};
