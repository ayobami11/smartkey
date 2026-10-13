import * as z from 'zod';

import {
  WEEKEND_DATE_MESSAGES,
  weekendDateProblem,
} from '@/lib/validation/weekend-date';
import { DEFAULT_RISK_CONFIG } from '@/lib/ai/risk/default-config';
import { evaluateRisk } from '@/lib/ai/risk/engine';
import type {
  RiskContext,
  RiskEngineConfig,
  RiskRuleKey,
} from '@/lib/ai/risk/types';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { logger } from '@/lib/logger';
import { notifyAfterResponse } from '@/lib/notifications/notify';
import { callRpc } from '@/lib/rpc/call-rpc';
import { parseStorageUrl } from '@/lib/storage/object-url';
import type { Json } from '@/types/database';

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

const INVALID_UPLOAD = 'Invalid letter or stamp upload';

export const POST = route({
  name: 'requests/submit',
  auth: 'user',
  roles: ['REQUESTER'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const {
      key_id,
      type,
      return_deadline,
      weekend_date,
      letter_url,
      stamp_url,
    } = body;

    // Without a date, create_request would book the weekend request for
    // today, whatever day that is.
    if (type === 'WEEKEND') {
      const dateProblem = weekend_date
        ? weekendDateProblem(weekend_date)
        : 'NOT_WEEKEND';
      if (dateProblem) {
        return respond.fail(422, WEEKEND_DATE_MESSAGES[dateProblem]);
      }
    }

    // The letter/stamp are what the Dean's approval is verified against, so
    // they must be objects this requester uploaded: weekend-letters, in their
    // own folder (the upload path the RLS insert policy enforces). Any other
    // URL — e.g. the Dean's own reference in hod-signatures — would let the
    // signature check compare a reference against itself.
    const isOwnWeekendLetter = (url: string | undefined) => {
      if (!url) return true;
      const ref = parseStorageUrl(url);
      return (
        ref?.bucket === 'weekend-letters' && ref.path.startsWith(`${user.id}/`)
      );
    };
    if (!isOwnWeekendLetter(letter_url) || !isOwnWeekendLetter(stamp_url)) {
      return respond.fail(422, INVALID_UPLOAD);
    }

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
      supabase
        .from('authorisations')
        .select('key_id')
        .eq('profile_id', user.id),
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

    // The risk result and the weekend letter/stamp are written by the same
    // INSERT as the request, and the tier is recorded in REQUEST_CREATED.
    const result = await callRpc(supabase, 'create_request', {
      p_key_id: key_id,
      p_type: type,
      p_return_deadline: return_deadline,
      p_weekend_date: weekend_date ?? undefined,
      p_risk_tier: tier,
      p_risk_factors: factors as unknown as Json,
      // Only a weekend request carries a letter; the RPC refuses one otherwise.
      p_letter_url: type === 'WEEKEND' ? letter_url : undefined,
      p_stamp_url: type === 'WEEKEND' ? stamp_url : undefined,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        NOT_AUTHENTICATED: 'Not authenticated',
        CONFLICT:
          'Active request exists for this key. Cancel it or wait for the key to be returned.',
        VALIDATION: INVALID_UPLOAD,
      });
    }

    const created = result.data;

    if (type === 'WEEKEND') {
      // Emails the Dean (or the CSOs, for Administration keys). The one-click
      // decision token was created with the request by create_request.
      notifyAfterResponse({
        type: 'WEEKEND_SUBMITTED',
        requestId: created.request_id,
      });

      return respond.ok(
        {
          request_id: created.request_id,
          status: 'PENDING_HOD',
          risk_tier: tier,
        },
        201
      );
    }

    // A failed send never fails the request: the code is already shown in-app.
    notifyAfterResponse({ type: 'CODE_ISSUED', requestId: created.request_id });

    return respond.ok(
      {
        request_id: created.request_id,
        code: created.code,
        code_expires_at: created.code_expires_at,
        risk_tier: tier,
      },
      201
    );
  },
});
