import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { DEFAULT_THRESHOLD, verifySignature } from './verifier';

const W = 800;
const H = 400;
const TOTAL = W * H;

// Build a greyscale PNG where `blackCount` pixels (from the top-left) are 0
// and the rest are 255. Sharp resizes to 800×400 inside verifySignature, so
// these images are already at the target resolution.
const makePng = async (blackCount: number): Promise<Buffer> => {
  const raw = Buffer.alloc(TOTAL, 255);
  for (let i = 0; i < blackCount; i++) {
    raw[i] = 0;
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
};

describe('verifySignature', () => {
  it('returns mismatch_ratio ~0 and passed:true for identical images', async () => {
    const img = await makePng(0);
    const result = await verifySignature(img, img);
    expect(result.mismatch_ratio).toBe(0);
    expect(result.passed).toBe(true);
  });

  it('returns passed:true when mismatch is below threshold (~10%)', async () => {
    // 10% of pixels differ — below the default 15% threshold
    const blackPixels = Math.floor(TOTAL * 0.1);
    const ref = await makePng(0);
    const sub = await makePng(blackPixels);
    const result = await verifySignature(ref, sub);
    expect(result.mismatch_ratio).toBeCloseTo(0.1, 1);
    expect(result.passed).toBe(true);
    expect(result.mismatch_ratio).toBeLessThan(DEFAULT_THRESHOLD);
  });

  it('returns passed:false when mismatch exceeds threshold (~50%)', async () => {
    // 50% of pixels differ — well above the default 15% threshold
    const blackPixels = Math.floor(TOTAL * 0.5);
    const ref = await makePng(0);
    const sub = await makePng(blackPixels);
    const result = await verifySignature(ref, sub);
    expect(result.mismatch_ratio).toBeCloseTo(0.5, 1);
    expect(result.passed).toBe(false);
    expect(result.mismatch_ratio).toBeGreaterThan(DEFAULT_THRESHOLD);
  });

  it('respects a custom threshold argument', async () => {
    const blackPixels = Math.floor(TOTAL * 0.05);
    const ref = await makePng(0);
    const sub = await makePng(blackPixels);
    // 5% mismatch passes the default threshold but fails a strict 0.03 threshold
    const strict = await verifySignature(ref, sub, 0.03);
    expect(strict.passed).toBe(false);
    const lenient = await verifySignature(ref, sub, 0.1);
    expect(lenient.passed).toBe(true);
  });
});
