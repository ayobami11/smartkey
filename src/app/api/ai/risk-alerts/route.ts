import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';

export const GET = route({
  name: 'ai/risk-alerts',
  auth: 'user',
  roles: ['CSO'],
  handler: async ({ supabase }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('requests')
      .select(
        `id, type, status, requested_for, risk_tier, risk_factors, created_at,
       requester:profiles!requester_id(id, full_name, institutional_email),
       key:keys!key_id(id, code, room_name, zone)`
      )
      .eq('risk_tier', 'HIGH')
      .in('status', ['CODE_ISSUED', 'KEY_ISSUED'])
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) return respond.fail(500, 'Failed to fetch risk alerts');

    return respond.ok({ alerts: data ?? [] });
  },
});
