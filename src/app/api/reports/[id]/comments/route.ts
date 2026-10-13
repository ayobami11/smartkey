import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';

const bodySchema = z.object({
  text: z.string().min(1),
});

export const POST = route({
  name: 'reports/comments',
  auth: 'user',
  roles: ['CSO'],
  // A non-UUID id names no report. Unvalidated, it reached the RPC, whose
  // uuid cast failed and surfaced as a 500.
  params: z.object({ id: z.uuid() }),
  paramsError: { status: 404, message: 'Report not found' },
  body: bodySchema,
  handler: async ({ supabase, params, body }) => {
    const result = await callRpc(supabase, 'add_report_comment', {
      p_report_id: params.id,
      p_text: body.text,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        NOT_FOUND: 'Report not found',
        VALIDATION: 'Comment text cannot be empty',
      });
    }

    const { comment_id, created_at } = result.data;
    return respond.ok({ comment_id, created_at }, 201);
  },
});
