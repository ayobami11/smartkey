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

  const { error } = await supabase.from('audit_log').insert({
    event,
    actor_id: actorId,
    actor_role: actorRole,
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
