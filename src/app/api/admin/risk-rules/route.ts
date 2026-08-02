import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import type { RiskRuleKey } from '@/lib/ai/risk/types';
import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

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

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Unauthorized' };
  if (msg.includes('FORBIDDEN'))
    return {
      status: 403,
      message: 'Only the CSO can update risk configuration',
    };
  if (msg.includes('INVALID_TIER_BOUNDS'))
    return { status: 422, message: 'high_min must exceed medium_min' };
  if (msg.includes('INVALID_RULES'))
    return { status: 422, message: 'Invalid rule configuration' };
  return { status: 500, message: msg };
};

export const GET = async () => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const [ruleConfigRes, tierConfigRes] = await Promise.all([
    supabase.from('risk_rule_config').select('rule_key, weight, enabled'),
    supabase.from('risk_tier_config').select('medium_min, high_min').single(),
  ]);

  if (ruleConfigRes.error || tierConfigRes.error || !tierConfigRes.data) {
    const ref = crypto.randomUUID();
    logger.error('risk-rules GET failed', {
      ref,
      ruleErr: ruleConfigRes.error?.message,
      tierErr: tierConfigRes.error?.message,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({
      rules: ruleConfigRes.data,
      tier: tierConfigRes.data,
    })
  );
};

export const PATCH = async (request: NextRequest) => {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { rules, tier } = parsed.data;

  const { error } = await supabase.rpc('update_risk_config', {
    p_rules: rules,
    p_medium_min: tier.medium_min,
    p_high_min: tier.high_min,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('update_risk_config RPC failed', {
        err: error.message,
        ref,
      });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }
    return NextResponse.json(err(mapped.message, mapped.status), {
      status: mapped.status,
    });
  }

  return NextResponse.json(ok({ rules, tier }));
};
