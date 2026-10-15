import * as z from 'zod';

import { pageLimit, timestamp } from '@/lib/http/query';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';
import { Constants } from '@/types/database';

const ENUMS = Constants.public.Enums;

const getQuerySchema = z.object({
  type: z.enum(ENUMS.incident_type).optional(),
  severity: z.enum(ENUMS.incident_severity).optional(),
  status: z.enum(ENUMS.incident_status).optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
  limit: pageLimit(50, 100),
  // The logged_at of the last row on the previous page.
  cursor: timestamp.optional(),
});

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
  query: getQuerySchema,
  handler: async ({ supabase, query: params }) => {
    const { type, severity, status, from, to, limit, cursor } = params;

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

    if (type) query = query.eq('type', type);
    if (severity) query = query.eq('severity', severity);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('occurred_at', from);
    if (to) query = query.lte('occurred_at', to);
    if (cursor) query = query.lt('logged_at', cursor);

    const { data, error } = await query;

    if (error) {
      return respond.internal('incidents: query failed', {
        err: error.message,
      });
    }

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
