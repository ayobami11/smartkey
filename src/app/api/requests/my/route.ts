import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';
import type { Database } from '@/types/database';

type RequestStatus = Database['public']['Enums']['request_status'];

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
  if (profile.role !== 'REQUESTER') return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const statusFilter = statusParam ? (statusParam.split(',') as RequestStatus[]) : undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 50);
  const cursor = url.searchParams.get('cursor');

  let query = supabase
    .from('requests')
    .select(
      'id, type, status, requested_for, risk_tier, created_at, issued_at, returned_at, key:keys!key_id(id, code, room_name, zone)',
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
    const ref = crypto.randomUUID();
    logger.error('requests/my query failed', { err: error.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  const hasMore = (data?.length ?? 0) > limit;
  const rows = hasMore ? data!.slice(0, limit) : (data ?? []);
  const nextCursor =
    hasMore ? Buffer.from(rows[rows.length - 1].created_at).toString('base64') : null;

  return NextResponse.json(ok({ requests: rows, next_cursor: nextCursor }));
};
