import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import type { Database } from '@/types/database';

type RequestStatus = Database['public']['Enums']['request_status'];

// The caller's own request history, newest first, cursor-paginated on
// created_at.
export const GET = route({
  name: 'requests/my',
  auth: 'user',
  roles: ['REQUESTER'],
  handler: async ({ supabase, user, request }) => {
    const { searchParams } = request.nextUrl;
    const statusParam = searchParams.get('status');
    const statusFilter = statusParam
      ? (statusParam.split(',') as RequestStatus[])
      : undefined;
    const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
    const cursor = searchParams.get('cursor');

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

    if (cursor) {
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
      query = query.lt('created_at', decodedCursor);
    }

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
