import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  equalErrorRate,
  formatReport,
  recommendThreshold,
  separation,
  sweepThresholds,
  type ScoredSample,
} from './calibrate';
import { verifySignature } from './verifier';

const sample = (
  id: string,
  label: ScoredSample['label'],
  ratio: number
): ScoredSample => ({ id, label, ratio });

describe('sweepThresholds', () => {
  it('mirrors verifySignature: a sample passes when ratio <= threshold', () => {
    // A forged sample scoring exactly at the threshold is ACCEPTED, because
    // verifySignature uses `<=`. Off-by-one here shifts every recommendation.
    const rows = sweepThresholds(
      [sample('g', 'genuine', 0.1), sample('f', 'forged', 0.5)],
      0.1
    );

    const at = (t: number) =>
      rows.find((r) => Math.abs(r.threshold - t) < 1e-9)!;

    expect(at(0.5).falseAccepts).toBe(1);
    expect(at(0.4).falseAccepts).toBe(0);

    // Genuine at 0.1 is rejected only once the threshold drops below it.
    expect(at(0.1).falseRejects).toBe(0);
    expect(at(0).falseRejects).toBe(1);
  });

  it('reports rates as proportions of each class, not of the whole set', () => {
    const rows = sweepThresholds(
      [
        sample('g1', 'genuine', 0.1),
        sample('g2', 'genuine', 0.2),
        sample('g3', 'genuine', 0.3),
        sample('f1', 'forged', 0.9),
      ],
      0.1
    );

    // Threshold 0.15 holds 2 of 3 genuine samples.
    const row = rows.find((r) => Math.abs(r.threshold - 0.2) < 1e-9)!;
    expect(row.frr).toBeCloseTo(1 / 3);
    expect(row.far).toBe(0);
  });

  it('refuses a single-class sample set', () => {
    expect(() => sweepThresholds([sample('g', 'genuine', 0.1)])).toThrow(
      /both genuine and forged/
    );
  });

  it('is monotonic — raising the threshold never reduces false accepts', () => {
    const samples = [
      sample('g1', 'genuine', 0.2),
      sample('f1', 'forged', 0.4),
      sample('f2', 'forged', 0.8),
    ];
    const rows = sweepThresholds(samples, 0.05);

    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].falseAccepts).toBeGreaterThanOrEqual(
        rows[i - 1].falseAccepts
      );
      expect(rows[i].falseRejects).toBeLessThanOrEqual(
        rows[i - 1].falseRejects
      );
    }
  });
});

describe('separation', () => {
  it('detects a clean split', () => {
    const sep = separation([
      sample('g1', 'genuine', 0.1),
      sample('g2', 'genuine', 0.3),
      sample('f1', 'forged', 0.7),
    ]);
    expect(sep).toEqual({ maxGenuine: 0.3, minForged: 0.7, separable: true });
  });

  it('detects overlap', () => {
    const sep = separation([
      sample('g1', 'genuine', 0.8),
      sample('f1', 'forged', 0.4),
    ]);
    expect(sep.separable).toBe(false);
  });
});

describe('recommendThreshold', () => {
  it('takes the midpoint of the gap when the classes separate', () => {
    const rec = recommendThreshold([
      sample('g1', 'genuine', 0.2),
      sample('f1', 'forged', 0.6),
    ]);
    expect(rec.threshold).toBeCloseTo(0.4);
    expect(rec.far).toBe(0);
    expect(rec.frr).toBe(0);
  });

  it('prefers a low false-accept rate over a balanced one', () => {
    // Overlapping classes. The equal-error point admits a forgery; the
    // recommendation should not, because admitting a forgery fails open.
    const samples = [
      sample('g1', 'genuine', 0.1),
      sample('g2', 'genuine', 0.15),
      sample('g3', 'genuine', 0.2),
      sample('g4', 'genuine', 0.6),
      sample('f1', 'forged', 0.5),
      sample('f2', 'forged', 0.9),
      sample('f3', 'forged', 0.95),
    ];

    const rec = recommendThreshold(samples, 0.25);

    // g4 (0.60) sits above f1 (0.50), so holding one genuine sample is the
    // price of admitting no forgeries. Within a 25% FRR budget, pay it.
    expect(rec.far).toBe(0);
    expect(rec.threshold).toBeLessThan(0.5);
    expect(rec.frr).toBeCloseTo(0.25);
  });

  it('flags an unusable pipeline rather than inventing a threshold', () => {
    // Forgeries score lower than genuine samples: the metric is inverted or
    // the preprocessing is broken. No threshold rescues this.
    const rec = recommendThreshold(
      [
        sample('g1', 'genuine', 0.9),
        sample('g2', 'genuine', 0.95),
        sample('f1', 'forged', 0.1),
      ],
      0.05
    );
    expect(rec.rationale).toMatch(/not separating/);
  });
});

describe('equalErrorRate', () => {
  it('finds the crossing point of the two error curves', () => {
    const rows = sweepThresholds(
      [
        sample('g1', 'genuine', 0.3),
        sample('g2', 'genuine', 0.7),
        sample('f1', 'forged', 0.3),
        sample('f2', 'forged', 0.7),
      ],
      0.1
    );
    const eer = equalErrorRate(rows);
    expect(eer.far).toBeCloseTo(eer.frr, 1);
  });
});

// ---------------------------------------------------------------------------
// Real-sample runner
// ---------------------------------------------------------------------------
//
// Skipped unless SIGNATURE_CALIBRATION_DIR points at a labelled sample set.
// This is the half of the task that needs pilot data; everything above runs
// on every `npm test`.
//
//   SIGNATURE_CALIBRATION_DIR=/path/to/samples npx vitest run calibrate
//
// Expected layout — one reference per Dean, samples grouped by ground truth:
//
//   samples/
//     reference/
//       dean-eng.png          <- the Dean's onboarded reference signature
//       dean-sci.png
//     genuine/
//       dean-eng/*.png        <- further real signatures from the same Dean
//       dean-sci/*.png
//     forged/
//       dean-eng/*.png        <- signatures NOT by that Dean
//       dean-sci/*.png
//
// Collect genuine samples across different days, pens and scanner settings.
// A set gathered in one sitting understates natural variation, which is the
// variable the threshold exists to absorb, and will recommend a threshold too
// tight for real use.

const CALIBRATION_DIR = process.env.SIGNATURE_CALIBRATION_DIR;

describe.skipIf(!CALIBRATION_DIR)(
  'threshold calibration on real samples',
  () => {
    it('scores every labelled pair and reports a recommended threshold', async () => {
      const root = CALIBRATION_DIR!;
      const references = await readdir(path.join(root, 'reference'));
      const samples: ScoredSample[] = [];

      for (const label of ['genuine', 'forged'] as const) {
        for (const refFile of references) {
          const dean = path.parse(refFile).name;
          const dir = path.join(root, label, dean);

          let files: string[];
          try {
            files = await readdir(dir);
          } catch {
            continue; // No samples of this class for this Dean.
          }

          const reference = await readFile(
            path.join(root, 'reference', refFile)
          );

          for (const file of files) {
            const submitted = await readFile(path.join(dir, file));
            const { mismatch_ratio } = await verifySignature(
              reference,
              submitted,
              // Threshold is irrelevant here — only the ratio is recorded, and
              // the sweep applies thresholds afterwards.
              1
            );
            samples.push({
              id: `${dean}/${label}/${file}`,
              label,
              ratio: mismatch_ratio,
            });
          }
        }
      }

      expect(
        samples.length,
        `No samples found under ${root} — check the directory layout.`
      ).toBeGreaterThan(0);

      // The report is the deliverable; the assertions below are guard rails.
      // Deliberate console use — this is a calibration runner whose output is
      // read by a human at the terminal, not application code subject to the
      // `src/lib/logger.ts` rule.
      console.log(formatReport(samples));

      const sep = separation(samples);
      expect(
        sep.minForged,
        'Forgeries scored no higher than genuine signatures — the pipeline is ' +
          'not discriminating and no threshold will fix that.'
      ).toBeGreaterThan(0);
    }, 120_000);
  }
);
