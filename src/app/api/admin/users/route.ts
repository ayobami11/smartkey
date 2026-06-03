import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendInviteEmail } from '@/lib/email';
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

  // Generate an invite link via the admin API (no email sent by Supabase).
  // We deliver the email ourselves via Resend to avoid Supabase's 2 emails/hour
  // free-tier rate limit. generateLink also creates the auth.users row.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';
  const activationPath = role === 'HOD' ? '/hod/onboarding' : '/activate';

  const adminClient = createAdminClient();
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: institutional_email,
      options: {
        redirectTo: `${siteUrl}/api/auth/callback?next=${activationPath}`,
      },
    });

  if (
    linkError &&
    !linkError.message.toLowerCase().includes('already been registered')
  ) {
    const ref = crypto.randomUUID();
    logger.error('provision_user: generateLink failed', {
      err: linkError.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  if (linkData?.properties?.action_link) {
    const { error: emailError } = await sendInviteEmail({
      to: institutional_email,
      fullName: full_name,
      role,
      activationLink: linkData.properties.action_link,
    });
    if (emailError) {
      logger.error('provision_user: failed to send invite email', {
        err: emailError.message,
        email: institutional_email,
      });
    }
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
