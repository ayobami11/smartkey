import 'server-only';

import sharp from 'sharp';

export const LOGO_CID = 'smartkey-mark';

// Rasterized once per server process and cached — a static copy of the
// SmartKeyMark SVG (src/components/smartkey/smart-key-mark.tsx) that renders
// in every dashboard sidebar, so the email logo can never drift from the
// in-app one *if kept in sync*. It's inlined as a plain string rather than
// rendered via react-dom/server: Next.js's App Router build graph forbids
// importing react-dom/server from any module reachable from a Route Handler
// ("You're importing a component that imports react-dom/server" — it isn't
// RSC-safe). If smart-key-mark.tsx's markup ever changes, mirror the change
// here. Sharp rasterizes SVG input natively (also used for signature
// verification in src/lib/ai/signature/verifier.ts), and the source SVG has
// no background rect, so the PNG keeps transparency and sits directly on the
// maroon header bar.
const SMART_KEY_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">' +
  '<g transform="translate(24 24) scale(0.8) translate(-24 -24)" stroke-linecap="round">' +
  '<circle cx="19.5" cy="10.5" r="7" fill="none" stroke="#D4A437" stroke-width="4.5"/>' +
  '<rect x="16" y="12" width="7" height="29" rx="3.5" fill="#F4EEE3"/>' +
  '<line x1="20" y1="27" x2="35" y2="15" stroke="#F4EEE3" stroke-width="7"/>' +
  '<line x1="20" y1="27" x2="35" y2="41" stroke="#F4EEE3" stroke-width="7"/>' +
  '<rect x="10" y="31" width="6.5" height="3.6" rx="1.2" fill="#F4EEE3"/>' +
  '<rect x="10" y="37" width="6.5" height="3.6" rx="1.2" fill="#F4EEE3"/>' +
  '</g></svg>';

let cached: Promise<Buffer> | null = null;

export const getLogoAttachment = () => {
  if (!cached) {
    cached = sharp(Buffer.from(SMART_KEY_MARK_SVG))
      .resize(64, 64)
      .png()
      .toBuffer();
  }
  return cached.then((content) => ({
    filename: 'smartkey-mark.png',
    content,
    cid: LOGO_CID,
    contentDisposition: 'inline' as const,
  }));
};
