import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendActivationEmail } from '@/lib/email/otp';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';
import type { ProfileStatus, UserRole } from '@/types/database';

const postBodySchema = z.object({
  full_name: z.string().min(1),
  institutional_email: z.email(),
  role: z.enum(['HOD', 'VERIFIER', 'REQUESTER']),
  department_id: z.uuid().optional(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('FORBIDDEN')) return { status: 403, message: 'Forbidden' };
  if (msg.includes('DUPLICATE_PROFILE'))
    return { status: 409, message: 'Email already registered' };
  if (msg.includes('AUTH_USER_NOT_FOUND'))
    return {
      status: 409,
      message:
        'No auth account found for this email. Send an invite via Supabase Auth first, then provision.',
    };
  return { status: 500, message: 'Internal error' };
};

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
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { full_name, institutional_email, role, department_id } = parsed.data;

  if ((role === 'HOD' || role === 'REQUESTER') && !department_id) {
    return NextResponse.json(
      err('department_id is required for HOD and REQUESTER roles', 422),
      { status: 422 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';
  const activationPath = role === 'HOD' ? '/hod/onboarding' : '/activate';
  const adminClient = createAdminClient();

  // Check whether a profile already exists for this email.
  // ACTIVE users are a real conflict. PENDING_ACTIVATION (never activated) and
  // DEACTIVATED (revoked) can both be re-invited.
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('institutional_email', institutional_email)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.status === 'ACTIVE') {
      return NextResponse.json(err('Email already registered', 409), {
        status: 409,
      });
    }

    // DEACTIVATED: lift the ban before resending so they can log in.
    if (existingProfile.status === 'DEACTIVATED') {
      await adminClient.auth.admin.updateUserById(existingProfile.id, {
        ban_duration: 'none',
      });
    }

    // Reset profile status and update name/department in case they changed.
    const { error: resetError } = await supabase
      .from('profiles')
      .update({ status: 'PENDING_ACTIVATION', full_name, department_id })
      .eq('id', existingProfile.id);

    if (resetError) {
      const ref = crypto.randomUUID();
      logger.error('re-invite: profile reset failed', {
        err: resetError.message,
        ref,
      });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }

    // generateLink mints a one-time token. We build our own /auth/confirm link
    // from the token hash (verified server-side via verifyOtp) and send it via
    // Gmail so delivery is reliable regardless of Supabase's SMTP config.
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: institutional_email,
      });

    if (linkError || !linkData?.properties?.hashed_token) {
      logger.error('re-invite: generateLink failed', {
        err: linkError?.message ?? 'no hashed_token returned',
      });
    } else {
      const confirmParams = new URLSearchParams({
        token_hash: linkData.properties.hashed_token,
        type: linkData.properties.verification_type,
        next: activationPath,
      });
      await sendActivationEmail({
        to: institutional_email,
        link: `${siteUrl}/auth/confirm?${confirmParams.toString()}`,
        isReinvite: true,
      }).catch((e: unknown) =>
        logger.error('re-invite: email send failed', { err: String(e) })
      );
    }

    return NextResponse.json(
      ok({ profile_id: existingProfile.id, status: 'PENDING_ACTIVATION' }),
      { status: 200 }
    );
  }

  // New user: generateLink with type 'invite' creates the auth.users row and
  // mints a one-time token. We build our own /auth/confirm link from the token
  // hash and send via our own Gmail for reliable delivery.
  const { data: newLinkData, error: inviteError } =
    await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: institutional_email,
    });

  if (inviteError) {
    const ref = crypto.randomUUID();
    logger.error('provision_user: generateLink failed', {
      err: inviteError.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  if (newLinkData?.properties?.hashed_token) {
    const confirmParams = new URLSearchParams({
      token_hash: newLinkData.properties.hashed_token,
      type: newLinkData.properties.verification_type,
      next: activationPath,
    });
    await sendActivationEmail({
      to: institutional_email,
      link: `${siteUrl}/auth/confirm?${confirmParams.toString()}`,
      isReinvite: false,
    }).catch((e: unknown) =>
      logger.error('provision_user: email send failed', { err: String(e) })
    );
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'provision_user',
    {
      p_full_name: full_name,
      p_email: institutional_email,
      p_role: role,
      p_department_id: department_id ?? undefined,
    }
  );

  if (rpcError) {
    const mapped = mapRpcError(rpcError.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('provision_user RPC failed', { err: rpcError.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('provision_user RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({ profile_id: result.profile_id, status: 'PENDING_ACTIVATION' }),
    { status: 201 }
  );
};

export const GET = async (request: NextRequest) => {
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

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');
  const departmentId = searchParams.get('department_id');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const cursor = searchParams.get('cursor');

  let query = supabase
    .from('profiles')
    .select(
      'id, full_name, institutional_email, role, status, department_id, photo_url, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (role) query = query.eq('role', role as UserRole);
  if (departmentId) query = query.eq('department_id', departmentId);
  if (status) query = query.eq('status', status as ProfileStatus);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(err('Failed to fetch users', 500), {
      status: 500,
    });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const users = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && users.length > 0 ? users[users.length - 1].created_at : null;

  return NextResponse.json(ok({ users, next_cursor: nextCursor }), {
    status: 200,
  });
};
