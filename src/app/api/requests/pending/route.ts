import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { rewriteStorageUrls } from '@/lib/storage/object-url';

// Weekend requests awaiting a decision, scoped to the caller: a Dean gets
// their own faculty's (keyed or guest), the CSO gets the Administration-routed
// ones. RLS already scopes a Dean's read; the filter below narrows both roles
// to the requests they are the authoriser for.
export const GET = route({
  name: 'requests/pending',
  auth: 'user',
  roles: ['DEAN', 'CSO'],
  handler: async ({ supabase, profile }) => {
    const { data: requests, error } = await supabase
      .from('requests')
      .select(
        `
      id,
      type,
      status,
      requested_for,
      return_deadline,
      risk_tier,
      risk_factors,
      created_at,
      letter_url,
      stamp_url,
      requested_room,
      requested_unit_id,
      requester:profiles!requester_id(id, full_name, photo_url, institutional_email),
      guest:guest_requesters!guest_id(id, full_name, email, phone, id_document_type, id_document_number),
      key:keys!key_id(id, code, room_name, zone, department:units!unit_id(id, name, authoriser)),
      requested_department:units!requested_unit_id(id, name, authoriser)
    `
      )
      .eq('status', 'PENDING_HOD')
      .order('created_at', { ascending: true });

    if (error) {
      return respond.internal('requests/pending: query failed', {
        err: error.message,
      });
    }

    const all = requests ?? [];
    const filtered =
      profile.role === 'DEAN'
        ? all.filter((r) => {
            const keyDeptId = r.key?.department?.id;
            const requestedDeptId = r.requested_department?.id;
            return (
              (keyDeptId && keyDeptId === profile.unit_id) ||
              (requestedDeptId && requestedDeptId === profile.unit_id)
            );
          })
        : all.filter(
            (r) =>
              r.key?.department?.authoriser === 'CSO' ||
              r.requested_department?.authoriser === 'CSO'
          );

    return respond.ok(rewriteStorageUrls({ requests: filtered }));
  },
});
