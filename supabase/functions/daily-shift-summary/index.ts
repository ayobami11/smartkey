import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Service-role client — bypasses RLS so it can insert into shift_reports
// and audit_log without a user session.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async () => {
  // Find the most recent shift that does not yet have a report.
  const { data: shifts, error: shiftError } = await supabase
    .from('shifts')
    .select('id')
    .not('id', 'in', supabase.from('shift_reports').select('shift_id'))
    .order('started_at', { ascending: false })
    .limit(1);

  if (shiftError) {
    console.error(
      JSON.stringify({
        event: 'daily_summary_failed',
        error: shiftError.message,
      })
    );
    return new Response(JSON.stringify({ error: shiftError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!shifts || shifts.length === 0) {
    console.log(
      JSON.stringify({
        event: 'daily_summary_skipped',
        reason: 'no_unreported_shift',
      })
    );
    return new Response(
      JSON.stringify({ skipped: true, reason: 'no_unreported_shift' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const shiftId: string = shifts[0].id;

  // Insert a pending placeholder. The actual Gemini call happens when the CSO
  // opens the report in their dashboard (POST /api/reports/generate).
  const { data: report, error: insertError } = await supabase
    .from('shift_reports')
    .insert({
      shift_id: shiftId,
      markdown: 'PENDING_GENERATION',
      timeline: [],
      metadata: {
        scheduled_by: 'edge_function',
        scheduled_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (insertError) {
    // UNIQUE violation means a report already exists — that's fine.
    if (insertError.code === '23505') {
      console.log(
        JSON.stringify({
          event: 'daily_summary_skipped',
          reason: 'report_already_exists',
          shift_id: shiftId,
        })
      );
      return new Response(
        JSON.stringify({ skipped: true, reason: 'report_already_exists' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    console.error(
      JSON.stringify({
        event: 'daily_summary_failed',
        error: insertError.message,
        shift_id: shiftId,
      })
    );
    return new Response(JSON.stringify({ error: insertError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Write audit entry. Service-role bypasses the INSERT-only RLS on audit_log.
  const { data: cso } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'CSO')
    .eq('status', 'ACTIVE')
    .order('created_at')
    .limit(1)
    .single();

  if (cso) {
    await supabase.from('audit_log').insert({
      event: 'SHIFT_REPORT_SCHEDULED',
      actor_id: cso.id,
      actor_role: 'CSO',
      target_type: 'shift',
      target_id: shiftId,
      payload: { report_id: report.id, scheduled_by: 'edge_function' },
    });
  }

  console.log(
    JSON.stringify({
      event: 'daily_summary_created',
      shift_id: shiftId,
      report_id: report.id,
    })
  );

  return new Response(
    JSON.stringify({ shift_id: shiftId, report_id: report.id }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
