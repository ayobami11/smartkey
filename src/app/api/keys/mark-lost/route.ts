import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  key_id: z.string().uuid(),
  note: z.string().min(1),
});

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
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { key_id, note } = parsed.data;

  // Verify the key exists.
  const { data: key, error: keyError } = await supabase
    .from('keys')
    .select('id, code, status')
    .eq('id', key_id)
    .single();

  if (keyError || !key) {
    return NextResponse.json(err('Key not found', 404), { status: 404 });
  }

  if (key.status === 'RETIRED') {
    return NextResponse.json(err('Key is already retired', 409), {
      status: 409,
    });
  }

  // Retire the key.
  const { error: updateError } = await supabase
    .from('keys')
    .update({ status: 'RETIRED', retired_at: new Date().toISOString() })
    .eq('id', key_id);

  if (updateError) {
    const ref = crypto.randomUUID();
    logger.error('mark-lost: key update failed', {
      key_id,
      err: updateError.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  // Log an incident entry. Do not pass `reference` — the DB generates it
  // atomically via incident_reference_seq to avoid race conditions.
  const { data: incident, error: incidentError } = await supabase
    .from('incidents')
    .insert({
      logged_by: user.id,
      type: 'MISSING_KEY',
      severity: 'HIGH',
      description: note,
      related_key_id: key_id,
      status: 'OPEN',
      occurred_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (incidentError || !incident) {
    const ref = crypto.randomUUID();
    logger.error('mark-lost: incident insert failed', {
      key_id,
      err: incidentError?.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ key_id, incident_id: incident.id }), {
    status: 200,
  });
};
