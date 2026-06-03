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
    .select('id, name, hod_id')
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json(err('Failed to fetch departments', 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ departments: data ?? [] }), { status: 200 });
};
