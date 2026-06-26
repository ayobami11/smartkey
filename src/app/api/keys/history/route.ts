import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const GET = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO' && profile.role !== 'DEAN') {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get('key_id');
  const requesterId = searchParams.get('requester_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const cursor = searchParams.get('cursor');

  let query = supabase
    .from('requests')
    .select(
      `id, type, status, requested_for, issued_at, returned_at, return_deadline, risk_tier, created_at,
       requester:profiles!requester_id(id, full_name),
       key:keys!key_id(id, code, room_name, zone, department_id)`,
    )
    .in('status', ['KEY_ISSUED', 'KEY_RETURNED', 'EXPIRED', 'CANCELLED', 'DECLINED'])
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (keyId) query = query.eq('key_id', keyId);
  if (requesterId) query = query.eq('requester_id', requesterId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  if (cursor) query = query.lt('created_at', cursor);

  // HOD sees only their department's keys (RLS handles row-level, but we also
  // filter by department to avoid leaking keys from other departments).
  if (profile.role === 'DEAN' && profile.department_id) {
    query = query.eq('key:keys!key_id.department_id', profile.department_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(err('Failed to fetch key history', 500), { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const transactions = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && transactions.length > 0
      ? transactions[transactions.length - 1].created_at
      : null;

  return NextResponse.json(ok({ transactions, next_cursor: nextCursor }), { status: 200 });
};
