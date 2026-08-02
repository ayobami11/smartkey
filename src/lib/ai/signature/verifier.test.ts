import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { DEFAULT_THRESHOLD, verifySignature } from './verifier';

const W = 800;
const H = 400;

// Render a signature-like ink stroke on a white page.
//
// The earlier version of this suite compared solid rectangular blocks covering
// 10–50% of the canvas. That validated the arithmetic but not the domain: real
// signatures are thin strokes covering ~1.6% of the page, a coverage level no
// block fixture reached, which is why the suite passed while the verifier let
// every forgery through. These fixtures have realistic ink coverage.
const strokeImage = (
  path: string,
  { dx = 0, dy = 0, width = 6, scale = 1 } = {}
): Promise<Buffer> =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
         <rect width="100%" height="100%" fill="white"/>
         <g transform="translate(${dx},${dy}) scale(${scale})">
           <path d="${path}" stroke="black" stroke-width="${width}"
                 fill="none" stroke-linecap="round"/>
         </g>
       </svg>`
    )
  )
    .png()
    .toBuffer();

// Two visually distinct signatures.
const SIG_A =
  'M60,260 C120,120 180,300 240,200 S360,80 420,240 C480,340 540,160 600,220 L740,190';
const SIG_B =
  'M80,180 C140,320 200,120 260,280 S380,340 440,160 C500,60 560,300 620,180 L720,260';

const blankPage = () =>
  sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();

describe('verifySignature', () => {
  it('passes an identical image with a near-zero mismatch', async () => {
    const img = await strokeImage(SIG_A);
    const result = await verifySignature(img, img);
    expect(result.mismatch_ratio).toBeCloseTo(0, 5);
    expect(result.passed).toBe(true);
  });

  it('passes the same signature scanned at a different position', async () => {
    // Bounding-box registration should absorb the offset entirely. Without it
    // a 20px shift scores ~97% — worse than an outright forgery.
    const ref = await strokeImage(SIG_A);
    const sub = await strokeImage(SIG_A, { dx: 20, dy: 14 });
    const result = await verifySignature(ref, sub);
    expect(result.mismatch_ratio).toBeLessThan(DEFAULT_THRESHOLD);
    expect(result.passed).toBe(true);
  });

  it('passes the same signature written with a heavier pen', async () => {
    const ref = await strokeImage(SIG_A);
    const sub = await strokeImage(SIG_A, { width: 9 });
    const result = await verifySignature(ref, sub);
    expect(result.mismatch_ratio).toBeLessThan(DEFAULT_THRESHOLD);
    expect(result.passed).toBe(true);
  });

  it('passes the same signature at a slightly different scale', async () => {
    const ref = await strokeImage(SIG_A);
    const sub = await strokeImage(SIG_A, { scale: 0.85, dx: 30 });
    const result = await verifySignature(ref, sub);
    expect(result.mismatch_ratio).toBeLessThan(DEFAULT_THRESHOLD);
    expect(result.passed).toBe(true);
  });

  // The regression guard. Whole-canvas scoring gave this ~3% and passed it.
  it('rejects a completely different signature', async () => {
    const ref = await strokeImage(SIG_A);
    const sub = await strokeImage(SIG_B);
    const result = await verifySignature(ref, sub);
    expect(result.mismatch_ratio).toBeGreaterThan(DEFAULT_THRESHOLD);
    expect(result.passed).toBe(false);
  });

  it('rejects a blank page submitted against a real reference', async () => {
    const ref = await strokeImage(SIG_A);
    const sub = await blankPage();
    const result = await verifySignature(ref, sub);
    expect(result.passed).toBe(false);
  });

  it('rejects a real submission against a blank reference', async () => {
    const ref = await blankPage();
    const sub = await strokeImage(SIG_A);
    const result = await verifySignature(ref, sub);
    expect(result.passed).toBe(false);
  });

  it('separates genuine variation from substitution by a clear margin', async () => {
    const ref = await strokeImage(SIG_A);
    const genuine = await verifySignature(
      ref,
      await strokeImage(SIG_A, { width: 9 })
    );
    const forged = await verifySignature(ref, await strokeImage(SIG_B));
    // The gap is what makes a threshold choosable at all.
    expect(forged.mismatch_ratio - genuine.mismatch_ratio).toBeGreaterThan(0.3);
  });

  it('respects a custom threshold argument', async () => {
    const ref = await strokeImage(SIG_A);
    const sub = await strokeImage(SIG_A, { width: 9 });
    const { mismatch_ratio } = await verifySignature(ref, sub);

    const strict = await verifySignature(ref, sub, mismatch_ratio / 2);
    expect(strict.passed).toBe(false);

    const lenient = await verifySignature(
      ref,
      sub,
      Math.min(1, mismatch_ratio * 1.5)
    );
    expect(lenient.passed).toBe(true);
  });
});
