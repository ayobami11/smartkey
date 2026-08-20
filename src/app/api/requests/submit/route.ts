import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { DEFAULT_RISK_CONFIG } from '@/lib/ai/risk/default-config';
import { evaluateRisk } from '@/lib/ai/risk/engine';
import type {
  RiskContext,
  RiskEngineConfig,
  RiskRuleKey,
} from '@/lib/ai/risk/types';
import {
  sendCollectionCodeEmail,
  sendWeekendSubmittedEmail,
} from '@/lib/email/otp';
import {
  getDeanRecipientForKey,
  getRequestRecipient,
} from '@/lib/email/request-recipient';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  key_id: z.uuid(),
  type: z.enum(['WEEKDAY', 'WEEKEND']),
  return_deadline: z.string().min(1),
  weekend_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  letter_url: z.url().optional(),
  stamp_url: z.url().optional(),
});

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('FORBIDDEN')) return { status: 403, message: 'Forbidden' };
  if (msg.includes('NOT_FOUND')) return { status: 404, message: 'Not found' };
  if (msg.includes('CONFLICT'))
    return {
      status: 409,
      message:
        'Active request exists for this key. Cancel it or wait for the key to be returned.',
    };
  if (msg.includes('NOT_AUTHORISED'))
    return { status: 403, message: 'Not authorised for this key' };
  if (msg.includes('EXPIRED_CODE'))
    return { status: 404, message: 'Code has expired' };
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
    .select('role, unit_id, full_name')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'REQUESTER')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { key_id, type, return_deadline, weekend_date, letter_url, stamp_url } =
    parsed.data;

  // Fetch risk context data in parallel before calling the RPC.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    keyRes,
    outstandingRes,
    recentRes,
    authRes,
    ruleConfigRes,
    tierConfigRes,
  ] = await Promise.all([
    supabase
      .from('keys')
      .select('zone, code, room_name')
      .eq('id', key_id)
      .single(),
    supabase
      .from('requests')
      .select('key_id')
      .eq('requester_id', user.id)
      .in('status', ['CODE_ISSUED', 'KEY_ISSUED']),
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', user.id)
      .gte('created_at', since24h),
    supabase.from('authorisations').select('key_id').eq('profile_id', user.id),
    supabase.from('risk_rule_config').select('rule_key, weight, enabled'),
    supabase.from('risk_tier_config').select('medium_min, high_min').single(),
  ]);

  // Risk config is CSO-editable (see /cso/settings → Risk rules); a read
  // failure here should degrade to the safe hardcoded defaults rather than
  // block key requests over a transient config-read hiccup.
  let riskConfig: RiskEngineConfig = DEFAULT_RISK_CONFIG;
  if (
    !ruleConfigRes.error &&
    !tierConfigRes.error &&
    ruleConfigRes.data?.length === 5 &&
    tierConfigRes.data
  ) {
    const rules = {} as RiskEngineConfig['rules'];
    for (const row of ruleConfigRes.data) {
      rules[row.rule_key as RiskRuleKey] = {
        weight: row.weight,
        enabled: row.enabled,
      };
    }
    riskConfig = {
      rules,
      tier: {
        mediumMin: tierConfigRes.data.medium_min,
        highMin: tierConfigRes.data.high_min,
      },
    };
  } else {
    logger.warn('risk config read failed; falling back to defaults', {
      ruleConfigError: ruleConfigRes.error?.message,
      tierConfigError: tierConfigRes.error?.message,
    });
  }

  // Set of every key this requester is currently authorised for, used both to
  // decide whitelisting for the requested key and whether the keys they already
  // hold are all authorised (a whitelisted bulk collector is not a risk).
  const authorisedKeyIds = new Set((authRes.data ?? []).map((a) => a.key_id));
  const outstandingKeyIds = (outstandingRes.data ?? [])
    .map((r) => r.key_id)
    .filter((id): id is string => id !== null);
  const hasOutstandingKey = outstandingKeyIds.length > 0;

  const riskCtx: RiskContext = {
    requestType: type,
    requestedAt: new Date(),
    keyZone: (keyRes.data?.zone as RiskContext['keyZone']) ?? 'NEW_SENATE',
    hasOutstandingKey,
    outstandingKeysAuthorised:
      hasOutstandingKey &&
      outstandingKeyIds.every((id) => authorisedKeyIds.has(id)),
    recentRequestCount: recentRes.count ?? 0,
    isWhitelisted: authorisedKeyIds.has(key_id),
  };
  const { tier, factors } = evaluateRisk(riskCtx, riskConfig);

  const { data, error } = await supabase.rpc('create_request', {
    p_key_id: key_id,
    p_type: type,
    p_return_deadline: return_deadline,
    p_weekend_date: weekend_date ?? undefined,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('create_request RPC failed', { err: error.message, ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result) {
    const ref = crypto.randomUUID();
    logger.error('create_request RPC returned empty result', { ref });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  // Back-fill the real risk tier and factors. RLS blocks REQUESTER updates so
  // this goes via the admin client. The write is best-effort — a failure here
  // should not block the response; the default 'LOW' stored by the RPC is safe.
  const adminClient = createAdminClient();
  const { error: riskUpdateError } = await adminClient
    .from('requests')
    .update({ risk_tier: tier, risk_factors: factors as never })
    .eq('id', result.request_id);

  if (riskUpdateError) {
    logger.error('failed to persist risk tier', {
      requestId: result.request_id,
      tier,
      err: riskUpdateError.message,
    });
  }

  if (type === 'WEEKEND' && (letter_url || stamp_url)) {
    const { error: letterUpdateError } = await adminClient
      .from('requests')
      .update({
        ...(letter_url ? { letter_url } : {}),
        ...(stamp_url ? { stamp_url } : {}),
      })
      .eq('id', result.request_id);
    if (letterUpdateError) {
      logger.error('failed to persist letter_url/stamp_url', {
        requestId: result.request_id,
        err: letterUpdateError.message,
      });
    }
  }

  if (type === 'WEEKEND') {
    // Resolves to null (no send) for Administration (authoriser='CSO')
    // keys, which have no Dean. Runs via after() rather than a bare
    // fire-and-forget promise — Vercel may freeze the function as soon as
    // the response below is sent, so an unawaited promise here can be
    // silently cut off mid-send. after() keeps it alive until it finishes.
    after(() =>
      getDeanRecipientForKey(adminClient, key_id)
        .then(async (recipient) => {
          if (!recipient) return;
          const siteUrl =
            process.env.NEXT_PUBLIC_SITE_URL ??
            'https://smartkey-ochre.vercel.app';

          // One-click email Approve/Decline — only for this (registered,
          // Dean-routed) case. Mint and persist the token before sending so
          // the email link is never dead on arrival.
          const decisionToken = crypto.randomUUID();
          const { error: tokenError } = await adminClient
            .from('requests')
            .update({ decision_token: decisionToken })
            .eq('id', result.request_id);
          if (tokenError) {
            logger.error('submit: failed to persist decision_token', {
              requestId: result.request_id,
              err: tokenError.message,
            });
          }

          return sendWeekendSubmittedEmail({
            to: recipient.to,
            fullName: recipient.fullName,
            requesterName: profile.full_name,
            unitName: recipient.unitName,
            roomLabel:
              keyRes.data?.room_name && keyRes.data.code
                ? `${keyRes.data.room_name} (${keyRes.data.code})`
                : recipient.unitName,
            requestedFor: weekend_date ?? '',
            link: `${siteUrl}/dean/weekend-requests`,
            decisionLink: tokenError
              ? undefined
              : `${siteUrl}/dean-decision/${decisionToken}`,
          });
        })
        .catch((e: unknown) => {
          logger.error('submit: weekend-submitted email failed', {
            requestId: result.request_id,
            err: e instanceof Error ? e.message : String(e),
          });
        })
    );

    return NextResponse.json(
      ok({
        request_id: result.request_id,
        status: 'PENDING_HOD',
        risk_tier: tier,
      }),
      { status: 201 }
    );
  }

  // A failed send must not fail an otherwise-successful request — the code
  // is already usable in-app regardless of email delivery. Runs via after()
  // rather than a bare fire-and-forget promise; see the comment above the
  // weekend-submitted email send further up in this file.
  if (result.code && result.code_expires_at) {
    after(() =>
      getRequestRecipient(adminClient, result.request_id)
        .then((recipient) => {
          if (!recipient) return;
          return sendCollectionCodeEmail({
            to: recipient.to,
            fullName: recipient.fullName,
            code: result.code!,
            codeExpiresAt: result.code_expires_at!,
            keyCode: recipient.keyCode,
            roomName: recipient.roomName,
          });
        })
        .catch((e: unknown) => {
          logger.error('submit: collection-code email failed', {
            requestId: result.request_id,
            err: e instanceof Error ? e.message : String(e),
          });
        })
    );
  }

  return NextResponse.json(
    ok({
      request_id: result.request_id,
      code: result.code,
      code_expires_at: result.code_expires_at,
      risk_tier: tier,
    }),
    { status: 201 }
  );
};
