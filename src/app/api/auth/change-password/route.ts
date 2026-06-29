import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { password } from '@/lib/validation/primitives';
import type { UserRole } from '@/types/database';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  current_password: z.string().min(1, 'Current password is required.'),
  new_password: password,
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

  // Record the password change for the incident timeline. Best-effort: the
  // password is already updated, so an audit failure must not fail the request.
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    await writeAuditEntry({
      event: 'PASSWORD_CHANGED',
      actorId: user.id,
      actorRole: (prof?.role ?? 'REQUESTER') as UserRole,
      targetType: 'profile',
      targetId: user.id,
      payload: { email: user.email },
    });
  } catch (auditErr) {
    logger.error('Failed to write PASSWORD_CHANGED audit entry', {
      userId: user.id,
      err: String(auditErr),
    });
  }

  return NextResponse.json(ok(null));
};
