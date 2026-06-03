import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { ok } from '@/types/api';

const bodySchema = z.object({
  email: z.email(),
});

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  // Always 200 — no enumeration
  if (!parsed.success) return NextResponse.json(ok(null));

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    logger.error('resend-otp failed', { err: error.message });
  }

  return NextResponse.json(ok(null));
};
