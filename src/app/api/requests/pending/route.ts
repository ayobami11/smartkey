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
    .select('role, unit_id')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'DEAN' && profile.role !== 'CSO')) {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  // RLS scopes to HOD's department keys automatically for DEAN.
  // For CSO, they can read all. We fetch and filter in the endpoint so that both
  // roles only receive the pending requests they are authorised to decide on.
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
      stamp_url,
      requested_room,
      requested_unit_id,
      requester:profiles!requester_id(id, full_name, photo_url, institutional_email),
      guest:guest_requesters!guest_id(id, full_name, email, phone, id_document_type, id_document_number),
      key:keys!key_id(id, code, room_name, zone, department:units!unit_id(id, name, authoriser)),
      requested_department:units!requested_unit_id(id, name, authoriser)
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

  let filteredRequests = requests ?? [];
  if (profile.role === 'DEAN') {
    filteredRequests = filteredRequests.filter((r) => {
      const keyDeptId = r.key?.department?.id;
      const requestedDeptId = r.requested_department?.id;
      return (
        (keyDeptId && keyDeptId === profile.unit_id) ||
        (requestedDeptId && requestedDeptId === profile.unit_id)
      );
    });
  } else if (profile.role === 'CSO') {
    filteredRequests = filteredRequests.filter((r) => {
      const keyAuthoriser = r.key?.department?.authoriser;
      const requestedAuthoriser = r.requested_department?.authoriser;
      return keyAuthoriser === 'CSO' || requestedAuthoriser === 'CSO';
    });
  }

  return NextResponse.json(ok({ requests: filteredRequests }));
};
