# Swarm Protocol 1.0.10 verification

Verified on 2026-10-23:

- Type checking, production build, and all 141 tests passed. New coverage exercises actual bites, liquid stages, pulse timing, latching, all three bug-score colors in both themes, larger bite digits, pause/resume, reduced motion, hover/focus, native button state, host ownership, and cleanup.
- Chromium production-package checks passed at 1280×800 in light/dark mode and 390×844 in light/reduced-motion mode. Actual gameplay reached full green, yellow, pink, and depleted states. Scores matched killed bugs; button labels/shadows stayed unchanged; depleted buttons remained clickable; Escape restored original inline styles. No browser errors occurred. Screenshots were inspected.
- Separate hover checks passed in desktop light/dark and mobile reduced-motion configurations. A native `background: ... !important` hover/focus rule could not replace the power layer. Native label, border, focus outline, transform, translate, and rotate feedback remained effective. Damage continued during hover, hover exit restored the underlying background, keyboard activation worked, and cleanup removed the game styles.
- The existing frame loop draws at most two thin target rings. No new runtime dependencies, animation loops, JavaScript timers, blur, or button shadows were added. Liquid background updates remained within the 20Hz animation budget plus initial/state-boundary paints. Hover/focus sampling occurs on interaction boundaries. These checks are not device FPS benchmarks.
- Current-engine regression workloads cover feeding, the 48-bug cap, wave timing, offscreen pursuit, target depletion/resizing, input, and reduced motion. The no-target feeding trace remains exact. Historical optimization traces are separately pinned to the unchanged v1.0.9 source, apart from fixture-relative imports; changed target visuals/trajectories are not claimed to match old stripes.
- The 17-file drop-in ZIP passed CRC checks and every entry matched its staged input. Runtime files matched `dist` and the release manifest hashes. All 35 npm tarball entries matched the emitted build and documentation; source/test fixtures are excluded, while public type declarations are included.
- The tarball installed into a separate consumer with offline npm and scripts disabled. Public core/deferred imports succeeded without browser globals; a thin integration type-checked and bundled with lazy game chunks and a 1,992-byte initial consumer entry. Stable release-version validation passed.

| Deferred package path | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial scheduler | 1,956 | 1,122 |
| Additional activation bootstrap | 9,162 | 4,044 |
| Additional game on first open/start | 62,138 | 23,622 |
| Complete path | 73,256 | 28,788 |

Gzip sizes sum separately compressed output files. The complete path is 647 compressed bytes (about 2.3%) larger than v1.0.9; the initial scheduler remains about 1.1 kB compressed. Consuming bundlers and servers may change chunking/compression.

Browser checks use controlled local pages and emulated system settings. They do not deploy or replace the consuming Astro site's integration. GitHub workflow publication and public asset downloads are checked separately after pushing.
