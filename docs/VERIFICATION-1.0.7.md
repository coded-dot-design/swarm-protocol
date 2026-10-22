# Swarm Protocol 1.0.7 verification

Verified on 2026-10-22:

- Type checking, the minified build, and all 125 tests passed.
- Five historical gameplay/page-mutation traces remain identical across 8,827 active frames.
- Palette checks verify at least 7:1 opaque score/outline contrast and at least 3:1 burst/ring contrast on white and dark reference surfaces.
- Real engine simulations cover score colors, outlines, burst colors, ring colors, an existing effect changing with the system preference, a readable opaque hold, the final fade, expiration, reduced motion, missing media-query support, and reuse of one retained media query.
- Chromium checks passed at 1280×800 and 390×844 in both system themes, plus mobile reduced motion. They exercise the production bug renderer and actual pointer kills, inspect canvas feedback, switch the system theme during a live popup, verify its hold/fade, and confirm Escape cleanup. No browser errors occurred.
- Light-mode mobile and dark-mode desktop screenshots were visually inspected. Dark score text is visible on white; mint text remains visible on dark backgrounds. The existing game panel styling is unchanged.
- The 17-file drop-in ZIP passed CRC and byte-for-byte input verification. Stable tag validation passed.
- The package retains v1.0.5 activation and v1.0.6 offscreen alerts. No new timers, animation loops, layout reads, theme controls, or dependencies were added.

Browser verification uses controlled local pages and emulated system settings, not the consuming production site or physical iOS/Android devices. No consuming website is deployed by this release. Publishing status is tracked separately from these local checks.
