import * as z from 'zod';

import { pageLimit, timestamp } from '@/lib/http/query';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';

const querySchema = z.object({
  key_id: z.uuid().optional(),
  requester_id: z.uuid().optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
  limit: pageLimit(50, 100),
  // The created_at of the last row on the previous page.
  cursor: timestamp.optional(),
});

const EMPTY_PAGE = { transactions: [], next_cursor: null };

export const GET = route({
  name: 'keys/history',
  auth: 'user',
  roles: ['CSO', 'DEAN'],
  query: querySchema,
  handler: async ({ supabase, profile, query: params }) => {
    const {
      key_id: keyId,
      requester_id: requesterId,
      from,
      to,
      limit,
      cursor,
    } = params;

    // Dean: resolve the unit's key IDs upfront so we can filter with .in().
    // PostgREST does not support filtering by embedded resource columns directly.
    // The filter is the route's own scope, not left to RLS: a Dean with no
    // unit owns no keys, so they get an empty page rather than an unfiltered
    // query (an empty page, not a 403, so their dashboard still renders).
    let unitKeyIds: string[] | null = null;
    if (profile.role === 'DEAN') {
      if (!profile.unit_id) return respond.ok(EMPTY_PAGE);
      const { data: deptKeys, error: deptErr } = await supabase
        .from('keys')
        .select('id')
        .eq('unit_id', profile.unit_id);
      if (deptErr) {
        return respond.internal('keys/history: unit key lookup failed', {
          err: deptErr.message,
        });
      }
      unitKeyIds = (deptKeys ?? []).map((k) => k.id);
      if (unitKeyIds.length === 0) return respond.ok(EMPTY_PAGE);
    }

    let query = supabase
      .from('requests')
      .select(
        `id, type, status, requested_for, issued_at, returned_at, return_deadline, risk_tier, created_at,
         requester:profiles!requester_id(id, full_name),
         key:keys!key_id(id, code, room_name, zone, unit_id)`
      )
      .in('status', [
        'KEY_ISSUED',
        'KEY_RETURNED',
        'EXPIRED',
        'CANCELLED',
        'DECLINED',
      ])
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (unitKeyIds) query = query.in('key_id', unitKeyIds);
    if (keyId) query = query.eq('key_id', keyId);
    if (requesterId) query = query.eq('requester_id', requesterId);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (cursor) query = query.lt('created_at', cursor);

    const { data, error } = await query;

    if (error) {
      return respond.internal('keys/history: query failed', {
        err: error.message,
      });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const transactions = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && transactions.length > 0
        ? transactions[transactions.length - 1].created_at
        : null;

    return respond.ok({ transactions, next_cursor: nextCursor });
  },
});
