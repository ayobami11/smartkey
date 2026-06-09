import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_NAMESPACE, namespaceForRole } from '@/lib/supabase/cookies';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  email: z.email(),
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
});

export const POST = async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { email, otp } = parsed.data;

  // Look up the profile via the admin client: there is no session cookie to
  // authenticate this read yet, and we need the role to pick the cookie
  // namespace the login route wrote the session into.
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('institutional_email', email)
    .single();

  if (!profile) {
    return NextResponse.json(err('Invalid or expired code', 401), {
      status: 401,
    });
  }

  const {
    data: { user: authUser },
  } = await adminClient.auth.admin.getUserById(profile.id);

  const meta = authUser?.app_metadata ?? {};
  const storedHash = meta.mfa_code_hash as string | undefined;
  const expiresAt = meta.mfa_code_expires_at as string | undefined;

  if (!storedHash || !expiresAt || new Date(expiresAt) < new Date()) {
    return NextResponse.json(err('Invalid or expired code', 401), {
      status: 401,
    });
  }

  const inputHash = crypto.createHash('sha256').update(otp).digest('hex');
  if (inputHash !== storedHash) {
    return NextResponse.json(err('Invalid or expired code', 401), {
      status: 401,
    });
  }

  // Clear the OTP so it cannot be reused
  await adminClient.auth.admin.updateUserById(profile.id, {
    app_metadata: { mfa_code_hash: null, mfa_code_expires_at: null },
  });

  // The session was written to the role-specific cookie by the login route;
  // read it back from that same namespace.
  const namespace = namespaceForRole(profile.role) ?? DEFAULT_NAMESPACE;
  const supabase = await createServerClient(namespace);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return NextResponse.json(ok({ session }));
};
