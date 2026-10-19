import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { generateReturnCode } from '@/lib/requests/lifecycle';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Generates a 6-digit return code for one of the caller's own issued keys.
// The step and its error copy live in the Request lifecycle module
// (src/lib/requests/lifecycle.ts), shared with the guest route.
export const POST = route({
  name: 'requests/request-return',
  auth: 'user',
  roles: ['REQUESTER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await generateReturnCode(supabase, {
      kind: 'registered',
      requestId: body.request_id,
      requesterId: user.id,
    });
    if (!result.ok) return respond.error(result.error);

    return respond.ok({
      request_id: result.data.request_id,
      return_code: result.data.return_code,
      return_code_expires_at: result.data.return_code_expires_at,
    });
  },
});
