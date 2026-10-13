import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z
  .object({
    request_id: z.uuid(),
    returner_id: z.uuid().optional(),
    code: z
      .string()
      .regex(/^\d{6}$/, 'Code must be 6 digits')
      .optional(),
    override_reason: z.string().min(3).optional(),
  })
  .refine((data) => Boolean(data.code) || Boolean(data.override_reason), {
    message: 'A return code or an override reason is required',
  });

export const POST = route({
  name: 'keys/return',
  auth: 'user',
  roles: ['VERIFIER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const { request_id, returner_id, code, override_reason } = body;

    // Use the server-verified user.id as the verifier, never a client payload.
    const result = await callRpc(supabase, 'return_key', {
      p_request_id: request_id,
      p_verifier_id: user.id,
      p_code: code ?? undefined,
      p_returner_id: returner_id ?? undefined,
      p_override_reason: override_reason ?? undefined,
    });

    // BAD_RETURN_CODE, EXPIRED_RETURN_CODE and NO_VERIFICATION keep the
    // catalogue defaults, which are this route's original copy.
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        NOT_FOUND: 'Transaction not found',
        NOT_ISSUED: 'Key has already been returned',
      });
    }

    const { returned_at, verified } = result.data;
    return respond.ok({
      request_id: result.data.request_id,
      returned_at,
      verified,
    });
  },
});
