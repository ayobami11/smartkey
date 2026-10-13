import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { createAdminClient } from '@/lib/supabase/admin';

// Returns a short-lived signed URL for a request's authorisation letter or
// stamp, so the authoriser can preview it before deciding. The file lives in
// the private `weekend-letters` bucket; signing happens server-side with the
// admin client.

const SIGNED_URL_TTL_SECONDS = 300;

// Any string: a malformed id simply finds no request and 404s below with the
// same "Letter/Stamp not found" copy as an unknown one.
const paramsSchema = z.object({ id: z.string() });

export const GET = route({
  name: 'requests/letter',
  auth: 'user',
  roles: ['DEAN', 'CSO'],
  params: paramsSchema,
  handler: async ({ supabase, profile, params, request }) => {
    const type =
      request.nextUrl.searchParams.get('type') === 'stamp' ? 'stamp' : 'letter';
    const column = type === 'stamp' ? 'stamp_url' : 'letter_url';

    // RLS exposes the request to a Dean; the CSO reads with the admin client
    // because its RLS policy doesn't cover every request type.
    const { data: req } = await (
      profile.role === 'CSO' ? createAdminClient() : supabase
    )
      .from('requests')
      .select('letter_url, stamp_url, requested_unit_id')
      .eq('id', params.id)
      .maybeSingle();

    const fileUrl = req?.[column] ?? null;
    if (!req || !fileUrl) {
      return respond.fail(
        404,
        type === 'stamp' ? 'Stamp not found' : 'Letter not found'
      );
    }

    // A Dean sees only their own faculty's guest requests.
    if (
      profile.role === 'DEAN' &&
      req.requested_unit_id &&
      req.requested_unit_id !== profile.unit_id
    ) {
      return respond.fail(403, 'Forbidden');
    }

    // letter_url/stamp_url are stored as full Supabase Storage URLs; extract
    // the bucket-relative path that createSignedUrl expects.
    const bucketMarker = '/weekend-letters/';
    const markerIdx = fileUrl.indexOf(bucketMarker);
    if (markerIdx === -1) {
      return respond.internal('requests/letter: malformed url', {
        type,
        url: fileUrl,
      });
    }
    const storagePath = fileUrl.slice(markerIdx + bucketMarker.length);

    const { data: signed, error: signError } = await createAdminClient()
      .storage.from('weekend-letters')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      return respond.internal('requests/letter: sign failed', {
        err: signError?.message,
      });
    }

    return respond.ok({ url: signed.signedUrl });
  },
});
