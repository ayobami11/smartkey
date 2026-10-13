import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { createAdminClient } from '@/lib/supabase/admin';

// Unauthenticated. Returns the safe, public-facing status of a guest weekend
// request, keyed on the unguessable access_token. Only the fields the status
// page needs are returned — no internal ids beyond the request id. Read-only.
export const GET = route({
  name: 'public/weekend-request/status',
  auth: 'public',
  params: z.object({ token: z.uuid() }),
  paramsError: { status: 404, message: 'Request not found' },
  handler: async ({ params }) => {
    const { data, error } = await createAdminClient()
      .from('requests')
      .select(
        `
        id,
        status,
        requested_for,
        return_deadline,
        code,
        code_expires_at,
        return_code,
        return_code_expires_at,
        requested_room,
        keys ( code, room_name ),
        guest_requesters ( full_name )
      `
      )
      .eq('access_token', params.token)
      .maybeSingle();

    if (error) {
      return respond.internal('guest weekend-request status lookup failed', {
        err: error.message,
      });
    }
    if (!data) return respond.fail(404, 'Request not found');

    const isCodeIssued = data.status === 'CODE_ISSUED';
    const isKeyIssued = data.status === 'KEY_ISSUED';

    return respond.ok({
      request_id: data.id,
      status: data.status,
      requested_for: data.requested_for,
      return_deadline: data.return_deadline,
      requested_room: data.requested_room ?? null,
      full_name: data.guest_requesters?.full_name ?? null,
      key: data.keys
        ? { code: data.keys.code, room_name: data.keys.room_name }
        : null,
      code: isCodeIssued ? data.code : null,
      code_expires_at: isCodeIssued ? data.code_expires_at : null,
      return_code: isKeyIssued ? data.return_code : null,
      return_code_expires_at: isKeyIssued ? data.return_code_expires_at : null,
    });
  },
});
