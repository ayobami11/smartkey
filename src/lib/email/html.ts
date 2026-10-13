// Shared with logo.ts, which attaches the image under this content id. Kept
// here so templates stay importable without sharp or 'server-only'.
export const LOGO_CID = 'smartkey-mark';

// ---------------------------------------------------------------------------
// Safe HTML for email templates.
//
// `markup` is a tagged template that escapes every interpolated value unless
// it is already an HtmlFragment (the output of `markup` itself, or of a
// helper below). A plain string — a requester's name, a guest's free-text
// room, a Dean's note — can therefore never reach an email as markup:
// forgetting to escape is not possible, because there is no unescaped path
// for a string.
//
// HtmlFragment is a class rather than a branded string so the distinction
// survives at runtime; that is what lets `markup` tell markup from text.
//
// The tag is deliberately not named `html`: Prettier reformats the body of
// any html`` template as HTML, which would rewrite the whitespace of every
// email on save.
// ---------------------------------------------------------------------------

export class HtmlFragment {
  constructor(private readonly value: string) {}
  toString() {
    return this.value;
  }
}

export type HtmlValue =
  | HtmlFragment
  | string
  | number
  | null
  | undefined
  | false
  | readonly HtmlValue[];

// Every attribute in these templates is double-quoted, so `'` needs no
// escaping; leaving it alone keeps constant font stacks byte-identical.
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (ch) => ESCAPES[ch]);

const render = (value: HtmlValue): string => {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof HtmlFragment) return value.toString();
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
};

export const markup = (
  strings: TemplateStringsArray,
  ...values: HtmlValue[]
): HtmlFragment =>
  new HtmlFragment(
    strings.reduce(
      (out, part, i) =>
        out + part + (i < values.length ? render(values[i]) : ''),
      ''
    )
  );

// Trusted markup only — module-internal constants such as entity runs.
// Never pass data through this.
const raw = (trusted: string) => new HtmlFragment(trusted);

// ---------------------------------------------------------------------------
// Design tokens and layout helpers. Mirrors design-system/DESIGN.md (maroon
// primary, gold accent, status colours) with email-safe font stacks standing
// in for Fraunces/DM Sans/JetBrains Mono — no external webfonts, since most
// inboxes (Outlook desktop and Gmail included) never load them. The header
// carries the real SmartKeyMark logo (src/lib/email/logo.ts) alongside the
// text wordmark, not instead of it — inline <svg> is unreliable in email
// clients, but a raster image sent as a cid attachment (getLogoAttachment)
// is standard practice and renders in Gmail, Outlook, and Apple Mail alike;
// the wordmark stays as real text so the header still reads with images off.
// ---------------------------------------------------------------------------

type Tone = 'success' | 'warning' | 'error' | 'info' | 'guest';

const N = {
  envelope: '#EEF2F6',
  border: '#E4E9EF',
  ink: '#0F172A',
  body: '#475569',
  faint: '#94A3B8',
  maroon: '#7B1F2D',
  gold: '#D4A437',
  success: '#10B981',
  successSoft: '#ECFDF5',
  successText: '#047857',
  warning: '#F59E0B',
  warningSoft: '#FFF7E6',
  warningText: '#B45309',
  error: '#DC2626',
  errorSoft: '#FEF2F2',
  errorText: '#B91C1C',
  info: '#3B82F6',
  infoSoft: '#EFF6FF',
  infoText: '#1D4ED8',
  guest: '#0E7490',
  guestSoft: '#CFFAFE',
};

const F_SERIF = `Georgia, 'Times New Roman', Times, serif`;
const F_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const F_MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace`;

// Padding after the visible preheader text: a run of zero-width joiners
// (each preceded by a non-breaking space so clients don't collapse them)
// stops the inbox preview from bleeding into the email's first visible line.
const PREHEADER_PAD = raw('&nbsp;&zwnj;'.repeat(40));

const nLogoMark = (size: number) =>
  markup`<img src="cid:${LOGO_CID}" width="${size}" height="${size}" alt="SmartKey" style="display:inline-block;vertical-align:middle;border:0;margin-right:9px;">`;

// nHeader, nDigestHeader, and nFooter each return bare <tr> rows, not a
// nested <table> of their own — a nested table set to width:100% is one of
// the least reliable things in HTML email rendering; plenty of clients
// shrink it to its content's intrinsic width instead of stretching it to
// fill the parent cell, which is exactly what made the maroon header render
// narrower than the white body below it. Returning rows directly means they
// become rows of nDoc's own fixed-width (480px) table, so their background
// always spans the true column width — nothing left to shrink.
const nHeader = () => markup`
  <tr><td style="background:${N.maroon};border-radius:12px 12px 0 0;padding:26px 30px 22px;">
    <div>${nLogoMark(26)}<span style="font-family:${F_SERIF};font-weight:700;font-size:21px;color:#ffffff;letter-spacing:0.01em;vertical-align:middle;">SmartKey</span></div>
    <div style="font-family:${F_SANS};font-size:9.5px;letter-spacing:0.15em;text-transform:uppercase;color:${N.gold};margin-top:6px;">Senate Building &middot; University of Lagos</div>
  </td></tr>
  <tr><td style="height:3px;line-height:3px;font-size:0;background:${N.gold};">&nbsp;</td></tr>
`;

const nDigestHeader = () => markup`
  <tr><td style="background:${N.maroon};border-radius:12px 12px 0 0;padding:20px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <div>${nLogoMark(20)}<span style="font-family:${F_SERIF};font-weight:700;font-size:18px;color:#ffffff;vertical-align:middle;">SmartKey</span></div>
      </td>
      <td style="text-align:right;vertical-align:middle;">
        <span style="font-family:${F_SANS};font-size:9.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${N.gold};">Daily digest</span>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:3px;line-height:3px;font-size:0;background:${N.gold};">&nbsp;</td></tr>
`;

const nFooter = (opts: { preferenceNote?: boolean } = {}) => markup`
  <tr><td style="background:#FAFBFC;border-left:1px solid ${N.border};border-right:1px solid ${N.border};border-bottom:1px solid ${N.border};border-radius:0 0 12px 12px;padding:20px 30px 22px;text-align:center;">
    <p style="margin:0 0 3px;font-family:${F_SERIF};font-size:13px;color:${N.ink};font-weight:600;">SmartKey</p>
    <p style="margin:0 0 12px;font-family:${F_SANS};font-size:10.5px;color:${N.faint};letter-spacing:0.02em;">Key management for the Senate Building</p>
    ${
      opts.preferenceNote
        ? markup`<p style="margin:0 0 8px;font-family:${F_SANS};font-size:11px;color:${N.faint};">You can turn this off in Settings &rarr; Notifications.</p>`
        : ''
    }
    <p style="margin:0;font-family:${F_SANS};font-size:10px;color:${N.faint};">University of Lagos &nbsp;&middot;&nbsp; Automated message, please do not reply directly.</p>
  </td></tr>
`;

export type DocOptions = {
  // Plain text: escaped like any other value.
  preheader?: string;
  preferenceNote?: boolean;
};

const nDoc = (
  headerFn: () => HtmlFragment,
  contentInner: HtmlFragment,
  opts: DocOptions = {}
) => markup`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}</style>
</head>
<body style="margin:0;background:${N.envelope};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${
    opts.preheader
      ? markup`<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${N.envelope};opacity:0;">${opts.preheader}${PREHEADER_PAD}</div>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${N.envelope};">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;border-collapse:collapse;">
        ${headerFn()}
        <tr><td style="background:#ffffff;border-left:1px solid ${N.border};border-right:1px solid ${N.border};padding:30px 30px 26px;">
          ${contentInner}
        </td></tr>
        ${nFooter(opts)}
      </table>
    </td></tr>
  </table>
</body></html>`;

export const nWrap = (inner: HtmlFragment, opts?: DocOptions) =>
  nDoc(nHeader, inner, opts);

export const nWrapDigest = (inner: HtmlFragment, opts?: DocOptions) =>
  nDoc(nDigestHeader, inner, opts);

// Text parameters below take HtmlValue: a plain string is escaped, a
// markup`` fragment (for inline <strong> or an entity) is kept as markup.

export const nEyebrow = (text: HtmlValue) =>
  markup`<p style="margin:0 0 7px;font-family:${F_SANS};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${N.maroon};">${text}</p>`;

export const nGreeting = (text: HtmlValue) =>
  markup`<p style="margin:0 0 16px;font-family:${F_SERIF};font-size:21px;font-weight:600;color:${N.ink};line-height:1.3;">${text}</p>`;

export const nP = (text: HtmlValue, mb = 16) =>
  markup`<p style="margin:0 0 ${mb}px;font-family:${F_SANS};font-size:14px;line-height:1.65;color:${N.body};">${text}</p>`;

export const nBtn = (label: HtmlValue, href: string) => markup`
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 20px;"><tr>
    <td style="border-radius:8px;background:${N.maroon};">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${F_SANS};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">${label}</a>
    </td>
  </tr></table>
`;

export const nSecondary = (label: HtmlValue, href: string) =>
  markup`<a href="${href}" style="font-family:${F_SANS};font-size:13px;font-weight:600;color:${N.maroon};text-decoration:underline;">${label}</a>`;

const badgeColours: Record<Tone, [string, string, string]> = {
  success: [N.successSoft, N.successText, N.success],
  warning: [N.warningSoft, N.warningText, N.warning],
  error: [N.errorSoft, N.errorText, N.error],
  info: [N.infoSoft, N.infoText, N.info],
  guest: [N.guestSoft, N.guest, N.guest],
};

export const nBadge = (label: HtmlValue, tone: Tone) => {
  const [bg, text, dot] = badgeColours[tone];
  return markup`
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>
      <td style="padding:6px 12px 6px 10px;background:${bg};border-radius:999px;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${dot};margin-right:7px;"></span>
        <span style="font-family:${F_SANS};font-size:11px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:${text};vertical-align:middle;">${label}</span>
      </td>
    </tr></table>
  `;
};

// Same visual as nBadge, but without the trailing margin, for placing inline
// next to another badge (e.g. the guest badge on the guest-approved email).
export const nInlineBadge = (label: HtmlValue, tone: Tone) =>
  raw(
    nBadge(label, tone)
      .toString()
      .replace(
        'style="margin:0 0 16px;"',
        'style="display:inline-table;margin:0 0 0 6px;"'
      )
  );

export const nCodePanel = (code: HtmlValue, caption: HtmlValue) => markup`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:2px 0 20px;background:#FAFAFB;border:1px solid ${N.border};border-radius:10px;">
    <tr><td style="padding:22px 24px;text-align:center;">
      <div style="font-family:${F_MONO};font-size:38px;font-weight:700;letter-spacing:9px;color:${N.ink};">${code}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px auto 0;"><tr>
        <td style="padding:4px 12px;border-radius:999px;background:${N.warningSoft};">
          <span style="font-family:${F_SANS};font-size:11.5px;font-weight:600;color:${N.warningText};">${caption}</span>
        </td>
      </tr></table>
    </td></tr>
  </table>
`;

export const nNote = (text: HtmlValue) => markup`
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 18px;"><tr>
    <td style="border-left:3px solid ${N.maroon};background:#FAFAFB;padding:12px 16px;border-radius:0 6px 6px 0;">
      <span style="font-family:${F_SERIF};font-style:italic;font-size:13.5px;color:${N.body};line-height:1.6;">&ldquo;${text}&rdquo;</span>
    </td>
  </tr></table>
`;

export const nSmallLabel = (text: HtmlValue) =>
  markup`<p style="margin:0 0 6px;font-family:${F_SANS};font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${N.faint};">${text}</p>`;

export const nDetailRow = (
  label: HtmlValue,
  value: HtmlValue,
  emph = false
) => markup`
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid ${N.border};font-family:${F_SANS};font-size:11px;color:${N.faint};text-transform:uppercase;letter-spacing:0.06em;">${label}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${N.border};font-family:${F_SANS};font-size:13.5px;font-weight:600;color:${emph ? N.error : N.ink};text-align:right;">${value}</td>
  </tr>
`;

export const nDetailPanel = (rows: HtmlValue) =>
  markup`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">${rows}</table>`;

export const nMismatchRow = (label: HtmlValue, pct: number) => markup`
  <tr>
    <td style="padding:8px 0;font-family:${F_SANS};font-size:13px;color:${N.body};">${label}</td>
    <td style="padding:8px 0;font-family:${F_MONO};font-size:13px;font-weight:700;color:${N.error};text-align:right;">${pct}%</td>
  </tr>
`;

export const nMismatchPanel = (rows: HtmlValue) =>
  markup`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;background:#FAFAFB;border:1px solid ${N.border};border-radius:10px;"><tr><td style="padding:6px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
            ${rows}
          </table>
        </td></tr></table>`;

export const nDigestRow = (
  label: HtmlValue,
  value: number,
  attention = false
) => markup`
  <tr>
    <td style="padding:11px 0;border-bottom:1px solid ${N.border};font-family:${F_SANS};font-size:13.5px;color:${N.body};">
      ${attention && value > 0 ? markup`<span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${N.error};margin-right:8px;"></span>` : ''}${label}
    </td>
    <td style="padding:11px 0;border-bottom:1px solid ${N.border};font-family:${F_MONO};font-size:14px;font-weight:700;color:${attention && value > 0 ? N.error : N.ink};text-align:right;">${value}</td>
  </tr>
`;

export const nDigestTable = (rows: HtmlValue) =>
  markup`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">
          ${rows}
        </table>`;

export const nGuestBadge = () =>
  markup`<span style="display:inline-block;background:${N.guestSoft};color:${N.guest};font-size:10.5px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;padding:2px 9px;border-radius:9999px;vertical-align:middle;">External</span>`;
