import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const GET = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, unit_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
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

  // Dean: resolve the unit's key IDs upfront so we can filter with .in().
  // PostgREST does not support filtering by embedded resource columns directly.
  let unitKeyIds: string[] | null = null;
  if (profile.role === 'DEAN' && profile.unit_id) {
    const { data: deptKeys, error: deptErr } = await supabase
      .from('keys')
      .select('id')
      .eq('unit_id', profile.unit_id);
    if (deptErr) {
      return NextResponse.json(err('Failed to fetch key history', 500), {
        status: 500,
      });
    }
    unitKeyIds = (deptKeys ?? []).map((k) => k.id);
    if (unitKeyIds.length === 0) {
      return NextResponse.json(ok({ transactions: [], next_cursor: null }), {
        status: 200,
      });
    }
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
    return NextResponse.json(err('Failed to fetch key history', 500), {
      status: 500,
    });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const transactions = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && transactions.length > 0
      ? transactions[transactions.length - 1].created_at
      : null;

  return NextResponse.json(ok({ transactions, next_cursor: nextCursor }), {
    status: 200,
  });
};
