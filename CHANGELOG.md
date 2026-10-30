# Changelog

## Unreleased

- **Accessible play (E14).** The game plays from the keyboard alone, and screen readers hear its state. The rules (`src/world.ts`), pointer play and every number stay as they were.
  - **Keyboard aim.** When a round starts, focus moves to a new *Keyboard aim* control in the scoreboard. It is hidden until focused. The arrow keys pick the nearest bug in view in that direction, and a cyan ring marks it. Enter or Space squashes it through the same path as a press on it, with the same hit, points and effects. One key press gives one squash, and a held key doesn't repeat. Like a pointer, it only reaches bugs inside the viewport. When the ringed bug dies, the ring moves to the nearest live one.
  - **Focus.** Typing the key sequence focuses the launcher it reveals. Opening the game focuses *Release the swarm*. When a view that holds focus closes, focus moves to the new view's main control: the aim control on start, resume or restart, *Resume* on pause, and *Reboot & play again* on game over. Closing the game returns focus to the launcher, or to where it was before. Nothing traps focus, and every control already showed a visible focus ring.
  - **One polite live region** (`src/announce.ts`). This local module has the same contract as the coming `fizlet/announce` brick, so a later Fizlet sync only swaps the import (Fizlet stays at the 0.17 snapshot). The region is a single `[data-fz-announce]` element per document, with `role="status"`, `aria-live="polite"` and `aria-atomic`. It is visually hidden, created on the first write and removed on destroy. It reads out the score, button integrity (in 10% steps), waves, pause and resume, rescues, edge alerts and game over. Repeats of one kind of message merge into the latest one, and the region speaks at most once a second. Game over is read at once. Updates are change-only and come from the HUD and status code, never from the fixed-step simulation. Two older regions are gone: the widget's own `#announce` and the edge cues' live region. The wave banner no longer has `aria-live`.
  - **Core API**: `SwarmCoreController` gains `aim(dx, dy)`, `clearAim()` and `squashAimed()`, which the widget's aim control uses.
  - **Playground**: the light-theme muted text colour changes from `#72776d` to `#63685e`, for at least 4.5:1 contrast. The brand link's accessible name now matches its visible text. axe-core reports no serious or critical violations on the playground (idle, launcher, intro, running, paused, in light and dark) or on the Pages redirect page. Before this change it found 33 in light and 1 in dark.
  - **Docs**: a *Keys* table in the README, and keyboard controls in `site/game.json`.
  - **Size**: measured gzip, before → after. The game on first open grows from 39,132 to 40,446 (+1,314). The complete deferred path grows from 44,605 to 45,965, and root plus game from 43,475 to 44,836. The bootstrap after load grows from 4,072 to 4,119, because the launcher now takes and gets back focus. The scheduler is unchanged at 1,400. The cause is the aim control and ring, focus handling and `announce.ts`, all in the lazily loaded game chunk. The three game ceilings in `npm run size` rise by exactly these deltas, to 41,014, 46,560 and 45,461.
  - **Tests**: `tests/announce.test.mjs` covers the region's attributes, merging, the rate limit, repeat toggling, flush and destroy. A new Chromium section plays a full round from the keyboard: start, aim and squash, Shift+Tab to pause and resume, game over, restart and Escape. It checks that the region reads out the score, integrity and game over, and that the document has exactly one live region. The cue and HUD harnesses now expect the shared region. `runtime-reviewed-baseline.json` re-pins `dom-defender`, `attack-indicators`, `swarm-widget` and `swarm-loader`; `world` is unchanged.

- **No `shared/` copies.** The four snapshot files move into `src/`, unchanged. Only import paths change: the build emits the same code at the same size (114,306 B across the entry and chunk files), so play doesn't change. `tests/fixtures/runtime-reviewed-baseline.json` re-pins `dom-defender` and `swarm-widget` for their new import lines.
  - `src/attachments.ts`: `fizlet/arcade` gives arcade games `attach()`, but Swarm keeps its own shell, so it keeps this.
  - `src/game-controls.ts`: these are the widget's own header icons and styles. No other game uses them.
  - `src/zoom-lock.ts`: this is the mobile pinch and double-tap lock. It stays until `fizlet/touch` (`lockTouch`, in progress) ships. Then Swarm swaps to it.
  - `src/selection-lock.ts`: no Fizlet brick does this yet. Swarm, DOM Battlefield and the DOM VIRUS core all use it, so a brick is proposed. The file stays here until that brick ships.

## 1.4.0

Swarm Protocol runs on **Fizlet 0.17.0** (kernel and `fizlet/board-page`, vendored in `vendor/fizlet`). The public API, the widget, loader, React and Astro integrations, every visual and the rules' numbers stay as they were.

- **The rules are one Fizlet system** (`src/world.ts`): fixed 1/60 s steps on typed arrays, seeded per round (same seed and inputs, same round). A step never allocates (tested in its own process), never reads layout and never writes the page.
- **The controller drives one engine per round**: read (viewport, buttons, surfaces, the host's UI, scroll, what covers a reserved letter), step, render (the world's events as Swarm events, particles, liquid paint, nicks, attached bugs, edge cues, canvas). Frames come from the window of the document Swarm runs in.
- **Every page change goes through the engine's ledger**: styles, attributes, the cursor, and letters through `fizlet/board-page` (which writes into the page's own text nodes and highlights the bits in the same violet). `src/bit-highlights.ts` is gone. Recall restores the page byte for byte (Chromium test).
- **Where the engine behaves differently** (documented, tested):
  - Letters are measured in the read phase on a budget: at most 600 Range reads a refresh, 12.5 Hz while the page changes, 2 Hz once it is still (1.3.1: up to 36 a frame, on demand). After a scroll or resize no bug reserves a letter until the letters are measured again (at most 0.5 s).
  - What covers a letter (a menu, a dialog) is checked with `elementFromPoint` in the read phase: a letter being chewed every frame, other reserved letters a few a frame.
  - A squash lands in the world's next step (the kill, scatter and score events follow one frame later); a second press that frame on a bug already squashed to death misses, as before. A rescue scrolls at once and pays in the next step.
  - When the page changes elsewhere (a rescan), each bug keeps its letter, found again where it was.
  - At most 64 buttons and 32 host UI areas take part in a round.
  - Without `Intl.Segmenter` (older browsers) a round runs on buttons only.
  - A host `onEvent` / `onState` callback that throws is reported (`reportError`) and the round goes on; one may stop or destroy the round from inside a frame.
- **Size**: hard gzip ceilings per loading stage in `npm run size` (part of `npm run check`). The game on first open is 39,132 B gzip (1.3.1: 30,304), of which the Fizlet kernel is 3,422 B and board-page 4,095 B; scheduler 1,400 B and bootstrap 4,071 B are unchanged. Frame work in Chromium averages 0.6 ms. See `PERFORMANCE.md`.
- **Tests**: a Chromium test in CI (`npm run test:browser`); rules tests on the world; the shell's rescue tests drive real play.

## 1.3.1

- On phones and other coarse-pointer devices, page text selection and touch callouts are off while a round runs, so tapping letters does not start a selection. Form fields and editable content stay selectable. Pausing, ending the round or Recall restores normal selection. Uses the shared DOM Virus selection lock.

## 1.3.0

Adopt the shared scoreboard action icons and keep pause, sound and close accessible when minimized. Preserve existing sounds, palette, engine state and behavior.

## 1.2.6

- Make first bites visible: a bitten button's fill fades from its own color to mint, then amber below 75% and coral below 35% health. The HUD uses the same stages.

## 1.2.5

- Restore the original coral, lilac, violet, cyan and mint palette.

## 1.2.4

- Keep native 0/1 highlight text bright with a transparent background, so light page surfaces show through.

## 1.2.3

- Raise buttons and browser panels with hard shadows in both themes; use ink-purple dark surfaces and bright arcade details.
- Publish checked release assets when the automatic version job already created the same immutable tag. Mismatched tags and existing release assets remain protected.

## 1.2.2

- Attach pulse rings and latched bug sprites to their actual button. Use a vivid neon palette and full-brightness pink binary highlights.

## 1.2.1

- Reversible mobile pinch/double-tap zoom lock while playing; native scrolling remains available. Pause and Recall restore the host policy. Set `lockZoom: false` to opt out.

## 1.2.0

- Strict TypeScript runtime migration; emitted gameplay parity against 1.1.0. Native colored bit highlights preserve text layout and Recall. Abstract site previews.

## Website update (no package release)

- Add the Astro product/test page, system/light/dark themes, real game descriptions, measured package sizes, architecture diagrams, and creator attribution.
- Add a versioned shared site kit and CI-gated GitHub Pages builds. Commit the Node 24 toolchain and lockfile.
- Keep the released game runtime at 1.1.0 unchanged.


Each published version keeps its original tag and release assets. Corrections are released under a new version.

## 1.1.0 — Viewport defense and Jump + Zap

- Spawn bugs inside the player's viewport near their pointer, avoiding protected UI. Small bugs stay with local food/buttons; grown hunters retain their mission and bite contacted letters without further growth.
- Let native scrolling outrun free bugs instead of teleporting them to the viewport edge. Attached bugs remain anchored to their real button, including nested scroll containers.
- Make offscreen alerts accessible rescue buttons: locked warning, Jump (50 points), or Jump + Zap (200 points). Every rescue adds 25 to both prices; each zap adds another 150 to the zap price. Reset prices each round.
- Jump instantly to the nearest currently attacked base on that edge. Zap all tiers within a 140–220px radius for only one point per kill, with no combo or zap-finished wave-clear bonus. Revalidate before charging and guard double activation.
- Keep the alert and flat blast in Shadow DOM / the existing canvas. Respect reduced motion, keyboard focus, native base clicks, pause, Escape, and full cleanup.
- Reduce repeated target selection and food-search work, cull offscreen default drawing, avoid unnecessary canvas resizing, cache rescue offers, and remove alert shadows/filters. Retain the existing loop, budgets, mobile fill stability, and zero runtime dependencies.
- Add rescue state/event declarations and document the game economy. Existing Astro integrations require only a package update.

## 1.0.13 — Steadier, lighter mobile button feedback

- Use a native CSS gradient with three static radial bubble layers on viewports up to 640px or coarse-pointer devices. Update the fill with health changes instead of continuously replacing SVG images.
- Use one softer beacon with a 50% longer cycle and smaller spread on mobile. Skip mobile bite shaking/ripples and sticky-hover boiling; retain bug latching and solid bug-colored bite particles.
- Suppress the native tap highlight only on powered mobile targets, restoring it on depletion, desktop-mode changes, and cleanup.
- Preserve desktop liquid/hover animation, the 12Hz maximum background update rate, reduced motion, pause, offscreen behavior, and native clicks. Switch visual paths when viewport/pointer capability changes without resetting health.

## 1.0.12 — Boiling hover and visible bite bubbles

- Replace opacity-only hover with a gentle simmer that eases up to a 4× boil on hover and settles on exit, without restarting bubble positions, health, or beacon timing.
- Use six clipped interior bubbles with radii from 1.25 to 5.2px and an opposite light/dark tone to the button's native surface. Keep labels and icons in place.
- Temporarily scope native CSS hover rules away from powered targets and their descendants/pseudo-elements, including important, nested, and group rules. Restore the rules on cleanup and native hover at depletion; preserve native clicks and focus indicators.
- Make bite particles solid, 2.4–4.2px, and the exact feeding bug color. Keep kill scores unchanged.
- Keep the 12Hz background cap, shared animation loop, 120-particle limit, offscreen suspension, pause and reduced-motion behavior. No added runtime dependency, shadow, blur, timer, or animation loop.

## 1.0.11 — Native button colors and subtle bubbles

- Start liquid power with each button's native hover color instead of fixed green, retaining yellow at 60% and pink at 25% health.
- Freeze the underlying background while powered; hover/focus only lowers fill opacity to 86%, without a color flip, level reset, or pulse change. Restore native backgrounds/hover on depletion or exit.
- Add three small interior bubbles in the original surface color, behind the existing label. Replace outlined button-bite digits with tiny, thin circle particles; leave kill-score styling and letter feeding unchanged.
- Resolve native colors once per target/round, including CSS tokens, active media queries, nesting, specificity, and named layers. Provide `--swarm-power-color` for explicit tokens or inaccessible/complex hover styles, with a native-surface fallback.
- Cap background animation at 12Hz and share the existing frame loop/particle cap. Skip liquid-wave calculations outside real bite ripples; use no extra timers, animation loops, button shadows, or runtime dependencies. Respect reduced motion and full cleanup.

## 1.0.10 — Liquid power beacons and bug-colored scores

- Match every floating kill score to the killed bug's exact color in both themes, retaining readable outlines and hold/fade timing.
- Enlarge button-bite binary digits from 10px to 15px, add outlines, and let them remain visible longer.
- Replace colored/black button stripes with a vertical liquid fill: green `#74DFA1`, yellow `#CDDE00` at 60%, and pink `#F4457A` at 25%.
- Synchronize a brief bug latch, localized liquid dip/ripple, and subtle button tug with real bites. Pulse two thin beacon rings, slowing as health drains.
- Keep power backgrounds above native hover rules, including `!important`, without resetting health or pulse timing. Brighten the existing beacon on hover/focus, refresh the underlying host background at interaction boundaries, and let native hover/focus control movement.
- Restore a depleted button's original background with a slight tilt. Keep its labels, typography, text shadows, existing shadows, and native click behavior unchanged.
- Reuse the existing canvas/frame loop and cached target geometry. Add no dependencies, animated box shadows, blur, extra timers, or animation loops. Bound liquid repainting to 20Hz while visible and recently bitten; honor reduced motion.
- Preserve activation, scoring, growth thresholds, wave rules, offscreen warnings, restoration, and the package API. Historical optimization comparisons remain archived; current behavior has independent regression coverage.

## 1.0.9 — Glowing attack cues and exit guidance

- Add the game’s bug icon beside each offscreen warning arrow, with a soft synchronized glow and pulse. Keep the warning text steady and all cue layers pointer-transparent.
- Keep the icon and border steady for reduced motion, including system preference changes. Adjust side-card widths to fit the new icon on small screens.
- Add “Press Esc to completely exit.” with an Esc keycap below the start-screen instructions.
- Preserve v1.0.8 score colors, attack detection, game rules, and activation/cleanup behavior.
- Attach the verified npm tarball and its checksum to GitHub releases, with a pinned URL install and migration instructions for Astro.

## 1.0.8 — Brand pink light-mode scores

- Change only the light-mode squash score fill to the requested brand pink, `#F4457A`.
- Retain the white outline, hold/fade timing, dark-mode palette, burst/ring colors, offscreen alerts, and gameplay.

## 1.0.7 — System-theme kill feedback

- Follow the system light/dark setting for kill scores, burst fragments, and hit/miss rings. Effects already on screen adapt on the next frame when the system setting changes.
- Use dark teal score text on light surfaces and mint on dark surfaces, with a contrasting outline, heavier type, and a longer readable hold before fading.
- Give light-mode bursts deeper tier colors and matching higher-contrast rings. Keep the existing game panel styling.
- Slow the score rise slightly; keep it stationary and omit burst fragments under reduced motion.
- Preserve scoring, wave timing, bug behavior, activation, cleanup, and offscreen alerts. Reuse one media query and the existing animation loop.

## 1.0.6 — Offscreen attack indicators

- Show a thin pulsing border on the top, bottom, left, or right edge when bugs are attached to an offscreen button. Diagonal and simultaneous attacks can light multiple edges.
- Pair the border with a directional arrow and “Other sections under attack / Scroll to squash.”
- Clear alerts when the target returns to view, attackers leave, the target is removed or breached, or the round pauses or ends. Alerts remain visible while the scoreboard is minimized.
- Honor reduced motion with a steady border. Keep cues pointer-transparent and announce direction changes politely to assistive technology.
- Reuse the existing game loop and cached geometry; add no background timers, animation loops, or layout reads. The cue UI mounts only on the first offscreen attack and is removed on destruction.
- Retain the corrected v1.0.5 activation code and existing gameplay rules.

## 1.0.5 — Corrected keyboard activation

- Correct the activation sequence to **↑ ↑ ↓ ↓ ← → ← → B A Enter**, removing the extra B A pair.
- Require the final Enter; reject the old sequence with the extra B A pair.
- Update the source, integration examples, installation guides, and generated browser test to the corrected sequence and versioned 1.0.5 paths.
- Preserve mobile hold-then-tap activation, lazy loading, Escape cleanup, and gameplay.

## 1.0.4 — First public release candidate

This version preserves the completed game and versioned paths from the tested `1.0.4` drop-in. Earlier `1.0.x` packages were development iterations, not earlier public GitHub releases.

### Game

- Agents bite individual marked letters into binary digits, grow after feeding, then hunt marked lead buttons.
- Time-based waves, faster-kill scoring, multi-hit agents, and scatter behavior when nearby agents are squashed.
- Thin vertical button stripes progress from the original surface to color, then to black.
- Optional sound, target cursor, touch input, and a scoreboard that can be hidden with the eye control while play continues.
- Hidden keyboard sequence and configurable footer hold-then-tap activation.
- Escape ends the game, restores owned page changes, and relocks activation.

### Integration

- Self-hosted drop-in ZIP with versioned assets, a base-aware Astro component, configuration, and complete instructions.
- Delayed activation after page load, then lazy loading of the engine and interface when opened.
- Shadow DOM launcher, scoreboard, and canvas; module-scoped production runtime.
- Cleanup for Astro navigation, cancelled setup, failed mounting, and page-style ownership changes.
- Separate browser-only test script for checking gameplay on an existing page.

### Distribution

- Source prepared for `coded-dot-design/swarm-protocol`.
- Version tags, release checksums, and GitHub Actions verification/release workflows.
- Published versions remain available for pinned installations and rollback.
- MIT license and retained third-party notices. npm publication is deferred.
