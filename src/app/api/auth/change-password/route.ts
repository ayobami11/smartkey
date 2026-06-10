import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  current_password: z.string().min(1, 'Current password is required.'),
  new_password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .regex(/[A-Z]/, 'Must contain an uppercase letter.')
    .regex(/[a-z]/, 'Must contain a lowercase letter.')
    .regex(/[0-9]/, 'Must contain a number.')
    .regex(/[^A-Za-z0-9]/, 'Must contain a symbol.'),
});

export const POST = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json(err('Not authenticated.', 401), { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Validation error.';
    return NextResponse.json(err(message, 422), { status: 422 });
  }

  const { current_password, new_password } = parsed.data;

  // Verify the current password by re-authenticating
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current_password,
  });

  if (verifyError) {
    return NextResponse.json(err('Current password is incorrect.', 401), {
      status: 401,
    });
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: new_password,
  });

  if (updateError) {
    logger.error('change-password: updateUser failed', {
      userId: user.id,
      error: updateError.message,
    });
    return NextResponse.json(
      err('Failed to update password. Try again.', 500),
      { status: 500 }
    );
  }

  return NextResponse.json(ok(null));
};
