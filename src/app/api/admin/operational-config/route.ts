import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { ZONES, type Zone } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const zoneHoursSchema = z
  .object({
    zone: z.enum(ZONES),
    weekday_open: z.string().regex(TIME_REGEX),
    weekday_close: z.string().regex(TIME_REGEX),
    weekend_closed: z.boolean(),
    weekend_open: z.string().regex(TIME_REGEX).nullable(),
    weekend_close: z.string().regex(TIME_REGEX).nullable(),
  })
  .refine((z) => z.weekend_closed || (z.weekend_open && z.weekend_close), {
    message:
      'weekend_open and weekend_close are required when weekend_closed is false',
  });

const bodySchema = z
  .object({
    zones: z
      .array(zoneHoursSchema)
      .length(2)
      .refine(
        (zones) => new Set(zones.map((z) => z.zone)).size === zones.length,
        { message: 'Duplicate zone in zones array' }
      ),
    return_deadline_time: z.string().regex(TIME_REGEX),
    code_expiry_minutes: z.coerce.number().int().min(5).max(60),
  })
  .refine(
    (body) => ZONES.every((zone) => body.zones.some((z) => z.zone === zone)),
    { message: 'zones array must include every zone exactly once' }
  );

// Postgres `time` columns round-trip as "HH:MM:SS"; the UI's <input type="time">
// and the RPC's HH:MM regex both want "HH:MM".
const toHHMM = (t: string | null): string | null => (t ? t.slice(0, 5) : null);

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Unauthorized' };
  if (msg.includes('FORBIDDEN'))
    return {
      status: 403,
      message: 'Only the CSO can update operational configuration',
    };
  if (msg.includes('INVALID_ZONE_HOURS'))
    return { status: 422, message: 'Invalid zone hours' };
  if (msg.includes('INVALID_CONFIG'))
    return { status: 422, message: 'Invalid operational configuration' };
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

  const [zoneHoursRes, configRes] = await Promise.all([
    supabase
      .from('zone_hours')
      .select(
        'zone, weekday_open, weekday_close, weekend_closed, weekend_open, weekend_close'
      )
      .order('zone'),
    supabase
      .from('operational_config')
      .select('return_deadline_time, code_expiry_minutes')
      .single(),
  ]);

  if (zoneHoursRes.error || configRes.error || !configRes.data) {
    const ref = crypto.randomUUID();
    logger.error('operational-config GET failed', {
      ref,
      zoneErr: zoneHoursRes.error?.message,
      configErr: configRes.error?.message,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  return NextResponse.json(
    ok({
      zones: (zoneHoursRes.data ?? []).map((z) => ({
        zone: z.zone as Zone,
        weekday_open: toHHMM(z.weekday_open)!,
        weekday_close: toHHMM(z.weekday_close)!,
        weekend_closed: z.weekend_closed,
        weekend_open: toHHMM(z.weekend_open),
        weekend_close: toHHMM(z.weekend_close),
      })),
      return_deadline_time: toHHMM(configRes.data.return_deadline_time)!,
      code_expiry_minutes: configRes.data.code_expiry_minutes,
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

  const { zones, return_deadline_time, code_expiry_minutes } = parsed.data;

  const { error } = await supabase.rpc('update_operational_config', {
    p_zone_hours: zones,
    p_return_deadline_time: return_deadline_time,
    p_code_expiry_minutes: code_expiry_minutes,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped.status === 500) {
      const ref = crypto.randomUUID();
      logger.error('update_operational_config RPC failed', {
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

  return NextResponse.json(
    ok({ zones, return_deadline_time, code_expiry_minutes })
  );
};
