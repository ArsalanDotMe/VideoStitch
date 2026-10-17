# Version 1.7.2 (unreleased candidate)
- Fix shell command injection in concat/cut and delegated merge operations.
- Remove shelljs and upgrade tmp to 0.2.7. Requires Node.js >=14.14.
- Reject concat-list directive injection and quote filenames correctly.
- Create concat lists exclusively with mode 0600 and remove them after use.
- Reject process failures, including missing executables, without maxBuffer limits.

# Version 1.5
Added an additional option to ffmpeg to overwrite existing files, or to prevent it

# Version 1.7
Added ability to provide ffmpeg path to constructor.