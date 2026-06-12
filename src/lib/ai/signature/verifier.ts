import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

const WIDTH = 800;
const HEIGHT = 400;
const TOTAL_PIXELS = WIDTH * HEIGHT;

export const DEFAULT_THRESHOLD = parseFloat(
  process.env.SIGNATURE_DIFF_THRESHOLD ?? '0.15'
);

export type VerifyResult = {
  mismatch_ratio: number;
  passed: boolean;
};

// Preprocess a signature image: resize, greyscale, binary threshold.
// Returns a RGBA buffer (WIDTH × HEIGHT × 4 bytes) suitable for pixelmatch.
const preprocess = async (input: Buffer): Promise<Uint8Array> => {
  const grey = await sharp(input)
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .greyscale()
    .threshold(128)
    .raw()
    .toBuffer();

  // pixelmatch requires RGBA (4 bytes per pixel); expand the 1-channel output.
  const rgba = new Uint8Array(TOTAL_PIXELS * 4);
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const v = grey[i];
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
};

/**
 * Compares two signature images at the pixel level.
 *
 * Both buffers may be any format Sharp can decode (PNG, JPEG, WebP, etc.).
 * The function normalises them to a 800×400 binary greyscale before comparing.
 *
 * @param referenceBuffer  The HOD's onboarded reference signature.
 * @param submittedBuffer  The signature extracted from the submitted document.
 * @param threshold        Mismatch ratio above which the verification fails.
 *                         Defaults to the SIGNATURE_DIFF_THRESHOLD env var (0.15).
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

  const diffCount = pixelmatch(ref, sub, null, WIDTH, HEIGHT, {
    threshold: 0.1,
  });

  const mismatch_ratio = diffCount / TOTAL_PIXELS;
  return { mismatch_ratio, passed: mismatch_ratio <= threshold };
};
