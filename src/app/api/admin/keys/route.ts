import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Z0-9]+-\d+$/),
  zone: z.enum(['NEW_SENATE', 'OLD_SENATE']),
  room_name: z.string().trim().min(1),
  unit_id: z.uuid(),
  key_count: z.coerce.number().int().min(1).max(20).default(1),
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
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { code, zone, room_name, unit_id, key_count } = parsed.data;

  const { data: key, error: insertError } = await supabase
    .from('keys')
    .insert({ code, zone, room_name, unit_id, key_count, status: 'AVAILABLE' })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        err(`Key code "${code}" is already in use.`, 409),
        { status: 409 }
      );
    }
    const ref = crypto.randomUUID();
    logger.error('create-key: insert failed', {
      err: insertError.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(ok({ key_id: key.id }, 201), { status: 201 });
};
