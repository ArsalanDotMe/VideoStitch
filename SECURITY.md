# Security policy

## Supported versions

Security fixes are provided for the latest v2 minor release. Version 1 is unsupported and should be migrated because it contains obsolete dependencies and weaker input/process handling.

## Reporting a vulnerability

Use GitHub's private security-advisory reporting for this repository. Do not open a public issue containing exploit details, credentials, private media, or signed URLs.

Include the affected version, platform, Node/FFmpeg versions, minimal reproduction, impact, and any suggested mitigation. You should receive an acknowledgement within seven days. Publication and coordinated disclosure timing will be agreed after triage.

## Security boundaries

VideoStitch executes the caller-configured FFmpeg/FFprobe binaries with the permissions of the Node process. It does not sandbox FFmpeg. Applications processing untrusted media should additionally isolate the process, restrict filesystem permissions, cap CPU/memory/disk usage, and keep FFmpeg patched.
