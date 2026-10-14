import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import {
  isValidObjectPath,
  PROXIED_BUCKETS,
  type ProxiedBucket,
} from '@/lib/storage/object-url';
import { objectResponseHeaders } from '@/lib/storage/object-headers';
import { SNIFF_BYTES } from '@/lib/storage/upload-type';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err } from '@/types/api';

type Role = 'CSO' | 'DEAN' | 'VERIFIER' | 'REQUESTER';

// Who may read an object, given the viewer and the object's owning folder.
// Every bucket's paths start with the id of the profile (or request) the
// object belongs to, which is what `ownerId` carries.
const canRead = (
  bucket: ProxiedBucket,
  role: Role,
  viewerId: string,
  ownerId: string
): boolean => {
  const isOwner = viewerId === ownerId;

  switch (bucket) {
    // A Dean's reference signature and stamp. Only the Dean themself and the
    // CSO reviewing a mismatch ever need these.
    case 'hod-signatures':
      return isOwner || role === 'CSO';

    // Collector identity photos. Shown to the verifier at the desk and in the
    // Dean/CSO request queues. Deliberately not readable by a requester other
    // than the one in the photo.
    case 'passport-photos':
      return (
        isOwner || role === 'CSO' || role === 'DEAN' || role === 'VERIFIER'
      );

    // Authorisation letters and submitted stamps. The Dean's unit-scoped
    // access goes through GET /api/requests/[id]/letter, which checks the
    // request's unit; this path only serves the CSO, who reads all units.
    case 'weekend-letters':
      return role === 'CSO';
  }
};

export const GET = async (request: NextRequest) => {
  const bucketParam = request.nextUrl.searchParams.get('bucket');
  const path = request.nextUrl.searchParams.get('path');

  if (
    !bucketParam ||
    !path ||
    !(PROXIED_BUCKETS as readonly string[]).includes(bucketParam) ||
    !isValidObjectPath(path)
  ) {
    return NextResponse.json(err('Invalid object reference', 422), {
      status: 422,
    });
  }
  const bucket = bucketParam as ProxiedBucket;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();
  // A deactivated user's session can outlive the ban by up to the token's
  // lifetime; treat it as no session, as route() does.
  if (!profile || profile.status === 'DEACTIVATED') {
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  }

  const ownerId = path.slice(0, path.indexOf('/'));
  if (!canRead(bucket, profile.role as Role, user.id, ownerId)) {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);

  if (error || !data) {
    // A missing object is routine — a profile with no photo, a reference that
    // was replaced. Only log at error level; the caller gets a plain 404.
    logger.warn('storage proxy: object not found', {
      bucket,
      path,
      err: error?.message,
    });
    return NextResponse.json(err('Not found', 404), { status: 404 });
  }

  const head = new Uint8Array(await data.slice(0, SNIFF_BYTES).arrayBuffer());

  return new NextResponse(data, {
    status: 200,
    headers: objectResponseHeaders(head),
  });
};
