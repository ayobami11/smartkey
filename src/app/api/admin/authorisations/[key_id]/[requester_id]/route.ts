import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const DELETE = async (
  _request: NextRequest,
  { params }: { params: Promise<{ key_id: string; requester_id: string }> },
) => {
  const { key_id, requester_id } = await params;

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

  // Confirm key belongs to HOD's department.
  const { data: key } = await supabase
    .from('keys')
    .select('id, department_id')
    .eq('id', key_id)
    .single();

  if (!key || key.department_id !== profile.department_id) {
    return NextResponse.json(err('Key not in your department', 403), { status: 403 });
  }

  const { error: deleteError, count } = await supabase
    .from('authorisations')
    .delete({ count: 'exact' })
    .eq('key_id', key_id)
    .eq('profile_id', requester_id);

  if (deleteError) {
    const ref = crypto.randomUUID();
    logger.error('authorisations: delete failed', { err: deleteError.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  if ((count ?? 0) === 0) {
    return NextResponse.json(err('Authorisation not found', 404), { status: 404 });
  }

  return NextResponse.json(ok(null), { status: 204 });
};
