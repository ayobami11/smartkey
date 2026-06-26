import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

const bodySchema = z.object({
  full_name: z.string().trim().min(1),
  department_id: z.uuid().optional(),
});

// Roles that belong to a department; only these may have department_id set.
const DEPARTMENTAL_ROLES = ['DEAN', 'REQUESTER'] as const;

// CSO-only: edit an existing user's name and (for departmental roles) department.
// Email is immutable here — it is the auth identity and chain-of-trust anchor —
// and role cannot change. Both are deliberately out of scope.
export const PATCH = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

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
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(err('Invalid request body', 422), { status: 422 });
  }
  const { full_name } = parsed.data;

  // Fetch the target's current state so we can validate the change and record a
  // before/after in the audit entry.
  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, role, full_name, department_id')
    .eq('id', id)
    .single();

  if (fetchError || !target) {
    return NextResponse.json(err('User not found', 404), { status: 404 });
  }

  const isDepartmental = (DEPARTMENTAL_ROLES as readonly string[]).includes(
    target.role
  );

  // Department only applies to HOD and REQUESTER. For those roles it is
  // required; for VERIFIER/CSO any supplied value is ignored.
  let nextDepartmentId = target.department_id;
  if (isDepartmental) {
    if (!parsed.data.department_id) {
      return NextResponse.json(
        err('Department is required for this role', 422),
        { status: 422 }
      );
    }
    nextDepartmentId = parsed.data.department_id;
  }

  const adminClient = createAdminClient();

  const departmentChanged =
    isDepartmental && nextDepartmentId !== target.department_id;

  // Validate the destination department exists, and — for an HOD moving
  // departments — that the destination does not already have a different HOD.
  if (departmentChanged) {
    const { data: dept } = await adminClient
      .from('departments')
      .select('id')
      .eq('id', nextDepartmentId!)
      .maybeSingle();
    if (!dept) {
      return NextResponse.json(err('Department not found', 422), {
        status: 422,
      });
    }

    if (target.role === 'DEAN') {
      const { data: existingHod } = await adminClient
        .from('profiles')
        .select('id')
        .eq('role', 'DEAN')
        .eq('department_id', nextDepartmentId!)
        .neq('id', id)
        .neq('status', 'DEACTIVATED')
        .maybeSingle();
      if (existingHod) {
        return NextResponse.json(
          err('That department already has an HOD', 409),
          { status: 409 }
        );
      }
    }
  }

  const updates: { full_name: string; department_id?: string } = { full_name };
  if (isDepartmental) updates.department_id = nextDepartmentId!;

  const { error: updateError } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id);

  if (updateError) {
    const ref = crypto.randomUUID();
    logger.error('edit user: profile update failed', {
      id,
      err: updateError.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  // Keep the departments.hod_id reverse link consistent when an HOD moves.
  if (departmentChanged && target.role === 'DEAN') {
    const { error: clearError } = await adminClient
      .from('departments')
      .update({ hod_id: null })
      .eq('hod_id', id);
    const { error: setError } = await adminClient
      .from('departments')
      .update({ hod_id: id })
      .eq('id', nextDepartmentId!);
    if (clearError || setError) {
      // Non-fatal: the profile is already updated. Log so a stale hod_id can be
      // corrected if this ever fails.
      logger.error('edit user: syncing departments.hod_id failed', {
        id,
        err: (clearError ?? setError)?.message,
      });
    }
  }

  // Record only what actually changed.
  const changes: Record<string, { from: string | null; to: string | null }> =
    {};
  if (target.full_name !== full_name) {
    changes.full_name = { from: target.full_name, to: full_name };
  }
  if (departmentChanged) {
    changes.department_id = {
      from: target.department_id,
      to: nextDepartmentId,
    };
  }

  try {
    await writeAuditEntry({
      event: 'USER_UPDATED',
      actorId: user.id,
      actorRole: 'CSO',
      targetType: 'profile',
      targetId: id,
      payload: { updated_by: user.id, changes },
    });
  } catch (auditErr) {
    logger.error('edit user: audit write failed', {
      err: String(auditErr),
      id,
    });
  }

  return NextResponse.json(
    ok({ profile_id: id, full_name, department_id: nextDepartmentId }),
    { status: 200 }
  );
};
