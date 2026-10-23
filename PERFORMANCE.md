# Performance and behavior preservation

The optimization preserves the approved game rules and appearance. It reduces repeated work in the engine and defers the entire game behind a small installer. The report below measures deterministic operation counts, not hardware frame rate or elapsed performance.

## Version 1.0.11 native colors and bubbles

Native hover palette discovery runs once per target per round, using accessible stylesheet rules and one temporary background/custom-property probe. It preserves original stylesheets and removes its marker/style immediately. An explicit `--swarm-power-color` skips stylesheet discovery. This adds startup work proportional to selected targets and accessible rules; it is not per-frame or per-hover polling. Select only participating buttons. Palettes are stable for the round and sampled again on restart.

Three tiny interior bubbles are part of the existing button background, behind labels. Their bounded animation and actual bite ripples update at most 12Hz on visible powered buttons. The flat liquid path skips wave calculations outside a bite. The shared SVG clip contains both the fill and bubbles, and there are no new live DOM children per bubble. This adds ongoing background paints while visible, including between bites; it is a deliberate visual cost, not a claim of zero overhead. Offscreen targets, pauses, hidden tabs, and reduced motion suspend decorative movement.

External bite bubbles replace existing binary particles within the 120-particle cap. They use one thin canvas circle, without score outlines or text. Scores retain their existing color, outline, and timing. No runtime dependencies, JavaScript timers, additional RAF loop, button box shadows, or blur are added.

| Loaded JavaScript | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial deferred scheduler | 1,956 | 1,122 |
| Additional activation bootstrap | 9,162 | 4,043 |
| Additional game on first open/start | 65,050 | 24,711 |
| Complete deferred path | 76,168 | 29,876 |

The complete path adds 1,088 compressed bytes (about 3.8%) to v1.0.10. The initial scheduler remains about 1.1 kB compressed. Sizes sum separately compressed emitted files and do not measure device FPS.

## Version 1.0.10 target feedback

The new beacon uses two thin rounded strokes on the existing canvas, cached target rectangles, and the existing frame loop. It adds no blur, box shadows, runtime dependencies, JavaScript timers, or separate animation frames. Each real bite briefly holds the attacker at its target and triggers a 0.65-second localized liquid ripple. Ripple backgrounds are repainted at most 20 times per second, only on visible recently bitten targets. Short button nudges use the same frame loop and individual translate/rotate properties; the site's transform and label styles remain intact. Hover/focus boundaries refresh the host background once and brighten the existing beacon; there is no per-frame hover-style lookup. Geometry uses its existing 80ms dirty-refresh limit briefly while native hover movement settles. Game motion yields to native hover/focus, and damage/pulse timing is unchanged. Pause and hidden tabs freeze time-based effects with the game; explicit hover/focus may still update a paused target. Reduced motion removes ripple, shake, body pulse, and tilt, and draws a steady ring.

Floating scores keep their bug's color; only their outer outline follows the system theme. Button-bite digits are 15px rather than 10px. Both use the existing particle cap. The old column/stripe bookkeeping and painting have been removed. Text discovery still scales with marked text and target work with selected buttons; use explicit participating content rather than an entire application root.

The benchmark below is the archived optimization comparison through v1.0.9, now pinned to `tests/fixtures/dom-defender-1.0.9.js`. It is not a claim that v1.0.10 visuals or random trajectories match the old stripes. `node tests/engine-performance.mjs --refined` runs the same five behavioral workloads against the current engine, verifies current health states, and retains exact no-target feeding traces. `tests/target-health.test.mjs` additionally checks palette stages, all tier score colors in both themes, real liquid damage, unchanged host typography/shadows, latching, native button state, pause, reduced motion, hover/focus priority and motion, newer host changes, and cleanup.

The v1.0.10 production build measures:

| Loaded JavaScript | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial deferred scheduler | 1,956 | 1,122 |
| Additional activation bootstrap | 9,162 | 4,044 |
| Additional game on first open/start | 62,138 | 23,622 |
| Complete deferred path | 73,256 | 28,788 |

The complete deferred path adds 647 compressed bytes (about 2.3%) to v1.0.9's 28,141 bytes. Compression is summed per emitted file; hashed import names can cause small changes in unchanged entry chunks. The initial scheduler remains about 1.1 kB compressed. These are transfer sizes, not FPS measurements.

## Version 1.0.7 feedback contrast

Kill feedback reads one retained `prefers-color-scheme: dark` media query during the existing draw loop. There are no theme polling timers, extra animation loops, DOM theme selectors, or per-frame layout reads. A score remains fully opaque for 0.7 seconds, then fades over 0.4 seconds; the existing particle cap still applies. The five historical gameplay and page-mutation traces remain unchanged; the canvas feedback colors and duration intentionally change.

## Version 1.0.6 edge cues

Offscreen attack cues are included in the lazy game chunk, adding about 1.6 KB of gzip data after activation. The initial deferred scheduler and activation source are unchanged. The cue detector reads the bounded live-bug list and cached target rectangles within the existing frame loop; it adds no geometry reads, timers, or animation frames. Cue DOM is created only for an actual offscreen attack, and repeated frames with the same affected edges do not rewrite it. A CSS opacity pulse respects reduced motion. The historical gameplay and page-mutation traces still match.

## Loading boundary

The recommended `./deferred` entry initially loads a small scheduler. It waits for page load, then a default 1,000 ms delay, then an idle opportunity with a 2,000 ms timeout. Browsers without idle callbacks use a timer fallback. Hidden tabs hold setup and restart the delay when visible. The bootstrap is dynamically imported only after these gates; the widget and engine remain another dynamic import on first open/start. Astro's copied component and the optional React adapter use this same path.

The scheduler adds small initial JavaScript and temporary lifecycle listeners/timers; this is not zero-cost installation. Once the activation bootstrap is installed and dormant, it has input/lifecycle listeners but no game UI, canvas, audio context, storage reads, animation loop, or recurring timer. The keyboard sequence reveals a floating target button; the footer secret opens instructions. Secret inputs begin listening after delayed setup finishes. Cancellation prevents a downloaded module from mounting after a route change/unmount; the browser may retain the module in its cache.

The package tests follow the esbuild output graph: `./deferred` and `./react` must have no static bootstrap/engine/widget edge, and the root entry must have no static engine/widget/React edge. React remains external. Run `npm run size` after a build for exact emitted sizes.

The **1.0.4** distribution measures as follows, summing files compressed separately with Node's default gzip settings. These sizes exclude the optional React adapter/runtime and Astro's component glue. A consuming bundler or server can change chunking and compression.

| Loaded JavaScript | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Initial deferred scheduler | 1,954 | 1,121 |
| Additional activation bootstrap after load/delay/idle | 9,168 | 4,044 |
| Additional widget/engine on first open or start | 53,271 | 20,666 |
| Complete deferred path | 64,393 | 25,831 |
| Immediate root installer, alternative initial load | 9,175 | 4,049 |

The production Astro path therefore begins with approximately **1.1 kB compressed** of package JavaScript. The later bootstrap and game retain the approved activation and gameplay. The standalone HTML demonstration deliberately embeds all code; it is not the production split-loading artifact.

## 1.0.4 production pass

The scheduler defers even the activation listeners until after the page's load/delay/idle gates, and all pending work is cancelable. Host `onState`/`onEvent` failures are isolated at the installer: a failed hook is disabled and reported once rather than interrupting gameplay. Low-level widget mount failures clean up before rethrowing. Painted CTA/surface properties yield to newer application values or priorities, preserving host changes through later repaint and restoration. The five historical engine traces still match exactly.

Steady-state work has explicit limits: at most 48 live/queued bugs, 120 particles, eight aim rings, 36 glyph-range measurements in a frame, and a 240-item nearby-letter cache. Initial text discovery still scales with marked text, and the historical stripe implementation stored columns proportional to marked CTA widths. Mark selected static copy and CTAs, not an entire application root. Cleanup cancels animation work, timers, listeners, and active audio voices. Destroy closes the audio context; ordinary stop retains it for reuse.

## 1.0.1 isolation and activation changes

The bugs' canvas now belongs to an owned shadow root, like the score panel and launcher. The one extra host is not an additional frame loop. The mobile footer secret has timers only while a hold or its five-second cue is active; no timer runs during dormant installation. Escape tears down the game and returns to the locked state. Gameplay constants are unchanged.

## 1.0.2 scoreboard minimization

Minimize changes only which widget controls are visible. It preserves the existing engine, round, score, and status: active gameplay continues, while a paused round stays paused. The floating target restores the panel, and game-over results reopen automatically. The installer and React adapter cancel queued opening when minimized and never load the game for minimize alone. No new animation loop, polling timer, or runtime dependency is added. In the 1.0.2 build, the default bootstrap plus game was 426 gzip bytes larger than 1.0.1; the core engine source was unchanged.

## Deterministic engine comparison

The archived portable harness compares the v1.0.9 engine with the exact historical pre-optimization source in `tests/fixtures/dom-defender-before-perf.js`. That fixture is historical test code, may retain historical naming/comments, and is excluded from the runtime tarball. The repository's MIT and Lucide ISC notices cover the applicable original code and embedded icon geometry.

The recorded run used Node **v24.19.0**, seeded randomness, a fixed 60 Hz fake clock, and an instrumented minimal DOM/canvas fixture. Five workloads produced **8,827 active frames**:

1. Physical feeding, Unicode graphemes, pauses, wave clearing, and newer application text.
2. A food-heavy, 48-bug swarm with timed waves.
3. Mobile offscreen pursuit, a full swarm, target stripe phases, and target resizing.
4. Cursor behavior, protected controls, and compatibility-click suppression.
5. Reduced-motion tap feedback.

For every workload, the SHA-256 trace of all frame-level bug positions/state, affected DOM text/styles, public events, and public snapshots matched exactly before and after. The complete counters, source hashes, and trace hashes are in `tests/performance-results.json`.

| Instrumented operation | Before | After |
| --- | ---: | ---: |
| `Math.hypot` calls | 446,332 | 216,861 |
| Sort calls | 15,963 | 715 |
| Sort comparisons | 280,356 | 20,388 |
| Filter calls | 375,436 | 59,020 |
| Slice calls | 15,755 | 655 |
| `Range` allocations | 9,484 | 4 |
| `matchMedia` calls | 141 | 5 |
| Style writes | 401 | 202 |
| Attribute writes | 57 | 24 |

Glyph geometry reads (9,484), element rectangle reads (2,000), computed-style reads (11,002), and eligibility checks (141,681) stayed unchanged. This pass keeps the existing collision and letter-measurement behavior. The extra canvas host adds ten attribute assignments across these five workloads, including creation and removal. At most one animation frame was pending and at most 34 range reads occurred within one frame in these workloads.

The optimized unminified engine is larger: **55,198 → 58,590 bytes**, or **15,865 → 16,837 bytes** with gzip level 9. The 972-byte compressed increase buys fewer repeated calculations, allocations, sorts, and writes. Distribution minification and deferred loading are separate improvements; this report does not equate fewer operation calls with a measured FPS gain.

## Score-panel rendering

The widget now retains its UI element references and avoids assigning unchanged text, visibility, and style properties. A separate portable harness compares it with the exact historical widget in `tests/fixtures/swarm-widget-before-hud.js`.

Across 500 repeated snapshots—100 each for running, frenzy, paused, intermission, and game-over states—the following redundant work changed:

| Operation during repeated snapshots | Before | After |
| --- | ---: | ---: |
| ID lookups | 11,700 | 0 |
| `textContent` assignments | 4,600 | 0 |
| `hidden` assignments | 4,000 | 0 |
| Inline-style assignments | 1,500 | 0 |

Sixteen rendered UI checkpoints and all 512 public snapshot callbacks match exactly in normal and hidden-launcher configurations. The comparison covers all pre-existing elements; the new Minimize eye control is checked separately because it is intentionally absent from the historical fixture. The harness models CSSOM color normalization and checks listener/destroy cleanup. Separate checks verify canvas shadow ownership, complete Escape teardown, native page Escape handling, no audio activation on Escape, and normal Close behavior. The minimize lifecycle checks cover both launcher configurations, ongoing gameplay and callbacks, paused state, manual reopening, automatic results, focus, and reset/cleanup paths. Class-list toggles and intermission feed class assignments remain unchanged; this does not remove every DOM write. The report is in `tests/widget-hud-results.json`. It uses a stub engine to isolate rendering, not a device FPS measurement.

## Reproduce

```sh
npm ci
npm run check
node tests/engine-performance.mjs
node tests/widget-hud-performance.mjs
```

The harness also accepts `--engine`, `--baseline`, and `--report` paths. It instruments built-in operations only within its own Node process. Production modules contain no test hooks.

The scheduler suite covers page-load/delay/idle ordering, timer fallback, hidden-tab suspension, import races, and cancellation. The loader regression suite covers deferred-import cancellation, concurrent open/start intent, synchronous callback reentrancy, full Escape exit/relock, the held-footer activation window, gesture cancellation, and resource cleanup. Package tests cover SSR and the generated declaration exports. Real-browser checks are still needed for a host site's fonts, layout, CSP, form behavior, scrolling, touch, and audio; these fixtures are not a browser or device benchmark.
