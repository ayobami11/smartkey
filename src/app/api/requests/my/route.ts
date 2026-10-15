import * as z from 'zod';

import { csvEnum, pageLimit, timestamp } from '@/lib/http/query';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { Constants } from '@/types/database';

// The cursor this route issues: base64 of the last row's created_at.
const cursor = z
  .string()
  .transform((s) => Buffer.from(s, 'base64').toString('utf-8'))
  .pipe(timestamp);

const querySchema = z.object({
  status: csvEnum(Constants.public.Enums.request_status).optional(),
  limit: pageLimit(20, 50),
  cursor: cursor.optional(),
});

// The caller's own request history, newest first, cursor-paginated on
// created_at.
export const GET = route({
  name: 'requests/my',
  auth: 'user',
  roles: ['REQUESTER'],
  query: querySchema,
  handler: async ({ supabase, user, query: params }) => {
    const { status: statusFilter, limit, cursor: decodedCursor } = params;

    let query = supabase
      .from('requests')
      .select(
        'id, type, status, requested_for, risk_tier, created_at, issued_at, returned_at, key:keys!key_id(id, code, room_name, zone)'
      )
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (statusFilter?.length) {
      query = query.in('status', statusFilter);
    }

    if (decodedCursor) query = query.lt('created_at', decodedCursor);

    const { data, error } = await query;

    if (error) {
      return respond.internal('requests/my: query failed', {
        err: error.message,
      });
    }

    const all = data ?? [];
    const hasMore = all.length > limit;
    const rows = hasMore ? all.slice(0, limit) : all;
    const nextCursor = hasMore
      ? Buffer.from(rows[rows.length - 1].created_at).toString('base64')
      : null;

    return respond.ok({ requests: rows, next_cursor: nextCursor });
  },
});
