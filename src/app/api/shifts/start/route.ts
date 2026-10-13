import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = route({
  name: 'shifts/start',
  auth: 'user',
  roles: ['VERIFIER'],
  handler: async ({ user }) => {
    const admin = createAdminClient();

    // Guard: reject if a shift is already active — the officer should be doing a handover.
    const { data: existing } = await admin
      .from('shifts')
      .select('id')
      .is('ended_at', null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return respond.fail(
        409,
        'A shift is already active. Complete the handover instead.'
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
      return respond.internal('shifts/start: insert failed', {
        err: error?.message,
      });
    }

    return respond.ok({ shift: newShift }, 201);
  },
});
