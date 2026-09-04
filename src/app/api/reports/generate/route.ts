import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

import { writeAuditEntry } from '@/lib/audit';
import { fillShiftReport } from '@/lib/ai/reports/generate';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  shift_id: z.uuid(),
});

/** Placeholder marker written by `schedule_pending_shift_report()` and the RPC. */
const PENDING = 'PENDING_GENERATION';

const mapRpcError = (msg: string): { status: number; message: string } => {
  if (msg.includes('NOT_AUTHENTICATED'))
    return { status: 401, message: 'Not authenticated' };
  if (msg.includes('FORBIDDEN')) return { status: 403, message: 'Forbidden' };
  if (msg.includes('NOT_FOUND'))
    return { status: 404, message: 'Shift not found' };
  if (msg.includes('CONFLICT'))
    return { status: 409, message: 'Report already generated for this shift' };
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
    .select('role, unit_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }

  const { shift_id } = parsed.data;

  // A row may already exist for this shift. The daily `daily-shift-summary`
  // cron job inserts an empty PENDING_GENERATION placeholder, and the
  // `generate_shift_report` RPC refuses any shift that already has a row — so
  // without this branch a scheduled report can never be completed by anyone.
  const { data: existing } = await supabase
    .from('shift_reports')
    .select('id, markdown')
    .eq('shift_id', shift_id)
    .maybeSingle();

  if (existing && existing.markdown !== PENDING) {
    return NextResponse.json(
      err('Report already generated for this shift', 409),
      { status: 409 }
    );
  }

  let reportId: string;

  if (existing) {
    // Adopt the placeholder. The RPC would raise CONFLICT here, so the audit
    // entry it normally writes is written directly instead — completing a
    // scheduled report is still an initiation and must appear in the log.
    reportId = existing.id;
    await writeAuditEntry({
      event: 'SHIFT_REPORT_INITIATED',
      actorId: user.id,
      actorRole: profile.role,
      targetType: 'shift_report',
      targetId: reportId,
      payload: { shift_id, adopted_pending_placeholder: true },
    });
  } else {
    // Create the placeholder row via RPC (handles uniqueness + audit entry).
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'generate_shift_report',
      {
        p_shift_id: shift_id,
      }
    );

    if (rpcError) {
      const mapped = mapRpcError(rpcError.message);
      if (mapped.status === 500) {
        const ref = crypto.randomUUID();
        logger.error('generate_shift_report RPC failed', {
          err: rpcError.message,
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

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result?.report_id) {
      const ref = crypto.randomUUID();
      logger.error('generate_shift_report RPC returned empty result', { ref });
      return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
        status: 500,
      });
    }

    reportId = result.report_id;
  }

  // Generate the report (Gemini with deterministic template fallback) and
  // persist it. RLS blocks direct UPDATE for authenticated users, so the
  // helper writes through the service-role admin client.
  try {
    const metadata = await fillShiftReport(createAdminClient(), {
      shiftId: shift_id,
      reportId,
    });

    return NextResponse.json(
      ok({ report_id: reportId, generated_at: metadata.generated_at }),
      { status: 201 }
    );
  } catch (error) {
    const ref = crypto.randomUUID();
    logger.error('Shift report generation failed', {
      ref,
      shiftId: shift_id,
      reportId,
      err: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }
};
