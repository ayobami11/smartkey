import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';

export const GET = route({
  name: 'reports',
  auth: 'user',
  roles: ['CSO'],
  handler: async ({ request, supabase }) => {
    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shift_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50);
    const cursor = searchParams.get('cursor');

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

    if (error) return respond.fail(500, 'Failed to fetch reports');

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
