# Changelog

Each published version keeps its original tag and release assets. Corrections are released under a new version.

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
