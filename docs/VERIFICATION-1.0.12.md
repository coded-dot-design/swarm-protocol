# Swarm Protocol 1.0.12 verification

Verified on 2026-10-23:

- Type checking, production build and all 148 automated tests passed. New checks cover solid feeding-bug-colored bite bubbles, contrasting RGB/hex/OKLCH/P3 surface tones, six varied interior radii, increased hover travel at the same 12Hz cap, scoped hover selectors, negative hover, nested/pseudo rules, and preservation of newer host CSSOM edits. Existing gameplay, score colors, pause, offscreen behavior, reduced motion, and cleanup remain covered.
- Chromium production-package gameplay passed at 1280×800 in light/dark mode and 390×844 in light/reduced-motion mode. Actual bites drained through all health states; native clicks, unchanged labels/resting shadows, kill scores, solid bite particles, Escape restoration, and absence of browser errors were checked. Background painting remained within 12Hz plus initial/state/interaction boundaries. Screenshots were inspected.
- Separate hover checks passed in desktop light/dark and mobile reduced-motion contexts: important native hover styles were suppressed for backgrounds, labels, borders, transforms, shadows, opacity, filters, descendants, group/nested rules, negative hover, and pseudo-elements. Damage continued during hover, native keyboard focus/Enter worked, and Escape restored original inline attributes and stylesheet selectors. Native hover effects returned after cleanup.
- The eleven native-palette scenarios passed in both system themes (22 cases), retaining solid/token/selector-list/specificity/media/nesting/layer/explicit/fallback/negative-hover/inline-important behavior and exact probe cleanup.
- ZIP CRC validation passed; all 17 archive entries matched their staged files. The seven runtime files matched dist and manifest SHA-256 hashes. All 35 npm tarball entries matched local build/docs; source/test fixtures were excluded. Release version validation passed.

| Deferred package path | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial scheduler | 1,956 | 1,120 |
| Additional activation bootstrap | 9,162 | 4,043 |
| Additional game on first open/start | 67,076 | 25,689 |
| Complete path | 78,194 | 30,852 |

The complete deferred path adds 976 compressed bytes (about 3.3%) to v1.0.11; the initial scheduler stays about 1.1 kB. Six bubbles share one SVG background and the unchanged 12Hz update cap. Hover accelerates their time progression rather than adding paints. External circles share the existing 120-particle limit and frame loop. No dependency, extra timer/RAF loop, blur, or button shadow was added. These checks measure sizes and deterministic paint/operation bounds, not hardware FPS.

The hover guard works with accessible stylesheets present at round start, including same-origin imports and adopted sheets. Unreadable cross-origin or later-injected sheets and JavaScript hover handlers remain host integration limitations. Browser tests used controlled local pages; they did not replace the consuming Astro site's integration. GitHub workflow results and anonymous public release downloads are checked separately after pushing.
