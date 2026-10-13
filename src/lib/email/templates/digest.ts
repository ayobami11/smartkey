import { formatDateTz } from '@/lib/dates';
import {
  markup,
  nDigestRow,
  nDigestTable,
  nGreeting,
  nP,
  nWrapDigest,
} from '@/lib/email/html';
import type { EmailContent } from '@/lib/email/transport';

// Daily digests: built from aggregate stats rather than one request, so the
// digest cron sends them directly rather than through notifications.

export const deanDigestEmail = ({
  fullName,
  stats,
}: {
  fullName: string;
  stats: {
    issued_count: number;
    returned_count: number;
    overdue_count: number;
    weekend_submitted_count: number;
    weekend_pending_count: number;
  };
}): EmailContent => ({
  subject: "Your faculty's daily activity digest",
  html: nWrapDigest(
    markup`
        ${nGreeting(`Good morning, ${fullName}`)}
        ${nP(markup`Faculty activity for the last 24 hours &middot; ${formatDateTz(new Date())}`, 18)}
        ${nDigestTable([
          nDigestRow('Keys issued', stats.issued_count),
          nDigestRow('Keys returned', stats.returned_count),
          nDigestRow('Keys currently overdue', stats.overdue_count, true),
          nDigestRow(
            'Weekend requests submitted',
            stats.weekend_submitted_count
          ),
          nDigestRow(
            'Weekend requests awaiting your decision',
            stats.weekend_pending_count,
            true
          ),
        ])}
      `,
    {
      preferenceNote: true,
      preheader: "Your faculty's activity summary for the last 24 hours.",
    }
  ),
});

export const csoDigestEmail = ({
  fullName,
  stats,
}: {
  fullName: string;
  stats: {
    issued_count: number;
    returned_count: number;
    overdue_count: number;
    high_risk_count: number;
    signature_mismatch_count: number;
    incidents_count: number;
  };
}): EmailContent => ({
  subject: "SmartKey's daily activity digest",
  html: nWrapDigest(
    markup`
        ${nGreeting(`Good morning, ${fullName}`)}
        ${nP(markup`Building-wide activity for the last 24 hours &middot; ${formatDateTz(new Date())}`, 18)}
        ${nDigestTable([
          nDigestRow('Keys issued', stats.issued_count),
          nDigestRow('Keys returned', stats.returned_count),
          nDigestRow('Keys currently overdue', stats.overdue_count, true),
          nDigestRow('High-risk requests', stats.high_risk_count, true),
          nDigestRow(
            'Signature mismatches',
            stats.signature_mismatch_count,
            true
          ),
          nDigestRow('Incidents logged', stats.incidents_count, true),
        ])}
      `,
    {
      preferenceNote: true,
      preheader:
        "SmartKey's building-wide activity summary for the last 24 hours.",
    }
  ),
});
