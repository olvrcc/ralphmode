/* eslint-env node */
module.exports = {
  branches: ['main'],
  ci: false, // Allow local releases (not just CI)
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    [
      '@semantic-release/npm',
      {
        npmPublish: !process.argv.includes('--dry-run'), // Skip npm publish during dry-run
      },
    ],
    // GitHub releases are optional - only created if GITHUB_TOKEN is set
    // Skip this plugin for local releases if you don't want GitHub releases
    ...(process.env.GITHUB_TOKEN || process.env.GH_TOKEN ? ['@semantic-release/github'] : []),
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'pnpm-lock.yaml'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
}
