import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  profile_id: z.uuid(),
  type: z.enum(['signature', 'stamp']),
  decision: z.enum(['APPROVED', 'DECLINED']),
  note: z.string().optional(),
});

// Resolves a held signature/stamp reference-replacement mismatch
// (POST /api/profile/signature). Mirrors POST /api/requests/hod-decision's
// cso_override path for weekend-request mismatches: the CSO reviews the
// pending upload against the current reference and either approves it in
// (replacing the reference) or declines it (discarding the pending upload).
export const POST = route({
  name: 'admin/signature-references/resolve',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const result = await callRpc(
      supabase,
      'resolve_pending_signature_reference',
      {
        p_profile_id: body.profile_id,
        p_type: body.type,
        p_decision: body.decision,
        p_note: body.note ?? undefined,
      }
    );

    if (!result.ok) {
      return rpcFail(result.error, {
        FORBIDDEN: 'Only the CSO can resolve a held signature reference',
        NOT_FOUND: 'No pending reference for this profile',
      });
    }

    return respond.ok({
      status: result.data.status,
      new_url: result.data.new_url,
    });
  },
});
