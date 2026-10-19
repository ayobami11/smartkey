import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { generateCollectionCode } from '@/lib/requests/lifecycle';

const bodySchema = z.object({
  request_id: z.uuid(),
});

// Mints the on-the-day collection code for one of the caller's APPROVED
// weekend requests. The step, its error copy and the code email live in the
// Request lifecycle module (src/lib/requests/lifecycle.ts), shared with the
// guest route.
export const POST = route({
  name: 'requests/weekend-code',
  auth: 'user',
  roles: ['REQUESTER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const result = await generateCollectionCode(supabase, {
      kind: 'registered',
      requestId: body.request_id,
      requesterId: user.id,
    });
    if (!result.ok) return respond.error(result.error);

    return respond.ok({
      request_id: result.data.request_id,
      code: result.data.code,
      code_expires_at: result.data.code_expires_at,
    });
  },
});
