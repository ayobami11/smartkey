import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

const WIDTH = 800;
const HEIGHT = 400;
const TOTAL_PIXELS = WIDTH * HEIGHT;

// Mismatch ratio above which verification fails.
//
// This is scored over the INK REGION, not the whole canvas (see below), so the
// scale is completely different from the pre-2026-08 whole-canvas ratio. Any
// deployment carrying the old SIGNATURE_DIFF_THRESHOLD=0.15 must be updated —
// under ink-region scoring 0.15 rejects nearly every genuine signature.
//
// 0.55 sits between the widest genuine variation and the narrowest forgery
// measured on synthetic stroke fixtures. It still wants calibration against
// real Dean signature samples during the pilot (BACKEND.md §13, Sprint 4).
export const DEFAULT_THRESHOLD = parseFloat(
  process.env.SIGNATURE_DIFF_THRESHOLD ?? '0.55'
);

export type VerifyResult = {
  mismatch_ratio: number;
  passed: boolean;
};

type InkMask = {
  /** RGBA buffer for pixelmatch (WIDTH × HEIGHT × 4). */
  rgba: Uint8Array;
  /** Indices where this image has ink, as a 0/1 mask. */
  ink: Uint8Array;
  /** Count of ink pixels; 0 means the image is blank. */
  inkCount: number;
};

/**
 * Normalise a signature image to a comparable binary ink mask.
 *
 * The `trim` step is what makes the comparison meaningful. Two scans of the
 * same signature are rarely positioned or scaled identically, and a raw
 * pixel diff of thin strokes collapses under even a 6px offset — a genuine
 * re-scan then scores worse than a forgery. Cropping to the ink bounding box
 * before resizing registers the two images against each other so the diff
 * reflects the shape of the signature rather than where it sat on the page.
 */
const preprocess = async (input: Buffer): Promise<InkMask> => {
  const binary = await sharp(input)
    .greyscale()
    .normalise()
    .threshold(128)
    .png()
    .toBuffer();

  // trim() throws on a fully uniform image (a blank page); fall back to the
  // untrimmed binary so a blank submission is still scored, not an error.
  let registered: Buffer;
  try {
    registered = await sharp(binary).trim({ threshold: 10 }).png().toBuffer();
  } catch {
    registered = binary;
  }

  const grey = await sharp(registered)
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .threshold(128)
    .raw()
    .toBuffer();

  const rgba = new Uint8Array(TOTAL_PIXELS * 4);
  const ink = new Uint8Array(TOTAL_PIXELS);
  let inkCount = 0;

  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const v = grey[i];
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
    if (v < 128) {
      ink[i] = 1;
      inkCount++;
    }
  }

  return { rgba, ink, inkCount };
};

/**
 * Compares two signature images at the pixel level.
 *
 * Both buffers may be any format Sharp can decode (PNG, JPEG, WebP, etc.).
 *
 * The score is the differing pixel count divided by the count of pixels that
 * carry ink in *either* image (the union) — a Jaccard distance over the ink
 * region. Dividing by the full canvas instead, as this function did before
 * 2026-08, makes the metric useless: signature strokes cover roughly 1.6% of
 * an 800×400 canvas, so no two signatures can differ by more than about 3.3%
 * of it and every comparison passes a 15% threshold, forgeries included.
 *
 * This detects gross substitution (a different signature pasted in), not
 * forensic authorship. Natural variation in pen weight and hand still scores
 * well below a substitution, but the two ranges are closer than a
 * pixel-comparison approach can cleanly separate — treat a pass as "not
 * obviously tampered", never as proof of authorship.
 *
 * @param referenceBuffer  The Dean's onboarded reference signature.
 * @param submittedBuffer  The signature extracted from the submitted document.
 * @param threshold        Mismatch ratio above which the verification fails.
 *                         Defaults to SIGNATURE_DIFF_THRESHOLD (0.55).
 */
export const verifySignature = async (
  referenceBuffer: Buffer,
  submittedBuffer: Buffer,
  threshold = DEFAULT_THRESHOLD
): Promise<VerifyResult> => {
  const [ref, sub] = await Promise.all([
    preprocess(referenceBuffer),
    preprocess(submittedBuffer),
  ]);

  // A blank reference or a blank submission carries no signature to match.
  // Scoring it as a total mismatch is the safe reading — it holds the approval
  // for CSO review rather than waving through an empty page.
  if (ref.inkCount === 0 || sub.inkCount === 0) {
    return { mismatch_ratio: 1, passed: false };
  }

  const diffCount = pixelmatch(ref.rgba, sub.rgba, null, WIDTH, HEIGHT, {
    threshold: 0.1,
  });

  let unionCount = 0;
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    if (ref.ink[i] || sub.ink[i]) unionCount++;
  }

  const mismatch_ratio = Math.min(1, diffCount / unionCount);
  return { mismatch_ratio, passed: mismatch_ratio <= threshold };
};
