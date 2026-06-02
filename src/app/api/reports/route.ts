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
  if (profile.role !== 'CSO') return NextResponse.json(err('Forbidden', 403), { status: 403 });

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
       shift:shifts!shift_id(id, shift_number, started_at, ended_at)`,
    )
    .order('generated_at', { ascending: false })
    .limit(limit + 1);

  if (shiftId) query = query.eq('shift_id', shiftId);
  if (from) query = query.gte('generated_at', from);
  if (to) query = query.lte('generated_at', to);
  if (cursor) query = query.lt('generated_at', cursor);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(err('Failed to fetch reports', 500), { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const reports = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && reports.length > 0 ? reports[reports.length - 1].generated_at : null;

  return NextResponse.json(ok({ reports, next_cursor: nextCursor }), { status: 200 });
};
