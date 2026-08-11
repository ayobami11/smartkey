// Lighthouse CI config for the Verifier dashboard — the highest-traffic
// screen per the report's operational description (docs/PRODUCT.md), but
// deliberately non-blocking: Verifier login requires a real OTP read from
// the shared IMAP test mailbox (docs/E2E_OTP_SETUP.md documents this as
// occasionally flaky), and a performance gate should never fail a PR for a
// reason that has nothing to do with performance. Every assertion here is
// downgraded to `warn` so `lhci assert` can never fail on this config's
// results — the workflow's `continue-on-error` on the login step is the
// other half of the same decision. Expects LHCI_COOKIE in the environment,
// same as lighthouse/requester.config.js.

const { buildConfig, BASE_URL } = require('./shared');

const NON_BLOCKING_ASSERTIONS = {
  'categories:performance': ['warn', { minScore: 0.85 }],
  'categories:accessibility': ['warn', { minScore: 0.9 }],
  'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
  'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
};

module.exports = buildConfig({
  urls: [`${BASE_URL}/verifier/dashboard`],
  extraHeaders: process.env.LHCI_COOKIE
    ? { Cookie: process.env.LHCI_COOKIE }
    : undefined,
  assertions: NON_BLOCKING_ASSERTIONS,
  outputDir: '.lighthouseci/verifier',
});
