import * as z from 'zod';

import { pageLimit, timestamp } from '@/lib/http/query';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';

const querySchema = z.object({
  shift_id: z.uuid().optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
  limit: pageLimit(20, 50),
  // The generated_at of the last row on the previous page.
  cursor: timestamp.optional(),
});

export const GET = route({
  name: 'reports',
  auth: 'user',
  roles: ['CSO'],
  query: querySchema,
  handler: async ({ supabase, query: params }) => {
    const { shift_id: shiftId, from, to, limit, cursor } = params;

    let query = supabase
      .from('shift_reports')
      .select(
        `id, shift_id, markdown, timeline, metadata, generated_at,
         shift:shifts!shift_id(id, shift_number, started_at, ended_at)`
      )
      .order('generated_at', { ascending: false })
      .limit(limit + 1);

    if (shiftId) query = query.eq('shift_id', shiftId);
    if (from) query = query.gte('generated_at', from);
    if (to) query = query.lte('generated_at', to);
    if (cursor) query = query.lt('generated_at', cursor);

    const { data, error } = await query;

    if (error) {
      return respond.internal('reports: query failed', { err: error.message });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const reports = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && reports.length > 0
        ? reports[reports.length - 1].generated_at
        : null;

    return respond.ok({ reports, next_cursor: nextCursor });
  },
});
