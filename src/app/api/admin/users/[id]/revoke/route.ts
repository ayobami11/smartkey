import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const PATCH = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

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
  if (profile.role !== 'CSO') return NextResponse.json(err('Forbidden', 403), { status: 403 });

  // Fetch the target profile.
  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fetchError || !target) {
    return NextResponse.json(err('User not found', 404), { status: 404 });
  }

  if (target.status === 'DEACTIVATED') {
    return NextResponse.json(err('User is already deactivated', 409), { status: 409 });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ status: 'DEACTIVATED' })
    .eq('id', id);

  if (updateError) {
    const ref = crypto.randomUUID();
    logger.error('revoke: profile update failed', { id, err: updateError.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  // Invalidate the user's Supabase Auth session by banning them.
  const { error: banError } = await supabase.auth.admin.deleteUser(id);
  if (banError) {
    logger.error('revoke: auth session invalidation failed', { id, err: banError.message });
    // Non-fatal — profile is already deactivated; RLS will block access.
  }

  return NextResponse.json(
    ok({ profile_id: id, status: 'DEACTIVATED' }),
    { status: 200 },
  );
};
