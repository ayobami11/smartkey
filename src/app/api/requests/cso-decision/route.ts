import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  request_id: z.uuid(),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
});

// CSO intervention on a high-risk request from the cso-queue. DECLINED
// withdraws an uncollected code (CODE_ISSUED → CANCELLED); APPROVED records
// that the CSO reviewed it and lets it stand, with no state change. Either
// way the decision, its note and the audit entry commit together in
// cso_decide_request, and the response carries the request's real status.
export const POST = route({
  name: 'requests/cso-decision',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const result = await callRpc(supabase, 'cso_decide_request', {
      p_request_id: body.request_id,
      p_decision: body.decision,
      p_note: body.note,
    });
    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_FOUND: 'Request not found',
        CONFLICT: byDetail(
          [
            [
              /^only a request with an uncollected code/,
              'Only a request whose code has not been collected yet can be declined.',
            ],
          ],
          'This request is no longer awaiting review.'
        ),
      });
    }
    return respond.ok({
      request_id: result.data.request_id,
      status: result.data.status,
    });
  },
});
