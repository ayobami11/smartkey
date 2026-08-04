import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { DEFAULT_THRESHOLD, verifySignature } from './verifier';

const W = 800;
const H = 400;

// FIXTURE CONTRACT — read before changing anything below.
//
// These fixtures MUST be thin strokes with realistic ink coverage (single-digit
// percent of the canvas). That property is not cosmetic; it is the thing that
// makes this suite capable of catching the bug it exists to catch.
//
// What went wrong before: the original suite compared solid rectangular blocks
// covering 10–50% of the canvas. `verifySignature` was scoring the mismatch
// ratio against the WHOLE CANVAS instead of the ink region. Against 10–50%
// blocks that arithmetic still produced numbers on both sides of the threshold,
// so all the tests passed — while in production, where signatures cover ~1.6%
// of the page, no two images could differ by more than ~3.3% of the canvas.
// The 15% threshold was mathematically unreachable and `verifySignature`
// returned `passed: true` for everything it was ever shown: a completely
// different signature (3.2%) and a blank page (1.8%) both sailed through.
// Every forgery passed for months and the suite stayed green throughout.
//
// So: do NOT "simplify" these back to solid blocks, filled shapes, or anything
// else with double-digit coverage, however much cleaner it looks. High-coverage
// fixtures re-open the exact blind spot that hid the original bug, because a
// canvas-denominator regression is invisible when ink and canvas are the same
// order of magnitude. `verifySignature` must be exercised at the coverage level
// it actually meets in production.
//
// This contract is enforced, not merely documented — see the
// 'fixture ink coverage' block at the foot of this file, which fails if any
// fixture drifts out of the plausible signature range.

// Render a signature-like ink stroke on a white page.
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

// Fraction of the canvas carrying ink, measured on the raw fixture exactly as
// rendered — before any of the verifier's own trim/resize registration. This is
// deliberately an independent reimplementation rather than a reach into
// `preprocess`: the point is to assert what the fixture *is*, so it must not go
// stale if the verifier's internal normalisation changes.
const inkCoverage = async (image: Buffer): Promise<number> => {
  const raw = await sharp(image).greyscale().threshold(128).raw().toBuffer();
  let ink = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < 128) ink++;
  }
  return ink / (W * H);
};

// A real signature covers a low single-digit percentage of the page. The
// original block fixtures sat at 10–50%; anything approaching that is the
// regression this guard exists to stop.
const MIN_PLAUSIBLE_COVERAGE = 0.002; // 0.2% — below this the fixture is effectively blank
const MAX_PLAUSIBLE_COVERAGE = 0.05; // 5% — well under the 10% floor of the old block fixtures

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

// Guards the fixture contract documented at the head of this file. Without
// these, "the fixtures are realistic strokes" is an unstated assumption that a
// future tidy-up can silently break — which is exactly how the whole-canvas
// scoring bug survived the original suite. Every case above draws from one of
// these variants, so covering them covers the suite.
describe('fixture ink coverage', () => {
  const variants: [string, Parameters<typeof strokeImage>[1]][] = [
    ['reference stroke', undefined],
    ['offset stroke', { dx: 20, dy: 14 }],
    ['heavier pen', { width: 9 }],
    ['rescaled stroke', { scale: 0.85, dx: 30 }],
  ];

  it.each(variants)(
    'renders %s within the plausible signature range',
    async (_label, options) => {
      const coverage = await inkCoverage(await strokeImage(SIG_A, options));
      expect(coverage).toBeGreaterThan(MIN_PLAUSIBLE_COVERAGE);
      expect(coverage).toBeLessThan(MAX_PLAUSIBLE_COVERAGE);
    }
  );

  it('renders the second signature within the plausible range too', async () => {
    const coverage = await inkCoverage(await strokeImage(SIG_B));
    expect(coverage).toBeGreaterThan(MIN_PLAUSIBLE_COVERAGE);
    expect(coverage).toBeLessThan(MAX_PLAUSIBLE_COVERAGE);
  });

  // The specific number the production bug turned on: at ~1.6% coverage, a
  // whole-canvas denominator caps any possible mismatch at a few percent, so a
  // 15%-style threshold can never fire. Pinning the order of magnitude keeps
  // that reasoning checkable rather than folklore.
  it('keeps coverage at the ~1.6% order of magnitude seen in real signatures', async () => {
    const coverage = await inkCoverage(await strokeImage(SIG_A));
    expect(coverage).toBeGreaterThan(0.005);
    expect(coverage).toBeLessThan(0.03);
  });

  it('confirms the blank fixture carries no ink at all', async () => {
    expect(await inkCoverage(await blankPage())).toBe(0);
  });
});
