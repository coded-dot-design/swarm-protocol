# Swarm Protocol 1.0.13 verification

Verified on 2026-10-23:

- Type checking, production build, and all 152 automated tests passed. Added regression cases cover stable native CSS fills on narrow phones and wide coarse-pointer devices, sticky hover, mobile damage without SVG swaps/shaking, bug-colored bite particles, pause, pointer-mode changes without health resets, and restoration of tap-highlight styles.
- Chromium production-package gameplay passed in six contexts: 1280×800 desktop light/dark, 390×844 touch phone light/dark, 1024×900 touch tablet, and 390×844 touch reduced-motion. Touch contexts used touch input and 3× device scale. All verified the health states, exact bug-colored scores, particles, native depleted-button taps/clicks, label/shadow preservation, Escape cleanup, and no browser errors.
- Mobile checks verified a stable background between bites, no game data-URI/SVG backgrounds at any powered health stage, no powered button translate/rotate, and transparent temporary tap highlight. Reduced motion retains its plain static fill. Mobile screenshots were inspected.
- Separate desktop light/dark and mobile reduced-motion hover runs passed against this build, retaining the previous scoped hover guard, keyboard focus/Enter, continued damage, and exact stylesheet/inline-style restoration. Existing desktop boil/ripple tests pass unchanged.
- Release-version validation passed. ZIP CRC checks and all 17 entries matched staged files. All seven runtime files matched dist and SHA-256 manifest hashes. All 35 npm tarball entries matched local build/docs. A separate consumer installed the tarball offline with scripts disabled and imported deferred/core without browser globals.

| Deferred package path | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial scheduler | 1,956 | 1,120 |
| Additional activation bootstrap | 9,162 | 4,046 |
| Additional game on first open/start | 67,832 | 25,999 |
| Complete path | 78,950 | 31,165 |

The complete path adds 313 compressed bytes (about 1.0%) to v1.0.12. The initial loader remains about 1.1 kB compressed. On mobile, static gradient bubbles replace continuous SVG regeneration; unchanged health requires no background writes. Health-driven paints retain the 12Hz cap. One softer/slower canvas beacon and existing bite particles share the original animation loop. No dependency, timer, extra RAF loop, blur, or button shadow was added.

These are controlled browser emulations and deterministic checks, not physical-phone GPU/FPS measurements. The reported device-specific flashing was not directly reproduced on the user's device. The patch removes the repeatedly decoded background-image path and native tap-highlight flash while preserving gameplay. The consuming Astro site is unchanged until its dependency is updated. Public GitHub release and anonymous asset downloads are verified separately after pushing.
