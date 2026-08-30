import { getLogoAttachment, LOGO_CID } from '@/lib/email/logo';
import { transporter } from '@/lib/email/transporter';

// Africa/Lagos is UTC+1 year-round (no DST), so the WAT hour can be derived
// directly from the UTC hour without a timezone library. Used for the
// "Good morning/afternoon/evening" greeting DESIGN.md itself specifies
// ("Good afternoon, Officer Musa.") instead of a hardcoded time of day.
export const getGreeting = (date = new Date()) => {
  const watHour = (date.getUTCHours() + 1) % 24;
  if (watHour < 12) return 'Good morning';
  if (watHour < 17) return 'Good afternoon';
  return 'Good evening';
};

const FONT_STACK = 'ui-sans-serif,system-ui,sans-serif';

const renderShell = ({
  preheader,
  eyebrow,
  bodyHtml,
  footerNote,
}: {
  preheader: string;
  eyebrow?: string;
  bodyHtml: string;
  footerNote?: string;
}) => `
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;font-family:${FONT_STACK};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" align="center" width="440" cellpadding="0" cellspacing="0" style="width:100%;max-width:440px;">
          <tr>
            <td style="background:#7B1F2D;border-radius:8px 8px 0 0;padding:16px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="cid:${LOGO_CID}" width="24" height="24" alt="SmartKey" style="display:inline-block;vertical-align:middle;border:0;">
                    <span style="display:inline-block;vertical-align:middle;margin-left:8px;color:#fff;font-size:16px;font-weight:600;">SmartKey</span>
                  </td>
                  ${
                    eyebrow
                      ? `<td style="text-align:right;vertical-align:middle;">
                    <span style="color:rgba(255,255,255,0.75);font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">${eyebrow}</span>
                  </td>`
                      : ''
                  }
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
              ${bodyHtml}
            </td>
          </tr>
        </table>
        <table role="presentation" align="center" width="440" cellpadding="0" cellspacing="0" style="width:100%;max-width:440px;">
          <tr>
            <td style="padding:16px 24px 0;text-align:center;">
              <p style="margin:0;color:#94A3B8;font-size:11px;font-family:${FONT_STACK};">
                SmartKey &middot; University of Lagos Senate Building
              </p>
              ${
                footerNote
                  ? `<p style="margin:4px 0 0;color:#94A3B8;font-size:11px;font-family:${FONT_STACK};">${footerNote}</p>`
                  : ''
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;

export const sendBrandedMail = async ({
  to,
  subject,
  preheader,
  eyebrow,
  bodyHtml,
  footerNote,
}: {
  to: string;
  subject: string;
  preheader: string;
  eyebrow?: string;
  bodyHtml: string;
  footerNote?: string;
}) => {
  const logo = await getLogoAttachment();
  return transporter.sendMail({
    from: `"SmartKey" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: renderShell({ preheader, eyebrow, bodyHtml, footerNote }),
    attachments: [logo],
  });
};
