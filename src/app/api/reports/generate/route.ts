import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { generateShiftReport } from '@/lib/ai/reports/client';
import type { ReportEvent } from '@/lib/ai/reports/types';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  shift_id: z.uuid(),
});

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
    .select('role, department_id')
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

  // Create the placeholder shift_reports row via RPC (handles uniqueness + audit entry).
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

  const reportId: string = result.report_id;

  // Fetch the shift's audit events to feed the report generator.
  const { data: shift } = await supabase
    .from('shifts')
    .select('started_at')
    .eq('id', shift_id)
    .single();

  const { data: events } = await supabase
    .from('audit_log')
    .select('event, actor_role, target_type, target_id, payload, occurred_at')
    .gte('occurred_at', shift?.started_at ?? new Date(0).toISOString())
    .order('occurred_at', { ascending: true });

  // Generate the report (Gemini with deterministic template fallback) and derive
  // the summary counts. See src/lib/ai/reports/.
  const report = await generateShiftReport(
    shift_id,
    (events ?? []) as ReportEvent[]
  );

  // Persist the generated content. RLS blocks direct UPDATE for authenticated
  // users — use the service-role admin client so this write succeeds.
  const adminClient = createAdminClient();
  await adminClient
    .from('shift_reports')
    .update({
      markdown: report.markdown,
      timeline: report.timeline as never,
      metadata: report.metadata as never,
    })
    .eq('id', reportId);

  return NextResponse.json(
    ok({ report_id: reportId, generated_at: report.metadata.generated_at }),
    { status: 201 }
  );
};
