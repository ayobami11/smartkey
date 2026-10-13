import * as z from 'zod';

import { writeAuditEntry } from '@/lib/audit';
import { fillShiftReport } from '@/lib/ai/reports/generate';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rpcFail } from '@/lib/http/rpc-errors';
import { callRpc } from '@/lib/rpc/call-rpc';
import { createAdminClient } from '@/lib/supabase/admin';

const bodySchema = z.object({
  shift_id: z.uuid(),
});

/** Placeholder marker written by `schedule_pending_shift_report()` and the RPC. */
const PENDING = 'PENDING_GENERATION';

const ALREADY_GENERATED = 'Report already generated for this shift';

export const POST = route({
  name: 'reports/generate',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, user, profile, body }) => {
    const { shift_id } = body;

    // A row may already exist for this shift. The daily `daily-shift-summary`
    // cron job inserts an empty PENDING_GENERATION placeholder, and the
    // `generate_shift_report` RPC refuses any shift that already has a row —
    // so without this branch a scheduled report can never be completed by
    // anyone.
    const { data: existing } = await supabase
      .from('shift_reports')
      .select('id, markdown')
      .eq('shift_id', shift_id)
      .maybeSingle();

    if (existing && existing.markdown !== PENDING) {
      return respond.fail(409, ALREADY_GENERATED);
    }

    let reportId: string;

    if (existing) {
      // Adopt the placeholder. The RPC would raise CONFLICT here, so the audit
      // entry it normally writes is written directly instead — completing a
      // scheduled report is still an initiation and must appear in the log.
      //
      // Known follow-up, deliberately not fixed in the route() migration: the
      // audit entry is written before the report is filled, and its result is
      // not checked.
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
      const result = await callRpc(supabase, 'generate_shift_report', {
        p_shift_id: shift_id,
      });

      if (!result.ok) {
        return rpcFail(result.error, {
          NOT_AUTHENTICATED: 'Not authenticated',
          NOT_FOUND: 'Shift not found',
          CONFLICT: ALREADY_GENERATED,
        });
      }

      if (!result.data.report_id) {
        return respond.internal(
          'generate_shift_report RPC returned no report id'
        );
      }

      reportId = result.data.report_id;
    }

    // Generate the report (Gemini with deterministic template fallback) and
    // persist it. RLS blocks direct UPDATE for authenticated users, so the
    // helper writes through the service-role admin client.
    try {
      const metadata = await fillShiftReport(createAdminClient(), {
        shiftId: shift_id,
        reportId,
      });

      return respond.ok(
        { report_id: reportId, generated_at: metadata.generated_at },
        201
      );
    } catch (error) {
      return respond.internal('Shift report generation failed', {
        shiftId: shift_id,
        reportId,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
