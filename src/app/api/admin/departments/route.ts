import { NextResponse } from 'next/server';

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
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const { data, error } = await supabase
    .from('departments')
    .select(
      'id, name, faculty, hod_id, hod:profiles!hod_id(status), keys(status, retired_at)'
    )
    .order('faculty', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json(err('Failed to fetch departments', 500), {
      status: 500,
    });
  }

  const departments = (data ?? []).map(({ hod, hod_id, keys, ...dept }) => ({
    ...dept,
    hod_id,
    // true when an ACTIVE HOD is already assigned — frontend should disable this dept in the HOD role picker
    has_hod:
      hod_id !== null &&
      (hod as { status: string } | null)?.status === 'ACTIVE',
    // true when at least one non-retired key in this department is currently available to borrow
    has_slot_today: (
      keys as { status: string; retired_at: string | null }[]
    ).some((k) => k.status === 'AVAILABLE' && k.retired_at === null),
  }));

  return NextResponse.json(ok({ departments }), { status: 200 });
};
