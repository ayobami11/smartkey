import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  request_id: z.string().uuid(),
});

export const POST = async (request: NextRequest) => {
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

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { request_id } = parsed.data;

  const { data: req } = await supabase
    .from('requests')
    .select('id, status, requester_id')
    .eq('id', request_id)
    .single();

  if (!req) return NextResponse.json(err('Not found', 404), { status: 404 });
  if (req.requester_id !== user.id) return NextResponse.json(err('Forbidden', 403), { status: 403 });
  if (req.status !== 'CODE_ISSUED') {
    return NextResponse.json(
      err('Request cannot be cancelled in its current state', 409),
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from('requests')
    .update({ status: 'CANCELLED' })
    .eq('id', request_id);

  if (error) {
    const ref = crypto.randomUUID();
    logger.error('cancel request update failed', { err: error.message, ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), { status: 500 });
  }

  return NextResponse.json(ok({ request_id, status: 'CANCELLED' }));
};
