import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  key_id: z.string().uuid(),
  requester_id: z.string().uuid(),
});

export const POST = async (request: NextRequest) => {
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
  if (profile.role !== 'HOD') return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { key_id, requester_id } = parsed.data;

  // Confirm key belongs to HOD's department.
  const { data: key } = await supabase
    .from('keys')
    .select('id, department_id')
    .eq('id', key_id)
    .single();

  if (!key || key.department_id !== profile.department_id) {
    return NextResponse.json(err('Key not in your department', 403), { status: 403 });
  }

  // Check slot count.
  const { count } = await supabase
    .from('authorisations')
    .select('*', { count: 'exact', head: true })
    .eq('key_id', key_id);

  if ((count ?? 0) >= 3) {
    return NextResponse.json(err('Three authorisation slots are already filled', 409), { status: 409 });
  }

  // Check duplicate.
  const { data: existing } = await supabase
    .from('authorisations')
    .select('key_id')
    .eq('key_id', key_id)
    .eq('profile_id', requester_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(err('Requester is already authorised for this key', 409), { status: 409 });
  }

  const { error: insertError } = await supabase.from('authorisations').insert({
    key_id,
    profile_id: requester_id,
    authorised_by: user.id,
  });

  if (insertError) {
    const ref = crypto.randomUUID();
    logger.error('authorisations: insert failed', { err: insertError.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  // Return the slot number for the newly added authorisation.
  const { count: newCount } = await supabase
    .from('authorisations')
    .select('*', { count: 'exact', head: true })
    .eq('key_id', key_id);

  return NextResponse.json(
    ok({ authorisation_id: `${key_id}:${requester_id}`, slot_number: newCount ?? 1 }),
    { status: 201 },
  );
};
