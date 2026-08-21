/**
 * Threshold calibration for signature verification.
 *
 * `SIGNATURE_DIFF_THRESHOLD` currently defaults to 0.55, a value read off six
 * synthetic stroke fixtures. That is enough to separate "same signature" from
 * "different signature" in a test suite; it is not evidence about real Dean
 * signatures, whose natural variation (pen weight, scanner, hand, day) is the
 * whole question. This module turns a labelled sample set into a defensible
 * number.
 *
 * The scoring pass is deliberately separate from the sweep. Scoring a pair is
 * expensive (two Sharp pipelines plus a Pixelmatch diff) and depends only on
 * the images, not on the threshold — so score every pair once, then sweep
 * thresholds over the resulting ratios arithmetically. A 200-sample sweep at
 * 0.01 resolution costs 200 comparisons, not 20,000.
 *
 * Nothing here imports Sharp or touches the filesystem, so the sweep maths is
 * unit-testable without fixtures. See `calibrate.test.ts` for both the tests
 * and the runner that feeds it real images.
 */

/** One labelled comparison, already scored by `verifySignature`. */
export type ScoredSample = {
  /** Identifier for the sample, used in reports. */
  id: string;
  /** Ground truth: was this genuinely the Dean's signature? */
  label: 'genuine' | 'forged';
  /** `mismatch_ratio` returned by `verifySignature`. */
  ratio: number;
};

/** Error rates at one candidate threshold. */
export type SweepRow = {
  threshold: number;
  /** False accept rate: forged samples that passed. The dangerous error. */
  far: number;
  /** False reject rate: genuine samples that were held. The recoverable one. */
  frr: number;
  falseAccepts: number;
  falseRejects: number;
};

export type Separation = {
  maxGenuine: number;
  minForged: number;
  /**
   * True when every genuine sample scores below every forged one. If so, any
   * threshold in the gap is perfect on this sample set and the midpoint gives
   * the widest margin against samples not yet seen.
   */
  separable: boolean;
};

export type Recommendation = {
  threshold: number;
  rationale: string;
  far: number;
  frr: number;
};

const countBy = (samples: ScoredSample[], label: ScoredSample['label']) =>
  samples.filter((s) => s.label === label);

/**
 * Error rates across candidate thresholds.
 *
 * Mirrors `verifySignature`'s comparison exactly: a sample PASSES when
 * `ratio <= threshold`. Getting this boundary backwards would shift every
 * recommendation by one step, so it is asserted in the tests.
 *
 * @param step Threshold resolution. 0.01 gives 101 rows over [0, 1].
 */
export const sweepThresholds = (
  samples: ScoredSample[],
  step = 0.01
): SweepRow[] => {
  const genuine = countBy(samples, 'genuine');
  const forged = countBy(samples, 'forged');

  if (genuine.length === 0 || forged.length === 0) {
    throw new Error(
      'A sweep needs both genuine and forged samples — with only one class, ' +
        'either FAR or FRR is undefined and the result cannot be interpreted.'
    );
  }

  const rows: SweepRow[] = [];
  const steps = Math.round(1 / step);

  for (let i = 0; i <= steps; i++) {
    const threshold = i * step;
    const falseAccepts = forged.filter((s) => s.ratio <= threshold).length;
    const falseRejects = genuine.filter((s) => s.ratio > threshold).length;

    rows.push({
      threshold,
      falseAccepts,
      falseRejects,
      far: falseAccepts / forged.length,
      frr: falseRejects / genuine.length,
    });
  }

  return rows;
};

/** How cleanly the two classes divide on this sample set. */
export const separation = (samples: ScoredSample[]): Separation => {
  const genuine = countBy(samples, 'genuine').map((s) => s.ratio);
  const forged = countBy(samples, 'forged').map((s) => s.ratio);

  if (genuine.length === 0 || forged.length === 0) {
    throw new Error('Separation needs both genuine and forged samples.');
  }

  const maxGenuine = Math.max(...genuine);
  const minForged = Math.min(...forged);

  return { maxGenuine, minForged, separable: maxGenuine < minForged };
};

/**
 * The threshold where FAR and FRR cross — the conventional summary statistic
 * for a biometric matcher. Reported for comparison, but NOT what SmartKey
 * should ship: EER treats both errors as equally costly, and here they are not.
 */
export const equalErrorRate = (rows: SweepRow[]): SweepRow =>
  rows.reduce((best, row) =>
    Math.abs(row.far - row.frr) < Math.abs(best.far - best.frr) ? row : best
  );

/**
 * Recommend an operating threshold.
 *
 * The two errors are not symmetric in this system, so the recommendation is
 * not symmetric either:
 *
 * - A **false accept** means a forged Dean authorisation is approved silently.
 *   Nobody is told. The whole control has failed open.
 * - A **false reject** means a genuine approval is held and raised to the CSO,
 *   who can release it with `cso_override`. Slower, and irritating for the
 *   Dean, but the key never moves without a human deciding.
 *
 * So: minimise FAR subject to keeping FRR inside a budget, rather than
 * balancing the two. Where several thresholds tie on FAR, take the most
 * permissive of them — it buys margin against genuine variation this sample
 * set has not seen, at no measured cost in forgeries admitted.
 *
 * @param maxFrr Tolerable share of genuine approvals held for CSO review.
 * @param maxFar Ceiling on forgeries admitted. If the sample set cannot be
 *               separated well enough to stay under this, the function reports
 *               that instead of returning a number — a threshold that fails
 *               open is worse than no recommendation, because it looks like an
 *               answer.
 */
export const recommendThreshold = (
  samples: ScoredSample[],
  maxFrr = 0.05,
  step = 0.01,
  maxFar = 0.1
): Recommendation => {
  const rows = sweepThresholds(samples, step);
  const sep = separation(samples);

  if (sep.separable) {
    const midpoint =
      Math.round(((sep.maxGenuine + sep.minForged) / 2) * 1000) / 1000;
    return {
      threshold: midpoint,
      far: 0,
      frr: 0,
      rationale:
        `Classes separate cleanly on this set (highest genuine ` +
        `${sep.maxGenuine.toFixed(3)} < lowest forged ` +
        `${sep.minForged.toFixed(3)}). Midpoint of the gap maximises margin. ` +
        `Clean separation on a small set is weak evidence — widen the sample ` +
        `before trusting it.`,
    };
  }

  const affordable = rows.filter((r) => r.frr <= maxFrr);
  const bestFar = affordable.length
    ? Math.min(...affordable.map((r) => r.far))
    : 1;

  // Two ways to have no usable answer: nothing meets the FRR budget, or the
  // only thresholds that do let too many forgeries through. The second is the
  // dangerous one — it still yields a plausible-looking number.
  if (affordable.length === 0 || bestFar > maxFar) {
    const eer = equalErrorRate(rows);
    const cause =
      affordable.length === 0
        ? `No threshold keeps FRR at or below ${(maxFrr * 100).toFixed(0)}%.`
        : `Every threshold within the FRR budget admits ` +
          `${(bestFar * 100).toFixed(0)}% of forgeries, over the ` +
          `${(maxFar * 100).toFixed(0)}% ceiling.`;

    return {
      threshold: eer.threshold,
      far: eer.far,
      frr: eer.frr,
      rationale:
        `${cause} The pipeline is not separating these samples. The value ` +
        `below is the equal-error point, reported so the run has an anchor — ` +
        `DO NOT SHIP IT. Investigate preprocessing, sample quality and ` +
        `labelling first.`,
    };
  }

  const minFar = bestFar;
  const tied = affordable.filter((r) => r.far === minFar);
  const chosen = tied[tied.length - 1];

  return {
    threshold: chosen.threshold,
    far: chosen.far,
    frr: chosen.frr,
    rationale:
      `Lowest FAR (${(minFar * 100).toFixed(1)}%) achievable within an FRR ` +
      `budget of ${(maxFrr * 100).toFixed(0)}%; most permissive of ` +
      `${tied.length} threshold(s) tied at that FAR, for margin.`,
  };
};

/** Fixed-width sweep table for terminal output. */
export const formatReport = (samples: ScoredSample[], step = 0.01): string => {
  const rows = sweepThresholds(samples, step);
  const sep = separation(samples);
  const rec = recommendThreshold(samples, 0.05, step);
  const eer = equalErrorRate(rows);
  const genuine = countBy(samples, 'genuine');
  const forged = countBy(samples, 'forged');

  const lines: string[] = [
    '',
    'SIGNATURE THRESHOLD CALIBRATION',
    '===============================',
    '',
    `Samples: ${genuine.length} genuine, ${forged.length} forged`,
    `Genuine ratios: ${Math.min(...genuine.map((s) => s.ratio)).toFixed(3)} – ${sep.maxGenuine.toFixed(3)}`,
    `Forged  ratios: ${sep.minForged.toFixed(3)} – ${Math.max(...forged.map((s) => s.ratio)).toFixed(3)}`,
    `Separable: ${sep.separable ? 'yes' : 'NO — ranges overlap'}`,
    '',
    'threshold      FAR      FRR   (FAR = forgeries admitted)',
    '---------------------------------------------------------',
  ];

  // Every 5th row keeps the table readable at 0.01 resolution.
  for (const row of rows) {
    if (Math.round(row.threshold * 100) % 5 !== 0) continue;
    const mark =
      Math.abs(row.threshold - rec.threshold) < step / 2 ? '  <<<' : '';
    lines.push(
      `    ${row.threshold.toFixed(2)}   ${(row.far * 100).toFixed(1).padStart(6)}%  ${(row.frr * 100).toFixed(1).padStart(6)}%${mark}`
    );
  }

  lines.push(
    '',
    `Equal-error point: ${eer.threshold.toFixed(2)} (FAR ${(eer.far * 100).toFixed(1)}%, FRR ${(eer.frr * 100).toFixed(1)}%)`,
    `  — reported for reference only; not the recommendation, see below.`,
    '',
    `RECOMMENDED  SIGNATURE_DIFF_THRESHOLD=${rec.threshold}`,
    `  FAR ${(rec.far * 100).toFixed(1)}%  FRR ${(rec.frr * 100).toFixed(1)}%`,
    `  ${rec.rationale}`,
    '',
    'Misclassified samples:'
  );

  const wrong = [
    ...forged
      .filter((s) => s.ratio <= rec.threshold)
      .map((s) => `  ADMITTED forgery: ${s.id} (${s.ratio.toFixed(3)})`),
    ...genuine
      .filter((s) => s.ratio > rec.threshold)
      .map((s) => `  HELD genuine:     ${s.id} (${s.ratio.toFixed(3)})`),
  ];
  lines.push(...(wrong.length ? wrong : ['  none']), '');

  return lines.join('\n');
};
