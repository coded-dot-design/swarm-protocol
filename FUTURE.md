# Swarm Protocol: Future phases

Repo-specific items. The shared roadmap (controls layer, hub performance, hardening, platform) is
the hub [FUTURE.md](https://github.com/coded-dot-design/dom-virus/blob/main/FUTURE.md). Phase 1
state is in [HANDOFF.md](HANDOFF.md). Move items to `CHANGELOG.md` when they ship.

## Phase 2

### Controls layer (shared, top priority)

- Swarm keeps its own engine and widget, but should stop hand-wiring input. Declare an intent map
  (`pointer: squash`, `secondary: [jump, zap]` for the rescue offers, plus pause/sound/Recall) and
  let the shared controls layer own the base layer: Esc and P defaults, focus handling, reduced
  motion and sound preferences, and gamepad (a cursor plus a squash button).
- Take the mobile layer's zoom/selection locks and safe-area handling from the layer instead of the
  copied `shared/zoom-lock.ts` and `shared/selection-lock.ts`. No stick or Fire is needed.
- Share the scoreboard and 3D press styling with the layer (it already uses the shared
  `game-controls.ts` icons and styles) so Swarm's panel matches the other games.

### Gameplay

- Bug types that interact with the page differently (one that hides behind images, one that
  targets links only when the host opts in).
- A boss wave that attacks the button with the most remaining power.
- Per-page high score memory beyond the current local best.

### Performance and size

- Add a hard gzip ceiling to `scripts/size.mjs` for each loading stage (it only reports today),
  starting near the 1.3.1 figures: scheduler ~1.4 KB, bootstrap ~4.1 KB, game chunk ~30.3 KB.
- Refresh `PERFORMANCE.md`: its loading table still shows older figures (game chunk ~27.6 KB).

### Tests and release

- Fix the release gap: tags from `tag-version` do not trigger `release.yml`, so `v1.2.4` to
  `v1.3.1` have no GitHub release assets. Either publish from the same check workflow after
  tagging, or tag with a token that can trigger workflows, then backfill or document the gap.
- Align Node versions (`check.yml` uses 24, `release.yml` and the README's release section use 22).
- A real-device pass for tap accuracy on small bugs and for the edge alerts on notched phones.

### Accessibility

- Bugs are pointer-only targets. Offer a keyboard path (for example Tab to cycle the nearest
  threats, Enter to squash) without making the canvas focus-heavy.
- Announce tier evolutions and button losses through the existing live region, rate-limited.

### Docs and content cleanup

- Shared files copied by `sync:games` have no provenance record; add an `ORIGIN.json` like the
  engine games and Battlefield.

## Phase 3

- Embeddable "Swarm on any site" drop-in that can also mount the hub console's cartridge.
- Let Swarm bugs appear as an entity type in other games through a shared entity adapter.
- Decide whether to move to the `@coded-design` npm scope (a breaking package rename).
