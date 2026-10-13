import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { decideWeekend, rejectionToHttp } from '@/lib/requests/decide-weekend';

// The letter/stamp to verify and whether the CSO is overriding a held
// approval are derived server-side from the request row — the client does
// not send them. Unknown keys (from a stale bundle) are stripped by zod.
const bodySchema = z.object({
  request_id: z.uuid(),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
  // For external (guest) requests the authoriser assigns the key on approval.
  key_id: z.uuid().optional(),
});

export const POST = route({
  name: 'requests/hod-decision',
  auth: 'user',
  roles: ['DEAN', 'CSO'],
  body: bodySchema,
  handler: async ({ user, body }) => {
    const { request_id, decision, note, key_id } = body;

    const result = await decideWeekend({
      requestId: request_id,
      actorId: user.id,
      decision,
      note,
      keyId: key_id,
    });

    if (result.outcome === 'REJECTED') {
      return respond.error(rejectionToHttp(result.reason, result.ref));
    }

    if (result.outcome === 'HELD') {
      return respond.ok({
        request_id: result.requestId,
        status: 'HELD_SIGNATURE_MISMATCH',
        mismatches: result.mismatches,
        message: 'Approval held: mismatch detected. The CSO has been notified.',
      });
    }

    return respond.ok({ request_id: result.requestId, status: result.outcome });
  },
});
