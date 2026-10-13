import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
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
    .from('units')
    .select(
      'id, name, faculty, hod_id, authoriser, hod:profiles!hod_id(status)'
    )
    .order('faculty', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json(err('Failed to fetch units', 500), {
      status: 500,
    });
  }

  // Copy-level availability from the shared occupancy rule, so a twelve-copy
  // room with three out still counts as having a slot, and a key reserved by
  // a live code does not. keys.status cannot express either.
  const { data: occupancy, error: occupancyError } =
    await supabase.rpc('get_key_occupancy');

  if (occupancyError) {
    const ref = crypto.randomUUID();
    logger.error('admin/units get_key_occupancy failed', {
      err: occupancyError.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  const unitsWithSlot = new Set(
    (occupancy ?? [])
      .filter((row) => row.available > 0)
      .map((row) => row.unit_id)
  );

  const units = (data ?? []).map(({ hod, hod_id, ...dept }) => ({
    ...dept,
    hod_id,
    // true when an ACTIVE HOD is already assigned — frontend should disable this unit in the HOD role picker
    has_hod:
      hod_id !== null &&
      (hod as { status: string } | null)?.status === 'ACTIVE',
    // true when at least one copy of a non-retired key in this unit is free
    // right now (get_key_occupancy available > 0)
    has_slot_today: unitsWithSlot.has(dept.id),
  }));

  return NextResponse.json(ok({ units }), { status: 200 });
};
