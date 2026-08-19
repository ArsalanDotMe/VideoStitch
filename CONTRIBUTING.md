# Contributing

Use Node.js 24 and FFmpeg 6.1 or newer for local development.

1. Create a focused branch from current `master`.
2. Run `npm ci`.
3. Add tests for behavior and failure paths. Generate media through FFmpeg rather than committing binary fixtures.
4. Run `npm run verify`.
5. Describe public API, security, compatibility, or performance implications in the pull request.

Do not add runtime dependencies, shell-interpolated FFmpeg commands, arbitrary FFmpeg argument passthrough, committed credentials/media, or silent compatibility fallbacks. New public behavior requires TypeScript declarations, documentation, ESM/CommonJS consumer coverage, and semantic output verification.

Releases use dedicated maintainer-owned `release/vX.Y.Z` branches and are documented in [docs/RELEASING.md](docs/RELEASING.md).
