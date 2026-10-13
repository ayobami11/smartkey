import * as z from 'zod';

import { activationEmail } from '@/lib/email/templates/account';
import { gmailTransport } from '@/lib/email/transport';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { logger } from '@/lib/logger';
import { callRpc } from '@/lib/rpc/call-rpc';
import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';

const postBodySchema = z.object({
  full_name: z.string().min(1),
  institutional_email: z.email(),
  role: z.enum(['DEAN', 'VERIFIER', 'REQUESTER']),
  unit_id: z.uuid().optional(),
});

// generateLink mints a one-time token. We build our own /auth/confirm link
// from the token hash (verified server-side via verifyOtp) and send it via
// Gmail, so delivery is reliable regardless of Supabase's SMTP config.
const confirmLink = (
  properties: { hashed_token: string; verification_type: string },
  next: string
) => {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartkey-ochre.vercel.app';
  const params = new URLSearchParams({
    token_hash: properties.hashed_token,
    type: properties.verification_type,
    next,
  });
  return `${siteUrl}/auth/confirm?${params.toString()}`;
};

export const POST = route({
  name: 'admin/users',
  auth: 'user',
  roles: ['CSO'],
  body: postBodySchema,
  handler: async ({ supabase, body }) => {
    const { full_name, institutional_email, role, unit_id } = body;

    if ((role === 'DEAN' || role === 'REQUESTER') && !unit_id) {
      return respond.fail(
        422,
        'unit_id is required for Dean and Requester roles'
      );
    }

    // Prevent assigning a second ACTIVE Dean to a unit that already has one.
    if (role === 'DEAN' && unit_id) {
      const { data: dept } = await supabase
        .from('units')
        .select('hod_id, hod:profiles!hod_id(status)')
        .eq('id', unit_id)
        .single();

      const existingHod = dept?.hod as { status: string } | null;
      if (dept?.hod_id && existingHod?.status === 'ACTIVE') {
        return respond.fail(409, 'This department already has an active HOD');
      }
    }

    const activationPath = role === 'DEAN' ? '/dean/onboarding' : '/activate';
    const adminClient = createAdminClient();

    // Check whether a profile already exists for this email.
    // ACTIVE users are a real conflict. PENDING_ACTIVATION (never activated)
    // and DEACTIVATED (revoked) can both be re-invited.
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, status')
      .eq('institutional_email', institutional_email)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.status === 'ACTIVE') {
        return respond.fail(409, 'Email already registered');
      }

      // DEACTIVATED: lift the ban before resending so they can log in.
      if (existingProfile.status === 'DEACTIVATED') {
        await adminClient.auth.admin.updateUserById(existingProfile.id, {
          ban_duration: 'none',
        });
      }

      // Reset profile status and update name/unit in case they changed.
      // Server-written: protect_profile_columns rejects status/unit_id
      // changes from any user session, the CSO's included.
      // Known follow-up: this re-invite (including reinstating a
      // DEACTIVATED user) writes no audit entry.
      const { error: resetError } = await adminClient
        .from('profiles')
        .update({ status: 'PENDING_ACTIVATION', full_name, unit_id })
        .eq('id', existingProfile.id);

      if (resetError) {
        return respond.internal('re-invite: profile reset failed', {
          err: resetError.message,
        });
      }

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
        await gmailTransport
          .send({
            to: institutional_email,
            ...activationEmail({
              link: confirmLink(linkData.properties, activationPath),
              isReinvite: true,
            }),
          })
          .catch((e: unknown) =>
            logger.error('re-invite: email send failed', { err: String(e) })
          );
      }

      return respond.ok({
        profile_id: existingProfile.id,
        status: 'PENDING_ACTIVATION',
      });
    }

    // New user: generateLink with type 'invite' creates the auth.users row
    // and mints a one-time token; provision_user then needs that row.
    const { data: newLinkData, error: inviteError } =
      await adminClient.auth.admin.generateLink({
        type: 'invite',
        email: institutional_email,
      });

    if (inviteError) {
      return respond.internal('provision_user: generateLink failed', {
        err: inviteError.message,
      });
    }

    if (newLinkData?.properties?.hashed_token) {
      await gmailTransport
        .send({
          to: institutional_email,
          ...activationEmail({
            link: confirmLink(newLinkData.properties, activationPath),
            isReinvite: false,
          }),
        })
        .catch((e: unknown) =>
          logger.error('provision_user: email send failed', {
            err: String(e),
          })
        );
    }

    const result = await callRpc(supabase, 'provision_user', {
      p_full_name: full_name,
      p_email: institutional_email,
      p_role: role,
      p_department_id: unit_id ?? undefined,
    });

    if (!result.ok) {
      return rpcFail(result.error, { NOT_AUTHENTICATED: 'Not authenticated' });
    }

    // The activation token stays server-side; only the profile id is sent.
    return respond.ok(
      { profile_id: result.data.profile_id, status: 'PENDING_ACTIVATION' },
      201
    );
  },
});

export const GET = route({
  name: 'admin/users',
  auth: 'user',
  roles: ['CSO'],
  handler: async ({ supabase }) => {
    // Fetch all profiles in one shot — filtering, sorting, and pagination
    // happen client-side via TanStack Table. At pilot scale (≤500 users)
    // this is fine.
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, institutional_email, role, status, photo_url, created_at, last_login_at, department:units!unit_id(name)'
      )
      .neq('status', 'DEACTIVATED')
      .order('created_at', { ascending: false });

    if (error) {
      return respond.internal('admin/users GET failed', { err: error.message });
    }

    const users = (data ?? []).map(({ last_login_at, ...u }) => ({
      ...u,
      last_sign_in_at: last_login_at,
    }));

    return respond.ok(rewriteStorageUrls({ users }));
  },
});
