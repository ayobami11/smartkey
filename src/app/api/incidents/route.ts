import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from '@/types/database';

const postBodySchema = z.object({
  type: z.enum([
    'MISSING_KEY',
    'SUSPICIOUS_ACTIVITY',
    'EQUIPMENT_FAULT',
    'PROCEDURAL',
    'OTHER',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  description: z.string().min(1),
  related_key_id: z.string().uuid().optional(),
  related_person_id: z.string().uuid().optional(),
  occurred_at: z.string().min(1),
});

export const GET = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const severity = searchParams.get('severity');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const cursor = searchParams.get('cursor');

  let query = supabase
    .from('incidents')
    .select(
      `id, reference, type, severity, status, description, occurred_at, logged_at,
       logged_by_profile:profiles!logged_by(id, full_name),
       related_key:keys!related_key_id(id, code, room_name),
       related_person:profiles!related_person_id(id, full_name)`
    )
    .order('logged_at', { ascending: false })
    .limit(limit + 1);

  if (type) query = query.eq('type', type as IncidentType);
  if (severity) query = query.eq('severity', severity as IncidentSeverity);
  if (status) query = query.eq('status', status as IncidentStatus);
  if (from) query = query.gte('occurred_at', from);
  if (to) query = query.lte('occurred_at', to);
  if (cursor) query = query.lt('logged_at', cursor);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(err('Failed to fetch incidents', 500), {
      status: 500,
    });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const incidents = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && incidents.length > 0
      ? incidents[incidents.length - 1].logged_at
      : null;

  return NextResponse.json(ok({ incidents, next_cursor: nextCursor }), {
    status: 200,
  });
};

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO' && profile.role !== 'VERIFIER') {
    return NextResponse.json(err('Forbidden', 403), { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const {
    type,
    severity,
    description,
    related_key_id,
    related_person_id,
    occurred_at,
  } = parsed.data;

  // Get current active shift for linking.
  const { data: currentShift } = await supabase
    .from('shifts')
    .select('id')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Do not pass `reference` — the DB generates it atomically via
  // incident_reference_seq, avoiding the race condition of a manual count.
  const { data: incident, error: insertError } = await supabase
    .from('incidents')
    .insert({
      shift_id: currentShift?.id ?? null,
      logged_by: user.id,
      type,
      severity,
      description,
      related_key_id: related_key_id ?? null,
      related_person_id: related_person_id ?? null,
      status: 'OPEN',
      occurred_at,
    })
    .select('id, reference')
    .single();

  if (insertError || !incident) {
    const ref = crypto.randomUUID();
    logger.error('incidents: insert failed', {
      err: insertError?.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({ incident_id: incident.id, reference: incident.reference }),
    { status: 201 }
  );
};
