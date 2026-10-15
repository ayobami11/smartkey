import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { parseStorageUrl } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

// Returns a short-lived signed URL for a request's authorisation letter or
// stamp, so the authoriser can preview it before deciding. The file lives in
// the private `weekend-letters` bucket; signing happens server-side with the
// admin client.
//
// Who may read it, checked here rather than left to RLS:
//   - a Dean: only a request governed by their own unit (the key's unit for a
//     registered request, requested_unit_id for a guest, both when set);
//   - the CSO: a request governed by an Administration unit (authoriser CSO),
//     or a Dean-authorised one held on a SIGNATURE_MISMATCH, which the CSO
//     resolves in the Dean's place (the same gate approve_weekend's override
//     applies). Not every request, although the CSO reads with the service
//     role.

const SIGNED_URL_TTL_SECONDS = 300;

// Any string: a malformed id is answered below with the same type-specific
// 404 as an unknown one, which params validation could not do.
const paramsSchema = z.object({ id: z.string() });

const querySchema = z.object({
  type: z.enum(['letter', 'stamp']).default('letter'),
});

type Authoriser = 'DEAN' | 'CSO';

type LetterRow = {
  letter_url: string | null;
  stamp_url: string | null;
  requested_unit_id: string | null;
  key: { unit_id: string; unit: { authoriser: Authoriser } | null } | null;
  requested_unit: { authoriser: Authoriser } | null;
};

const SELECT = `letter_url, stamp_url, requested_unit_id,
  key:keys!requests_key_id_fkey(unit_id, unit:units!keys_unit_id_fkey(authoriser)),
  requested_unit:units!requests_requested_unit_id_fkey(authoriser)`;

export const GET = route({
  name: 'requests/letter',
  auth: 'user',
  roles: ['DEAN', 'CSO'],
  params: paramsSchema,
  query: querySchema,
  handler: async ({ supabase, profile, params, query }) => {
    const { type } = query;
    const column = type === 'stamp' ? 'stamp_url' : 'letter_url';
    const notFound = () =>
      respond.fail(
        404,
        type === 'stamp' ? 'Stamp not found' : 'Letter not found'
      );

    if (!z.uuid().safeParse(params.id).success) return notFound();

    // RLS exposes the request to a Dean; the CSO reads with the admin client
    // because its RLS policy doesn't cover every request type, so the scope
    // check below is what bounds it.
    const isCso = profile.role === 'CSO';
    const admin = createAdminClient();
    const { data, error } = await (isCso ? admin : supabase)
      .from('requests')
      .select(SELECT)
      .eq('id', params.id)
      .maybeSingle();

    if (error) {
      return respond.internal('requests/letter: query failed', {
        err: error.message,
      });
    }
    const req = data as unknown as LetterRow | null;
    if (!req) return notFound();

    if (isCso) {
      // The key's unit governs once a key is assigned; a guest request has
      // only the unit it was routed to.
      const authoriser =
        req.key?.unit?.authoriser ?? req.requested_unit?.authoriser ?? null;
      if (authoriser !== 'CSO') {
        const { data: held, error: auditError } = await admin
          .from('audit_log')
          .select('id')
          .eq('event', 'SIGNATURE_MISMATCH')
          .eq('target_type', 'request')
          .eq('target_id', params.id)
          .limit(1);
        if (auditError) {
          return respond.internal('requests/letter: mismatch lookup failed', {
            err: auditError.message,
          });
        }
        if (!held?.length) return respond.fail(403, 'Forbidden');
      }
    } else {
      const units = [req.key?.unit_id, req.requested_unit_id].filter(
        (u): u is string => !!u
      );
      if (
        !profile.unit_id ||
        units.length === 0 ||
        units.some((u) => u !== profile.unit_id)
      ) {
        return respond.fail(403, 'Forbidden');
      }
    }

    const fileUrl = req[column];
    if (!fileUrl) return notFound();

    // Stored as a canonical Storage URL. Anything that is not a well-formed
    // weekend-letters object is a bad row, not something to sign.
    const ref = parseStorageUrl(fileUrl);
    if (!ref || ref.bucket !== 'weekend-letters') {
      return respond.internal('requests/letter: not a weekend-letters object', {
        type,
        url: fileUrl,
      });
    }

    const { data: signed, error: signError } = await admin.storage
      .from('weekend-letters')
      .createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      return respond.internal('requests/letter: sign failed', {
        err: signError?.message,
      });
    }

    return respond.ok({ url: signed.signedUrl });
  },
});
