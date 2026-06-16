import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const REQUEST_SELECT = `
  id,
  type,
  status,
  requested_for,
  risk_tier,
  risk_factors,
  created_at,
  requester:profiles!requester_id(id, full_name, photo_url),
  guest:guest_requesters!guest_id(id, full_name),
  key:keys!key_id(id, code, room_name, zone)
`;

export const GET = async (request: NextRequest) => {
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

  const { searchParams } = new URL(request.url);
  const singleId = searchParams.get('id');

  const admin = createAdminClient();

  if (singleId) {
    // Targeted fetch for a single request (used by Realtime INSERT handler to
    // avoid refetching the whole queue on each new item).
    const { data: row, error } = await admin
      .from('requests')
      .select(REQUEST_SELECT)
      .eq('id', singleId)
      .eq('status', 'CODE_ISSUED')
      .maybeSingle();

    if (error) {
      const ref = crypto.randomUUID();
      logger.error('live-queue single fetch failed', {
        err: error.message,
        ref,
      });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }

    return NextResponse.json(ok({ request: row }));
  }

  // Full queue fetch — initial load and fallback.
  const { data: requests, error } = await admin
    .from('requests')
    .select(REQUEST_SELECT)
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
