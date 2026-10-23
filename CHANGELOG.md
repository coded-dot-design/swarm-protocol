# Changelog

Each published version keeps its original tag and release assets. Corrections are released under a new version.

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
