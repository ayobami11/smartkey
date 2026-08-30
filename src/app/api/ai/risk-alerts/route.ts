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
    .select('role, unit_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('requests')
    .select(
      `id, type, status, requested_for, risk_tier, risk_factors, created_at,
       requester:profiles!requester_id(id, full_name, institutional_email),
       key:keys!key_id(id, code, room_name, zone)`
    )
    .eq('risk_tier', 'HIGH')
    .in('status', ['CODE_ISSUED', 'KEY_ISSUED'])
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(err('Failed to fetch risk alerts', 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ alerts: data ?? [] }), { status: 200 });
};
