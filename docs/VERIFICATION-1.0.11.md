# Swarm Protocol 1.0.11 verification

Verified on 2026-10-23:

- Type checking, production build, and all 143 automated tests passed. Native surface fallbacks/explicit palette tokens, original style/attribute preservation, three clipped interior bubbles, the 12Hz background cap, and thin external bite bubbles have regression coverage. Existing bug-colored scores, latching, wave/input behavior, pause, reduced motion, and cleanup remain covered.
- Chromium production-package checks passed at 1280×800 in light/dark mode and 390×844 in light/reduced-motion mode. Each run verified native-hover-color power, actual native/yellow/pink/depleted stages, score color, bite bubbles, native clicks, label/shadow preservation, Escape restoration, and no browser errors. Screenshots were inspected.
- Separate hover/focus runs passed in desktop light/dark and mobile reduced-motion configurations. An `!important` native hover background did not change the captured power color or stable base. Only fill opacity changed to 86%; actual damage continued, pulse/health did not restart, native focus/activation/movement worked, and Escape restored original styles.
- Eleven palette cases passed in both system themes (22 checks): solid hover colors, var() background shorthands, specificity, selector lists, theme media rules, CSS nesting, named cascade layers/important priority, explicit palette tokens, native fallback colors, :not(:hover), and inline-important precedence. Temporary probe styles/markers were removed and original inline style attributes restored, including their original serialization. Unreadable stylesheet fallback is separately covered in the automated suite.
- Browser observations kept liquid/bubble background painting within 12Hz plus initial/interaction/state boundaries. The three interior circles remain in the background behind labels; bite circles share the existing capped particle loop. No new runtime dependency, JavaScript timer, RAF loop, button shadow, or blur was added. Palette discovery is one-time startup work per selected target. This is not a device FPS benchmark.
- ZIP CRC checks and all 17 drop-in entries matched the staged files; runtime bytes matched dist and manifest hashes. All 35 npm entries matched build/docs, with test/source fixtures excluded. Stable release-version validation passed.
- A separate consumer installed the tarball offline with scripts disabled, imported public deferred/core entries without browser globals, passed strict TypeScript checks, and bundled with lazy game chunks. Its initial integration entry was 1,992 bytes.

| Deferred package path | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial scheduler | 1,956 | 1,122 |
| Additional activation bootstrap | 9,162 | 4,043 |
| Additional game on first open/start | 65,050 | 24,711 |
| Complete path | 76,168 | 29,876 |

The complete path adds 1,088 compressed bytes (about 3.8%) to v1.0.10. Sizes sum separately compressed emitted files; consuming bundlers/servers may differ. The initial scheduler remains about 1.1 kB compressed.

Palette capture handles accessible CSS and remains stable for a round. Complex pseudo-element/JavaScript/gradient-only hover surfaces or unreadable external stylesheets can use --swarm-power-color with the site's existing color token. Browser checks used controlled local pages and emulated system preferences; they did not deploy or replace the consuming Astro site's integration. GitHub checks/publication and anonymous release downloads are verified separately after pushing.
