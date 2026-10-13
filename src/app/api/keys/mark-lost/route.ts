import * as z from 'zod';

import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';

const bodySchema = z.object({
  key_id: z.uuid(),
  note: z.string().min(1),
});

// Known follow-up, deliberately not fixed in the route() migration: retiring
// the key and logging the incident are two separate writes, not one
// transaction, so an incident-insert failure leaves a retired key with no
// incident. It belongs in an RPC.
export const POST = route({
  name: 'keys/mark-lost',
  auth: 'user',
  roles: ['CSO'],
  body: bodySchema,
  handler: async ({ supabase, user, body }) => {
    const { key_id, note } = body;

    const { data: key, error: keyError } = await supabase
      .from('keys')
      .select('id, code, status')
      .eq('id', key_id)
      .single();

    if (keyError || !key) return respond.fail(404, 'Key not found');

    if (key.status === 'RETIRED') {
      return respond.fail(409, 'Key is already retired');
    }

    const { error: updateError } = await supabase
      .from('keys')
      .update({ status: 'RETIRED', retired_at: new Date().toISOString() })
      .eq('id', key_id);

    if (updateError) {
      return respond.internal('mark-lost: key update failed', {
        key_id,
        err: updateError.message,
      });
    }

    // Log an incident entry. Do not pass `reference` — the DB generates it
    // atomically via incident_reference_seq to avoid race conditions.
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert({
        logged_by: user.id,
        type: 'MISSING_KEY',
        severity: 'HIGH',
        description: note,
        related_key_id: key_id,
        status: 'OPEN',
        occurred_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (incidentError || !incident) {
      return respond.internal('mark-lost: incident insert failed', {
        key_id,
        err: incidentError?.message,
      });
    }

    return respond.ok({ key_id, incident_id: incident.id });
  },
});
