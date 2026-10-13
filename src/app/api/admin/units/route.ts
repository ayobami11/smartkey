import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';

export const GET = route({
  name: 'admin/units',
  auth: 'user',
  roles: ['CSO'],
  handler: async ({ supabase }) => {
    const { data, error } = await supabase
      .from('units')
      .select(
        'id, name, faculty, hod_id, authoriser, hod:profiles!hod_id(status)'
      )
      .order('faculty', { ascending: true })
      .order('name', { ascending: true });

    if (error) return respond.fail(500, 'Failed to fetch units');

    // Copy-level availability from the shared occupancy rule, so a
    // twelve-copy room with three out still counts as having a slot, and a
    // key reserved by a live code does not. keys.status cannot express
    // either. get_key_occupancy is set-returning, so it is read here as a
    // query rather than through callRpc (which unwraps a single row).
    const { data: occupancy, error: occupancyError } =
      await supabase.rpc('get_key_occupancy');

    if (occupancyError) {
      return respond.internal('admin/units get_key_occupancy failed', {
        err: occupancyError.message,
      });
    }

    const unitsWithSlot = new Set(
      (occupancy ?? [])
        .filter((row) => row.available > 0)
        .map((row) => row.unit_id)
    );

    const units = (data ?? []).map(({ hod, hod_id, ...dept }) => ({
      ...dept,
      hod_id,
      // true when an ACTIVE Dean is already assigned — the provisioning
      // dialog disables this unit in the Dean role picker
      has_hod:
        hod_id !== null &&
        (hod as { status: string } | null)?.status === 'ACTIVE',
      // true when at least one copy of a non-retired key in this unit is
      // free right now (get_key_occupancy available > 0)
      has_slot_today: unitsWithSlot.has(dept.id),
    }));

    return respond.ok({ units });
  },
});
