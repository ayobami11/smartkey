// Shared Lighthouse CI config builder. Not itself a valid lhci config —
// lighthouserc.js and lighthouse/*.config.js call buildConfig() and export
// the result. See docs/TESTING.md for the workflow that drives these.

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// The report's own targets (docs/PRODUCT.md "Success criteria" table).
// Lighthouse's accessibility category stays warn-only — axe-core in the E2E
// suite is the authoritative WCAG gate (docs/TESTING.md); it's a different,
// less precise heuristic and shouldn't double-block a PR.
const DEFAULT_ASSERTIONS = {
  'categories:performance': ['error', { minScore: 0.85 }],
  'categories:accessibility': ['warn', { minScore: 0.9 }],
  'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
};

const buildConfig = ({
  urls,
  extraHeaders,
  assertions = DEFAULT_ASSERTIONS,
  outputDir,
}) => ({
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 3,
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 60000,
      settings: extraHeaders ? { extraHeaders } : undefined,
    },
    assert: {
      assertions,
    },
    // filesystem only — never upload rendered pages/screenshots to a
    // third-party temporary-storage service.
    upload: {
      target: 'filesystem',
      outputDir,
    },
  },
});

module.exports = { buildConfig, BASE_URL, DEFAULT_ASSERTIONS };
