import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const GET = async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'VERIFIER' && profile.role !== 'CSO') {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  const { data: shift, error } = await supabase
    .from('shifts')
    .select(
      `id, shift_number, started_at, ended_at,
       primary_officer:profiles!primary_officer_id(id, full_name, photo_url),
       secondary_officer:profiles!secondary_officer_id(id, full_name, photo_url)`,
    )
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(err('Failed to fetch current shift', 500), { status: 500 });
  }

  return NextResponse.json(ok({ shift }), { status: 200 });
};
