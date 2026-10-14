import * as z from 'zod';

import { provisionNewUser } from '@/lib/admin/provision-new-user';
import { reinstateUser, type ReinstatePorts } from '@/lib/admin/reinstate-user';
import { activationEmail } from '@/lib/email/templates/account';
import { gmailTransport } from '@/lib/email/transport';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { byDetail, rpcFail } from '@/lib/http/rpc-errors';
import { logger } from '@/lib/logger';
import { callRpc } from '@/lib/rpc/call-rpc';
import { rewriteStorageUrls } from '@/lib/storage/object-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { fullName } from '@/lib/validation/primitives';

const postBodySchema = z.object({
  full_name: fullName(),
  institutional_email: z.email(),
  role: z.enum(['DEAN', 'VERIFIER', 'REQUESTER']),
  unit_id: z.uuid().optional(),
});

const ACTIVE_DEAN_CONFLICT = 'That unit already has an active Dean.';

// The stored role decides where activation lands, not the form's: a
// re-invite never changes a profile's role.
const activationPathFor = (role: string) =>
  role === 'DEAN' ? '/dean/onboarding' : '/activate';

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

// The RPC copy for the re-invite and reinstatement paths. Each CONFLICT
// detail maps to fixed copy; the detail itself never reaches the client.
const reinviteErrors = {
  NOT_FOUND: 'User not found',
  CONFLICT: byDetail([
    [/^that unit already has an active Dean/, ACTIVE_DEAN_CONFLICT],
    [/^user is already active/, 'Email already registered'],
    [
      /^user is (?:not )?deactivated/,
      'User status changed. Refresh and try again.',
    ],
  ]),
  VALIDATION: byDetail([
    [/^unit not found/, 'Unit not found'],
    [/^unit is required/, 'unit_id is required for Dean and Requester roles'],
  ]),
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
    // reinstate_user / record_invite_resent repeat this check under a lock;
    // this read answers early, before any auth account is touched.
    if (role === 'DEAN' && unit_id) {
      const { data: dept } = await supabase
        .from('units')
        .select('hod_id, hod:profiles!hod_id(status)')
        .eq('id', unit_id)
        .single();

      const existingHod = dept?.hod as { status: string } | null;
      if (dept?.hod_id && existingHod?.status === 'ACTIVE') {
        return respond.fail(409, ACTIVE_DEAN_CONFLICT);
      }
    }

    const adminClient = createAdminClient();

    // Best effort: the account change is already committed and audited, and
    // the CSO can re-send from the users table.
    const sendActivation = async (
      link: { hashed_token: string; verification_type: string },
      profileRole: string,
      isReinvite: boolean
    ) => {
      await gmailTransport
        .send({
          to: institutional_email,
          ...activationEmail({
            link: confirmLink(link, activationPathFor(profileRole)),
            isReinvite,
          }),
        })
        .catch((e: unknown) =>
          logger.error('admin/users: activation email send failed', {
            err: String(e),
          })
        );
    };

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

      // The link comes first: if it cannot be generated nothing has changed
      // and the CSO can simply retry. The profile change and its audit entry
      // follow; the email, which can never be part of a transaction, last.
      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email: institutional_email,
        });

      if (linkError || !linkData?.properties?.hashed_token) {
        return respond.internal('re-invite: generateLink failed', {
          err: linkError?.message ?? 'no hashed_token returned',
        });
      }

      let profileRole: string;

      if (existingProfile.status === 'DEACTIVATED') {
        // reinstate_user, then lift the auth ban, compensating if the lift
        // fails: see src/lib/admin/reinstate-user.ts for the order.
        const ports: ReinstatePorts = {
          // The CSO's own session: the RPCs check the actor is the CSO.
          reinstate: (id) =>
            callRpc(supabase, 'reinstate_user', {
              p_profile_id: id,
              p_full_name: full_name,
              p_unit_id: unit_id ?? undefined,
            }),
          unban: async (id) => {
            const { error } = await adminClient.auth.admin.updateUserById(id, {
              ban_duration: 'none',
            });
            return error ? { ok: false, message: error.message } : { ok: true };
          },
          deactivate: (id) =>
            callRpc(supabase, 'deactivate_user', { p_profile_id: id }),
        };

        const outcome = await reinstateUser(existingProfile.id, ports);
        if (!outcome.ok) {
          if (outcome.reason === 'RPC_FAILED') {
            return rpcFail(outcome.error, reinviteErrors);
          }
          return respond.fail(500, `Internal error. Ref: ${outcome.ref}`);
        }
        profileRole = outcome.role;
      } else {
        const result = await callRpc(supabase, 'record_invite_resent', {
          p_profile_id: existingProfile.id,
          p_full_name: full_name,
          p_unit_id: unit_id ?? undefined,
        });
        if (!result.ok) return rpcFail(result.error, reinviteErrors);
        profileRole = result.data.role;
      }

      await sendActivation(linkData.properties, profileRole, true);

      return respond.ok({
        profile_id: existingProfile.id,
        status: 'PENDING_ACTIVATION',
      });
    }

    // New user: auth account first, then the profile, and the email only
    // once the profile exists. A failed provision_user deletes the auth
    // account it would have belonged to (src/lib/admin/provision-new-user.ts).
    const outcome = await provisionNewUser({
      createInvite: async () => {
        const { data, error } = await adminClient.auth.admin.generateLink({
          type: 'invite',
          email: institutional_email,
        });
        if (error) return { ok: false, message: error.message };
        if (!data?.properties?.hashed_token || !data.user?.id) {
          return { ok: false, message: 'no hashed_token or user returned' };
        }
        return {
          ok: true,
          link: {
            userId: data.user.id,
            hashedToken: data.properties.hashed_token,
            verificationType: data.properties.verification_type,
          },
        };
      },
      provision: () =>
        callRpc(supabase, 'provision_user', {
          p_full_name: full_name,
          p_email: institutional_email,
          p_role: role,
          p_department_id: unit_id ?? undefined,
        }),
      deleteAuthUser: async (userId) => {
        const { error } = await adminClient.auth.admin.deleteUser(userId);
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      sendInvite: (link) =>
        sendActivation(
          {
            hashed_token: link.hashedToken,
            verification_type: link.verificationType,
          },
          role,
          false
        ),
    });

    if (!outcome.ok) {
      if (outcome.reason === 'INVITE_FAILED') {
        return respond.fail(500, `Internal error. Ref: ${outcome.ref}`);
      }
      return rpcFail(outcome.error, { NOT_AUTHENTICATED: 'Not authenticated' });
    }

    // The activation token stays server-side; only the profile id is sent.
    return respond.ok(
      { profile_id: outcome.profileId, status: 'PENDING_ACTIVATION' },
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
