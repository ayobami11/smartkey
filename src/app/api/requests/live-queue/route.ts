import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
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
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'VERIFIER')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  // Use admin client so the requester profile join is not blocked by RLS.
  // Auth + role check above is still done via the session client.
  const { data: requests, error } = await createAdminClient()
    .from('requests')
    .select(
      `
      id,
      type,
      status,
      requested_for,
      risk_tier,
      risk_factors,
      created_at,
      requester:profiles!requester_id(id, full_name, photo_url),
      key:keys!key_id(id, code, room_name, zone)
    `
    )
    .eq('status', 'CODE_ISSUED')
    .order('created_at', { ascending: true });

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('live-queue query failed', { err: error.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ requests }));
};
