# Changelog

All notable changes are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Strict TypeScript implementation with dual ESM/CommonJS exports and declarations.
- Direct async `probe`, `concat`, `edit`, `replaceSegments`, and `thumbnails` APIs.
- Managed HTTPS downloads, progress, cancellation, structured errors, atomic outputs, and FFmpeg 6.1+ validation.
- Cross-platform CI, package consumer tests, coverage enforcement, benchmarks, and provenance-oriented release automation.

### Changed

- Replaced the v1 fluent builders and duration strings with typed request objects and numeric seconds.
- Replaced intermediate cut files with single-filter-graph editing where FFmpeg supports it.

### Removed

- All runtime npm dependencies, shell execution, bundled test media, and the legacy fluent API.

## [1.7.1] - 2021-06-25

- Historical npm release. Its pinned registry metadata is retained in `test/baseline/v1.7.1.json`; its published Git commit is absent from this repository, so no retrospective tag is created.
