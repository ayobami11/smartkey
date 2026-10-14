import { csoDigestEmail, deanDigestEmail } from '@/lib/email/templates/digest';
import { gmailTransport } from '@/lib/email/transport';
import { respond } from '@/lib/http/respond';
import { route } from '@/lib/http/route';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

type DigestStats = {
  issued_count: number;
  returned_count: number;
  overdue_count: number;
  weekend_submitted_count: number;
  weekend_pending_count: number;
  high_risk_count: number;
  signature_mismatch_count: number;
  incidents_count: number;
};

const isDeanQuiet = (s: DigestStats) =>
  s.issued_count === 0 &&
  s.returned_count === 0 &&
  s.overdue_count === 0 &&
  s.weekend_submitted_count === 0 &&
  s.weekend_pending_count === 0;

const isCsoQuiet = (s: DigestStats) =>
  s.issued_count === 0 &&
  s.returned_count === 0 &&
  s.overdue_count === 0 &&
  s.high_risk_count === 0 &&
  s.signature_mismatch_count === 0 &&
  s.incidents_count === 0;

export const POST = route({
  name: 'daily-digest',
  auth: 'cron',
  handler: async () => {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, role, unit_id, full_name, institutional_email')
      .in('role', ['DEAN', 'CSO'])
      .eq('status', 'ACTIVE');

    if (profilesError) {
      return respond.internal('daily-digest: profiles query failed', {
        err: profilesError.message,
      });
    }

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: prefs } = ids.length
      ? await admin
          .from('notification_preferences')
          .select('profile_id, digest_email')
          .in('profile_id', ids)
      : { data: [] as { profile_id: string; digest_email: boolean }[] };

    const prefByProfile = new Map((prefs ?? []).map((p) => [p.profile_id, p]));
    // digest_email defaults false — absence of a row is NOT an opt-in.
    const optedIn = (profiles ?? []).filter(
      (p) => prefByProfile.get(p.id)?.digest_email === true
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let csoStats: DigestStats | null = null;

    for (const profile of optedIn) {
      if (!profile.institutional_email) {
        skipped += 1;
        continue;
      }

      try {
        if (profile.role === 'CSO') {
          if (!csoStats) {
            const { data, error } = await admin.rpc('get_digest_stats', {
              p_since: since,
            });
            if (error) throw error;
            csoStats = (Array.isArray(data) ? data[0] : data) as DigestStats;
          }
          if (isCsoQuiet(csoStats)) {
            skipped += 1;
            continue;
          }
          await gmailTransport.send({
            to: profile.institutional_email,
            ...csoDigestEmail({ fullName: profile.full_name, stats: csoStats }),
          });
          sent += 1;
        } else {
          if (!profile.unit_id) {
            skipped += 1;
            continue;
          }
          const { data, error } = await admin.rpc('get_digest_stats', {
            p_unit_id: profile.unit_id,
            p_since: since,
          });
          if (error) throw error;
          const stats = (Array.isArray(data) ? data[0] : data) as DigestStats;
          if (isDeanQuiet(stats)) {
            skipped += 1;
            continue;
          }
          await gmailTransport.send({
            to: profile.institutional_email,
            ...deanDigestEmail({ fullName: profile.full_name, stats }),
          });
          sent += 1;
        }
      } catch (e) {
        logger.error('daily-digest: send failed', {
          profileId: profile.id,
          role: profile.role,
          err: e instanceof Error ? e.message : String(e),
        });
        failed += 1;
      }
    }

    return respond.ok({ sent, skipped, failed });
  },
});
