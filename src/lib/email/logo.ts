import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';

import { SmartKeyMark } from '@/components/smartkey/smart-key-mark';

export const LOGO_CID = 'smartkey-mark';

// Rasterized once per server process and cached — the same mark that
// renders in every dashboard sidebar, so the email logo can never drift
// from the in-app one. Sharp rasterizes SVG input natively (also used for
// signature verification in src/lib/ai/signature/verifier.ts), and the
// source SVG has no background rect, so the PNG keeps transparency and
// sits directly on the maroon header bar.
let cached: Promise<Buffer> | null = null;

export const getLogoAttachment = () => {
  if (!cached) {
    const svg = renderToStaticMarkup(SmartKeyMark({}));
    cached = sharp(Buffer.from(svg)).resize(64, 64).png().toBuffer();
  }
  return cached.then((content) => ({
    filename: 'smartkey-mark.png',
    content,
    cid: LOGO_CID,
    contentDisposition: 'inline' as const,
  }));
};
