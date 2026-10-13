import * as z from 'zod';

import type { RiskRuleKey } from '@/lib/ai/risk/types';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpcVoid } from '@/lib/rpc/call-rpc';

const RULE_KEYS = [
  'outside_operational_hours',
  'outstanding_key_not_returned',
  'weekend_without_memo',
  'excess_request_frequency',
  'collector_not_whitelisted',
] as const satisfies readonly RiskRuleKey[];

const ruleSchema = z.object({
  rule_key: z.enum(RULE_KEYS),
  weight: z.coerce.number().int().min(1).max(10),
  enabled: z.boolean(),
});

const bodySchema = z
  .object({
    rules: z
      .array(ruleSchema)
      .length(5)
      .refine(
        (rules) => new Set(rules.map((r) => r.rule_key)).size === rules.length,
        { message: 'Duplicate rule_key in rules array' }
      ),
    tier: z
      .object({
        medium_min: z.coerce.number().int().min(1),
        high_min: z.coerce.number().int().min(1),
      })
      .refine((t) => t.high_min > t.medium_min, {
        message: 'high_min must exceed medium_min',
      }),
  })
  .refine(
    (body) => RULE_KEYS.every((k) => body.rules.some((r) => r.rule_key === k)),
    { message: 'rules array must include every rule_key exactly once' }
  );

export const GET = route({
  name: 'admin/risk-rules',
  auth: 'user',
  roles: ['CSO'],
  handler: async ({ supabase }) => {
    const [ruleConfigRes, tierConfigRes] = await Promise.all([
      supabase.from('risk_rule_config').select('rule_key, weight, enabled'),
      supabase.from('risk_tier_config').select('medium_min, high_min').single(),
    ]);

    if (ruleConfigRes.error || tierConfigRes.error || !tierConfigRes.data) {
      return respond.internal('risk-rules GET failed', {
        ruleErr: ruleConfigRes.error?.message,
        tierErr: tierConfigRes.error?.message,
      });
    }

    return respond.ok({
      rules: ruleConfigRes.data,
      tier: tierConfigRes.data,
    });
  },
});

export const PATCH = route({
  name: 'admin/risk-rules',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, body }) => {
    const { rules, tier } = body;

    const result = await callRpcVoid(supabase, 'update_risk_config', {
      p_rules: rules,
      p_medium_min: tier.medium_min,
      p_high_min: tier.high_min,
    });

    if (!result.ok) {
      return rpcFail(result.error, {
        FORBIDDEN: 'Only the CSO can update risk configuration',
      });
    }

    return respond.ok({ rules, tier });
  },
});
