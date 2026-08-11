// Default Lighthouse CI config: public, unauthenticated pages only.
// Runnable locally with zero test-account setup: `npm run test:lighthouse`.
// Authenticated dashboard coverage (Requester/Verifier) lives in
// lighthouse/requester.config.js and lighthouse/verifier.config.js — see
// .github/workflows/lighthouse.yml and docs/TESTING.md.

const { buildConfig, BASE_URL } = require('./lighthouse/shared');

module.exports = buildConfig({
  urls: [
    `${BASE_URL}/`,
    `${BASE_URL}/login`,
    `${BASE_URL}/help`,
    `${BASE_URL}/forgot-password`,
    `${BASE_URL}/weekend-access`,
  ],
  outputDir: '.lighthouseci/public',
});
