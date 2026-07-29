const { execSync } = require('child_process');

// EAS automatically sets EAS_BUILD_GIT_COMMIT_HASH in cloud builds.
// Locally, fall back to running git directly.
let fullSha = process.env.EAS_BUILD_GIT_COMMIT_HASH;
if (!fullSha) {
  try {
    fullSha = execSync('git rev-parse HEAD').toString().trim();
  } catch {
    fullSha = 'unknown';
  }
}
const gitCommit = fullSha !== 'unknown' ? fullSha.substring(0, 7) : 'unknown';

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    gitCommit,
  },
});
