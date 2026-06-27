import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const GET = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, unit_id')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO' && profile.role !== 'VERIFIER') {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const zone = searchParams.get('zone');
  const overdueOnly = searchParams.get('overdue_only') === 'true';

  // Use admin client so the requester profile join is not blocked by RLS.
  // Auth + role check above is still done via the session client.
  let query = createAdminClient()
    .from('requests')
    .select(
      `id, status, issued_at, return_deadline, created_at,
       requester:profiles!requester_id(id, full_name, photo_url),
       key:keys!key_id(id, code, room_name, zone, status, key_count)`,
    )
    .in('status', ['KEY_ISSUED']);

  if (overdueOnly) {
    query = query.lt('return_deadline', new Date().toISOString());
  }

  if (zone) {
    query = query.eq('key:keys!key_id.zone', zone);
  }

  query = query.order('return_deadline', { ascending: true });

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(err('Failed to fetch outstanding keys', 500), { status: 500 });
  }

  // The request row stays KEY_ISSUED while the key is out; the overdue state is
  // derived. The hourly mark_key_overdue job flips the key's own status to
  // OVERDUE, but we also fall back to comparing the return deadline so the badge
  // is correct even before the next cron run. Surface it as KEY_OVERDUE so the
  // verifier/CSO UI can render the overdue treatment.
  const now = Date.now();
  const outstanding = (data ?? []).map((row) => {
    const key = row.key as { status?: string } | null;
    const overdue =
      key?.status === 'OVERDUE' ||
      (row.return_deadline !== null &&
        new Date(row.return_deadline).getTime() < now);
    return { ...row, status: overdue ? 'KEY_OVERDUE' : row.status };
  });

  return NextResponse.json(ok({ outstanding }), { status: 200 });
};
