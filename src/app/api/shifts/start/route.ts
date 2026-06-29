import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const POST = async () => {
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
  if (profile.role !== 'VERIFIER')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const admin = createAdminClient();

  // Guard: reject if a shift is already active — the officer should be doing a handover.
  const { data: existing } = await admin
    .from('shifts')
    .select('id')
    .is('ended_at', null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      err('A shift is already active. Complete the handover instead.', 409),
      { status: 409 }
    );
  }

  // Derive the next shift number (wraps 1–3) from the most recent shift.
  const { data: lastShift } = await admin
    .from('shifts')
    .select('shift_number')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNumber = lastShift ? (lastShift.shift_number % 3) + 1 : 1;

  const { data: newShift, error } = await admin
    .from('shifts')
    .insert({
      shift_number: nextNumber,
      started_at: new Date().toISOString(),
      primary_officer_id: user.id,
    })
    .select('id, shift_number, started_at')
    .single();

  if (error || !newShift) {
    const ref = crypto.randomUUID();
    logger.error('shifts/start: insert failed', { err: error?.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ shift: newShift }), { status: 201 });
};
