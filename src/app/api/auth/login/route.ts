import crypto from 'crypto';
import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { writeAuditEntry } from '@/lib/audit';
import { sendOtpEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_NAMESPACE, namespaceForRole } from '@/lib/supabase/cookies';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import type { UserRole } from '@/types/database';
import { err, ok } from '@/types/api';

const MFA_ROLES = new Set(['CSO', 'DEAN', 'VERIFIER']);

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { email, password } = parsed.data;

  // Verify credentials on a throwaway client that persists nothing. We can't
  // know the role — and therefore the cookie namespace to write — until after
  // authentication, so we avoid touching any cookie here.
  const verifier = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: authData, error: authError } =
    await verifier.auth.signInWithPassword({ email, password });

  if (authError && isAuthRetryableFetchError(authError)) {
    logger.error('Login failed: unable to reach the authentication service', {
      email,
      err: String(authError),
    });
    return NextResponse.json(
      err('Network connection failed. Please try again later.', 503),
      { status: 503 }
    );
  }

  if (authError || !authData.session) {
    return NextResponse.json(err('Invalid email or password', 401), {
      status: 401,
    });
  }

  const { data: profileData } = await verifier
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  const role = (profileData as { role: string } | null)?.role ?? null;

  // Persist the session into the role-specific cookie so logging in as one role
  // never overwrites a session for a different role in the same browser.
  const namespace = namespaceForRole(role) ?? DEFAULT_NAMESPACE;
  const supabase = await createServerClient(namespace);
  await supabase.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  });

  const mfaRequired = role ? MFA_ROLES.has(role) : false;

  if (mfaRequired) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const adminClient = createAdminClient();
    await adminClient.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { mfa_code_hash: codeHash, mfa_code_expires_at: expiresAt },
    });

    // Delivery failure must not fail the login. The credentials were already
    // accepted and the code hash is persisted above, so the code that a later
    // /api/auth/resend-otp sends is valid — returning 500 here would strand the
    // user on a dead end and let a single SMTP outage lock out every MFA role.
    // The client is told delivery failed so it can surface "resend" directly.
    let emailDeliveryFailed = false;
    try {
      await sendOtpEmail({ to: email, code });
    } catch (emailErr) {
      emailDeliveryFailed = true;
      logger.error('OTP email failed', {
        email,
        err: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }

    return NextResponse.json(
      ok({
        session: null,
        role,
        mfa_required: true,
        email_delivery_failed: emailDeliveryFailed,
      })
    );
  }

  // Roles that skip MFA (REQUESTER) are fully signed in at this point, so this
  // is the completed-login moment for them. Best-effort: never block sign-in on
  // an audit failure.
  if (role) {
    try {
      await writeAuditEntry({
        event: 'LOGIN_SUCCEEDED',
        actorId: authData.user.id,
        actorRole: role as UserRole,
        targetType: 'profile',
        targetId: authData.user.id,
        payload: { email, method: 'PASSWORD' },
      });
    } catch (auditErr) {
      logger.error('Failed to write LOGIN_SUCCEEDED audit entry', {
        userId: authData.user.id,
        err: String(auditErr),
      });
    }
  }

  return NextResponse.json(
    ok({ session: authData.session, role, mfa_required: false })
  );
};
