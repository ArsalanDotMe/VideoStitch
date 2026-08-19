# Releasing

Releases are automatic after a specially labelled release PR is merged. Merging that PR is the irreversible publication approval.

## One-time repository setup

1. Protect `master` and require the CI and security checks.
2. Restrict merges and the `release` label to maintainers.
3. Configure npm trusted publishing for this repository and `.github/workflows/release.yml`, allowing `npm publish`.
4. Enable GitHub immutable releases.
5. After the first OIDC release succeeds, revoke legacy npm automation tokens.

These settings are external and must be verified separately; committed workflow files cannot enable them safely.

## Prepare and publish

1. Ensure `master` is clean and current.
2. Run `npm run release:prepare -- 2.0.0-beta.1` (or the intended SemVer).
3. Review the version, lockfile, and dated changelog section; run `npm run verify`.
4. Commit and open the generated `release/vX.Y.Z` branch as a PR to `master` with the `release` label.
5. Merge only after all checks pass. The closed-PR workflow validates the branch/version/label, rebuilds and retests, packs once, creates a draft GitHub Release, publishes that exact tarball through npm OIDC, verifies registry integrity and a clean install, uploads checksum/SBOM assets, and publishes the GitHub Release.

Prereleases use npm's `next` tag and GitHub's prerelease flag. Stable releases use `latest`. A rerun never overwrites npm: it compares the existing registry integrity and completes only the matching draft release.

Begin with `2.0.0-beta.1`, exercise the documented operations on Linux, Windows, and macOS, then publish an RC. Keep npm `latest` on `1.7.1` until stable `2.0.0` passes acceptance.
