import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

// Returns the authenticated user's profile. Used by settings pages to surface
// role-specific fields such as signature_ref_url and stamp_ref_url for HODs.
export const GET = async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, institutional_email, role, status, photo_url, signature_ref_url, stamp_ref_url, department_id, department:departments!department_id(id, name)'
    )
    .eq('id', user.id)
    .single();

  if (error || !profile)
    return NextResponse.json(err('Profile not found', 404), { status: 404 });

  return NextResponse.json(ok({ profile }), { status: 200 });
};
