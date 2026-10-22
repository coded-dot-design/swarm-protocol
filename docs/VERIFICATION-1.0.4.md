# GitHub release preparation — 1.0.4

Verified locally on 2026-10-22:

- Type checking and the minified runtime build passed.
- All **115** runtime, lifecycle, declaration, React, and gameplay regression tests passed. The previous package's two GitLab-publishing tests were removed with its unused GitLab publisher.
- Gameplay regression tests retained the five exact historical traces across 8,827 active frames.
- All seven emitted runtime files and the drop-in `install.js` matched the already-tested self-hosted 1.0.4 release byte for byte.
- Engine, widget, activation, and deferred-scheduler source files are unchanged.
- The release builder generated the complete 17-file drop-in ZIP and SHA-256 checksum. The ZIP builder compared every archived file with its input bytes.
- Tag validation accepted the exact current package version and rejected mismatched/malformed versions and lockfile mismatches.
- GitHub workflow YAML and shell syntax were checked. Actions use full commit SHA pins.
- Test discovery is scoped to `tests/*.test.mjs`, so creating the browser-test download does not accidentally execute it as a Node test on subsequent development runs.

The GitHub repository, release setting, tag, release publication, and GitHub Actions run still require an authorized GitHub connection. They have not been verified remotely. This preparation does not modify the existing private game preview or the work website.
