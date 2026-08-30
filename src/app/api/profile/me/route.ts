import { NextRequest, NextResponse } from 'next/server';

import { toProxyUrl } from '@/lib/storage/object-url';
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
      'id, full_name, institutional_email, role, status, photo_url, signature_ref_url, stamp_ref_url, unit_id, unit:units!unit_id(id, name)'
    )
    .eq('id', user.id)
    .single();

  if (error || !profile)
    return NextResponse.json(err('Profile not found', 404), { status: 404 });

  // Storage buckets are private; hand the client proxy URLs it can actually
  // render rather than the raw object URLs stored on the row.
  return NextResponse.json(
    ok({
      profile: {
        ...profile,
        photo_url: toProxyUrl(profile.photo_url),
        signature_ref_url: toProxyUrl(profile.signature_ref_url),
        stamp_ref_url: toProxyUrl(profile.stamp_ref_url),
      },
    }),
    { status: 200 }
  );
};

// Updates the authenticated user's own profile. Only full_name is mutable here;
// email is managed by Supabase Auth and photo by POST /api/profile/photo.
export const PATCH = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(err('Invalid JSON', 422), { status: 422 });
  }

  const full_name =
    body && typeof body === 'object' && 'full_name' in body
      ? (body as { full_name: unknown }).full_name
      : undefined;

  if (typeof full_name !== 'string' || full_name.trim() === '')
    return NextResponse.json(err('full_name is required', 422), {
      status: 422,
    });

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: full_name.trim() })
    .eq('id', user.id);

  if (error)
    return NextResponse.json(err('Failed to update profile', 500), {
      status: 500,
    });

  return NextResponse.json(ok({ full_name: full_name.trim() }), {
    status: 200,
  });
};
