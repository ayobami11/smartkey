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
    .select('role, department_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'DEAN') {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  // RLS scopes to HOD's department keys automatically
  const { data: requests, error } = await supabase
    .from('requests')
    .select(
      `
      id,
      type,
      status,
      requested_for,
      return_deadline,
      risk_tier,
      risk_factors,
      created_at,
      letter_url,
      requested_room,
      requested_department_id,
      requester:profiles!requester_id(id, full_name, photo_url, institutional_email),
      guest:guest_requesters!guest_id(id, full_name, email, phone, id_document_type, id_document_number),
      key:keys!key_id(id, code, room_name, zone)
    `
    )
    .eq('status', 'PENDING_HOD')
    .order('created_at', { ascending: true });

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('requests/pending query failed', { err: error.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ requests }));
};
