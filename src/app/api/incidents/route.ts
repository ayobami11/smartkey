import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';
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
  related_key_id: z.uuid().optional(),
  related_person_id: z.uuid().optional(),
  occurred_at: z.string().min(1),
});

export const GET = route({
  name: 'incidents',
  auth: 'user',
  roles: ['CSO'],
  handler: async ({ request, supabase }) => {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const severity = searchParams.get('severity');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(
      parseInt(searchParams.get('limit') ?? '50', 10),
      100
    );
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

    if (error) return respond.fail(500, 'Failed to fetch incidents');

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const incidents = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && incidents.length > 0
        ? incidents[incidents.length - 1].logged_at
        : null;

    return respond.ok({ incidents, next_cursor: nextCursor });
  },
});

// The insert and its INCIDENT_LOGGED audit entry commit together in
// log_incident, which also resolves the open shift and leaves `reference` to
// the DB's sequence default. The logger is the session user.
export const POST = route({
  name: 'incidents',
  auth: 'user',
  roles: ['CSO', 'VERIFIER'],
  body: postBodySchema,
  handler: async ({ supabase, body }) => {
    const result = await callRpc(supabase, 'log_incident', {
      p_type: body.type,
      p_severity: body.severity,
      p_description: body.description,
      p_occurred_at: body.occurred_at,
      p_related_key_id: body.related_key_id,
      p_related_person_id: body.related_person_id,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        // A whitespace-only description passes the schema but not the RPC.
        VALIDATION: 'Invalid request body',
      });
    }

    return respond.ok(
      {
        incident_id: result.data.incident_id,
        reference: result.data.reference,
      },
      201
    );
  },
});
