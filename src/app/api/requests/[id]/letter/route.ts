import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

// Returns a short-lived signed URL for a guest request's HOD authorisation
// letter, so the HOD can preview it before approving. The letter lives in the
// private `weekend-letters` bucket; signing happens server-side with the admin
// client. Access is gated to the HOD whose department owns the request.

const SIGNED_URL_TTL_SECONDS = 300;

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

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

  // RLS exposes the request to the actor; use RLS for the DEAN and the admin
  // client for the CSO (whose RLS policy doesn't cover all request types).
  const { data: req } = await (
    profile.role === 'CSO' ? createAdminClient() : supabase
  )
    .from('requests')
    .select('letter_url, requested_unit_id')
    .eq('id', id)
    .maybeSingle();

  if (!req || !req.letter_url) {
    return NextResponse.json(err('Letter not found', 404), { status: 404 });
  }

  // DEAN: only their department's requests.
  if (
    profile.role === 'DEAN' &&
    req.requested_unit_id &&
    req.requested_unit_id !== profile.unit_id
  ) {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  // letter_url is stored as a full Supabase Storage public URL; extract the
  // bucket-relative path that createSignedUrl expects.
  const bucketMarker = '/weekend-letters/';
  const markerIdx = req.letter_url.indexOf(bucketMarker);
  if (markerIdx === -1) {
    const ref = crypto.randomUUID();
    logger.error('weekend-letter: malformed letter_url', {
      ref,
      letter_url: req.letter_url,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
  const storagePath = req.letter_url.slice(markerIdx + bucketMarker.length);

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from('weekend-letters')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    const ref = crypto.randomUUID();
    logger.error('weekend-letter sign failed', {
      err: signError?.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ url: signed.signedUrl }));
};
