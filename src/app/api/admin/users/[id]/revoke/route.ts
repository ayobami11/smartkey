import { NextRequest, NextResponse } from 'next/server';

import { writeAuditEntry } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { err, ok } from '@/types/api';

export const PATCH = async (
  _request: NextRequest,
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
    .select('role, department_id')
    .eq('id', user.id)
    .single();
  if (!profile)
    return NextResponse.json(err('Unauthorized', 401), { status: 401 });
  if (profile.role !== 'CSO')
    return NextResponse.json(err('Forbidden', 403), { status: 403 });

  // Fetch the target profile.
  const { data: target, error: fetchError } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fetchError || !target) {
    return NextResponse.json(err('User not found', 404), { status: 404 });
  }

  if (target.status === 'DEACTIVATED') {
    return NextResponse.json(err('User is already deactivated', 409), {
      status: 409,
    });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ status: 'DEACTIVATED' })
    .eq('id', id);

  if (updateError) {
    const ref = crypto.randomUUID();
    logger.error('revoke: profile update failed', {
      id,
      err: updateError.message,
      ref,
    });
    return NextResponse.json(err(`Internal error. Ref: ${ref}`, 500), {
      status: 500,
    });
  }

  const adminClient = createAdminClient();

  // If this user is the current HOD of any department, clear the reverse link so
  // the department (and its key inventory) no longer resolves a deactivated HOD.
  const { error: deptError } = await adminClient
    .from('departments')
    .update({ hod_id: null })
    .eq('hod_id', id);
  if (deptError) {
    // Non-fatal: the profile is already DEACTIVATED and login is blocked. Log so
    // a stale departments.hod_id can be corrected if this ever fails.
    logger.error('revoke: clearing departments.hod_id failed', {
      id,
      err: deptError.message,
    });
  }

  // Ban the auth user so they cannot log in again. We use ban_duration rather
  // than deleteUser so the profiles row (and all audit history) is preserved.
  const { error: banError } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: '876000h', // ~100 years — effectively permanent
  });
  if (banError) {
    logger.error('revoke: auth ban failed', { id, err: banError.message });
    // Non-fatal — profile is already DEACTIVATED; RLS will block data access.
  }

  try {
    await writeAuditEntry({
      event: 'USER_DEACTIVATED',
      actorId: user.id,
      actorRole: 'CSO',
      targetType: 'profile',
      targetId: id,
      payload: { deactivated_by: user.id },
    });
  } catch (auditErr) {
    logger.error('revoke: audit write failed', { err: String(auditErr), id });
  }

  return NextResponse.json(ok({ profile_id: id, status: 'DEACTIVATED' }), {
    status: 200,
  });
};
