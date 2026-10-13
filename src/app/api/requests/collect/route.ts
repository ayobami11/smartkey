import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';
import { toProxyUrl } from '@/lib/storage/object-url';

const bodySchema = z.object({
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

// issue_key's capacity guard raises one of these two CONFLICTs when every copy
// of the room's key is already out. They are written as verifier-facing copy,
// so they are passed through — but only on an exact, anchored match. Any other
// CONFLICT detail (e.g. "request is not in CODE_ISSUED state (current: …)")
// names internal state and gets fixed copy instead.
const VERIFIER_FACING_CONFLICTS = [
  /^this key is already issued and has not been returned$/,
  /^all \d+ keys on this bunch are out and none has been returned$/,
];

const conflictMessage = (detail: string) =>
  VERIFIER_FACING_CONFLICTS.some((pattern) => pattern.test(detail))
    ? detail
    : 'This code has already been used.';

export const POST = route({
  name: 'requests/collect',
  auth: 'user',
  roles: ['VERIFIER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const { data: req } = await supabase
      .from('requests')
      .select('id, status, code_expires_at, key_id, requester_id, guest_id')
      .eq('code', body.code)
      .eq('status', 'CODE_ISSUED')
      .single();

    if (!req) return respond.fail(404, 'Code not found or already used');

    if (req.code_expires_at && new Date(req.code_expires_at) < new Date()) {
      return respond.fail(404, 'Code has expired');
    }

    // Server-verified user.id, never a client-supplied value — a verifier must
    // not be able to attribute a collection to someone else's session.
    const result = await callRpc(supabase, 'issue_key', {
      p_request_id: req.id,
      p_verifier_id: user.id,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        CONFLICT: conflictMessage,
      });
    }

    const issued = result.data;

    const { data: keyData } = req.key_id
      ? await supabase
          .from('keys')
          .select('code, room_name, key_count')
          .eq('id', req.key_id)
          .single()
      : { data: null };

    const key = {
      code: keyData?.code ?? null,
      room_name: keyData?.room_name ?? null,
      key_count: keyData?.key_count ?? 1,
    };

    // External (guest) requests have a guest_id and no requester_id. The
    // verifier checks the declared physical ID document at the desk instead of
    // a passport photo. The shape is additive so the verifier UI can branch on
    // `is_guest`.
    if (req.guest_id) {
      const { data: guest } = await supabase
        .from('guest_requesters')
        .select('full_name, id_document_type, id_document_number')
        .eq('id', req.guest_id)
        .single();

      return respond.ok({
        request_id: issued.request_id,
        is_guest: true,
        requester: {
          full_name: guest?.full_name ?? null,
          photo_url: null,
          id_document_type: guest?.id_document_type ?? null,
          id_document_number: guest?.id_document_number ?? null,
        },
        key,
        issued_at: issued.issued_at,
      });
    }

    const { data: requesterProfile } = req.requester_id
      ? await supabase
          .from('profiles')
          .select('full_name, photo_url')
          .eq('id', req.requester_id)
          .single()
      : { data: null };

    return respond.ok({
      request_id: issued.request_id,
      is_guest: false,
      requester: {
        full_name: requesterProfile?.full_name ?? null,
        photo_url: toProxyUrl(requesterProfile?.photo_url),
      },
      key,
      issued_at: issued.issued_at,
    });
  },
});
