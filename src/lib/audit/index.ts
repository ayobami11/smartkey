import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { Json, UserRole } from '@/types/database';

export type AuditEntryParams = {
  /** The event name — must match the `AuditEvent` union defined in `src/types/`. */
  event: string;
  /** UUID of the user performing the action. */
  actorId: string;
  /** Denormalised role of the actor for query performance. */
  actorRole: UserRole;
  /** The entity type affected (e.g. 'request', 'key', 'profile'). */
  targetType: string;
  /** UUID of the entity affected. */
  targetId: string;
  /** Structured payload — validated by zod schema in the caller before passing here. */
  payload: Json;
};

/**
 * Writes a single, immutable audit log entry.
 *
 * This is a write-only function. The audit log table denies UPDATE and DELETE
 * for all roles including service — once written, an entry is permanent.
 *
 * Audit failures throw so that the calling code can roll back the associated
 * state change. Never silence an audit error.
 *
 * @throws When the database write fails.
 */
export const writeAuditEntry = async (
  params: AuditEntryParams
): Promise<void> => {
  const { event, actorId, actorRole, targetType, targetId, payload } = params;

  // The audit_log table has no INSERT policy for the authenticated role —
  // RLS blocks direct inserts. Use the service-role admin client so the
  // write bypasses RLS (the RPCs do the same via SECURITY DEFINER).
  const supabase = createAdminClient();

  // Denormalise the actor's name and department onto the row, mirroring the
  // `_write_audit` RPC helper so both audit write paths populate the same
  // columns. Captured at write time so the entry preserves who the actor was
  // at the moment of the event — an immutable journal must not be rewritten by
  // a later rename or department move.
  // Name the FK explicitly: `profiles` and `departments` are joined by two
  // relationships (profiles.department_id and departments.hod_id), so an
  // unqualified `departments(name)` embed is ambiguous and PostgREST rejects
  // the whole query — which previously left actor_name/department null.
  const { data: actor, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, units!profiles_unit_id_fkey(name)')
    .eq('id', actorId)
    .maybeSingle();

  if (profileError) {
    // Non-fatal — the audit entry still writes; we just lose the denormalised
    // name. Log so this doesn't silently corrupt the audit log display.
    logger.warn('Could not resolve actor profile for audit entry', {
      event,
      actorId,
      err: profileError.message,
    });
  }

  const { error } = await supabase.from('audit_log').insert({
    event,
    actor_id: actorId,
    actor_role: actorRole,
    actor_name: actor?.full_name ?? null,
    actor_department: actor?.units?.name ?? null,
    target_type: targetType,
    target_id: targetId,
    payload,
  });

  if (error) {
    logger.error('Failed to write audit log entry', {
      event,
      actorId,
      targetType,
      targetId,
      err: error.message,
      code: error.code,
    });

    throw new Error(
      `Audit log write failed for event "${event}": ${error.message}`
    );
  }

  logger.info('Audit entry written', {
    event,
    actorId,
    actorRole,
    targetType,
    targetId,
  });
};
