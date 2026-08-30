import { NextResponse } from 'next/server';

import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const GET = async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, unit_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'VERIFIER' && profile.role !== 'CSO') {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  // Use the admin client so the officer profile joins are not blocked by RLS.
  // Auth + role check above is still done via the session client.
  //
  // The `profiles_select` policy lets a user read only their own row (plus CSO
  // reads all, Dean reads their own unit) — there is no VERIFIER clause. Under
  // the session client PostgREST therefore silently returns `primary_officer:
  // null` whenever the shift belongs to a *different* officer, which is exactly
  // the handover case. That null then crashed /verifier/handover.
  const { data: shift, error } = await createAdminClient()
    .from('shifts')
    .select(
      `id, shift_number, started_at, ended_at,
       primary_officer:profiles!primary_officer_id(id, full_name, photo_url),
       secondary_officer:profiles!secondary_officer_id(id, full_name, photo_url)`
    )
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(err('Failed to fetch current shift', 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok(rewriteStorageUrls({ shift })), { status: 200 });
};
