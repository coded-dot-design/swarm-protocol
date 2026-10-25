# Swarm Protocol: Phase 1 handoff

## Start here (for agents)

Swarm Protocol (`@chriscooley/swarm-protocol`, `1.3.1`, MIT; the npm name predates the GitHub org)
is a point-and-tap defense game, originally a hidden easter egg: bugs eat a page's letters into
binary, evolve and drain its buttons, and you squash them. Unlike the other games it has **its own
engine and widget** (`src/dom-defender.ts`, `src/swarm-widget.ts`), not the DOM VIRUS runtime; it
takes only four small helpers from the hub. It is cartridge 03 on the hub. Ecosystem context is in
the hub [HANDOFF.md](https://github.com/coded-dot-design/dom-virus/blob/main/HANDOFF.md); next
steps are in [FUTURE.md](FUTURE.md). Play: https://coded-dot-design.github.io/dom-virus/games/swarm-protocol/
Deeper references here: `README.md`, `docs/API.md`, `docs/DROP-IN.md`, `docs/RELEASING.md`,
`PERFORMANCE.md`.

| Task | Where |
|---|---|
| Bugs, food search, bites, waves, scoring, render loop, input | `src/dom-defender.ts` |
| Launcher, scoreboard, pause/result views, announcements | `src/swarm-widget.ts` |
| Offscreen alerts and Jump / Jump + Zap prices | `src/attack-indicators.ts` |
| Button fills, beacons, hover scoping, palettes | `src/attached-presentation.ts`, `src/target-*.ts`, `src/bit-highlights.ts`, `src/feedback-colors.ts` |
| Activation (key sequence, footer) and lazy loading | `src/swarm-loader.ts`, `src/swarm-deferred.ts` |
| Package entry points | `src/index.ts`, `core.ts`, `deferred.ts`, `widget.ts` |
| Astro/React adapters, drop-in template | `integration/` |
| Hub page copy and controls list | `site/game.json` |
| Scoreboard icons/styles, zoom/selection locks, attachments | not here: `dom-virus/src`, then `npm run sync:games` |

**Invariants**

- Never edit `shared/` by hand (`game-controls.ts`, `zoom-lock.ts`, `selection-lock.ts`,
  `attachments.ts`). Change `dom-virus/src` and run `npm run sync:games` there.
- A release bumps `package.json`, both top-level version fields in `package-lock.json` and
  `CHANGELOG.md` together. CI tags `v<version>`; update the hub pin in `dom-virus/games.json` only
  after the tag exists. Published tags and release assets are never moved or replaced.
- Any button you add follows the 3D press rule (top over a hard base; hover lifts the top, press
  lands exactly on the base, selected stays pressed, no overshoot, no `scale()`).
- Hot paths move only transforms and opacity; glyph measurement uses the one reusable `Range`,
  at most 36 reads per frame; button paint stays capped at 12 Hz.
- Respect reduced motion (particles and blast growth are already skipped or static).
- Mobile must stay smooth: keep the static CSS fill path on small/coarse screens.
- Host pages must be fully restored on Esc/Recall/destroy (text, button styles, hover rules,
  selection and zoom policy). Never synthesize clicks.

**Verify before you push**

```sh
npm ci                  # Node 24 (.nvmrc) for check; release.yml builds on Node 22
npm run check           # typecheck, build, all tests (also runs on prepack)
npm run size            # reports each loading stage; no hard ceiling
npm run playground:build
npm run release:build   # drop-in ZIP + SHA256SUMS.txt in artifacts/ (needs Python 3)
# Hub browser tests (Swarm colours, launch flows) use this sibling checkout:
cd ../dom-virus && CHROMIUM_PATH=/path/to/chrome npm run test:browser
```

## 1. The game

Release the swarm, defend the buttons, rescue distant attacks, Recall the page. Bugs grow a tier
every 6 letters (1, 2 or 3 hits); tier 3 hunts buttons, biting letters in its path. Waves every
18 s; caps of 48 bugs, 120 particles, 8 aim effects. Offscreen attacks raise edge alerts selling
**Jump** (50 points) or **Jump + Zap** (200), with prices rising per use and resetting per round.

## 2. How it uses the DOM

- **Letters are food** inside `[data-swarm-text]` (or `textSelector`); a bite writes `0`/`1` into
  the Text node. Links, buttons, forms, code, `[contenteditable]`, `[aria-live]` and
  `[data-swarm-ignore]` are protected.
- **Buttons are the base:** `[data-swarm-target]` (or `targetSelector`) gets a liquid fill in its
  own native hover colour, beacons and latched bugs attached to the real element. Native hover
  rules are scoped away from powered targets only and restored on cleanup; clicks still work.
- Canvas, launcher, scoreboard and alerts live in Shadow DOM. Free bugs keep document position (you
  can scroll away from them); attached bugs follow their button, including nested scrollers.

## 3. Controls

- **Pointer:** click or tap a bug to squash it. Edge alerts are real, focusable buttons. Esc exits
  completely and restores the page.
- **Mobile:** point-and-tap only: no stick, no Fire, no engine touch kit. While playing, the shared
  zoom lock blocks pinch/double-tap zoom (`lockZoom: false` opts out) and the selection lock stops
  text selection; native scrolling stays.
- Scoreboard (shared icons): sound, pause/resume, minimize, close, all reachable when minimized.

## 4. Performance

Three loading stages (scheduler, bootstrap after load + 1 s + idle, game on open); one
`requestAnimationFrame` loop that pauses on `visibilitychange`; offscreen bugs simulate but are not
drawn; a 240-glyph nearby cache with cheap ownership checks and squared distances before contact
checks; cached `Path2D` bug bodies; mobile uses a static CSS gradient fill. No per-bug timers, no
filter or shadow animation, no runtime dependencies. `tests/navigation-budget.test.mjs` enforces
call ceilings on a 48-bug workload; `PERFORMANCE.md` has the measured audits.

## 5. Size

`scripts/size.mjs` reads `artifacts/build-meta.json` and has no ceiling. At 1.3.1 (gzip):
scheduler 1,400 B; bootstrap 4,071 B; game on first open 30,304 B; complete deferred path
35,775 B; immediate root plus game 34,646 B (the hub's "full immediate path" figure).

## 6. Release

`dist/` is not committed. `check.yml` runs `npm run check`, `playground:build`, `release:build`
(ZIP uploaded as a run artifact), then `tag-version` tags `v<package.version>` on `main`.
`release.yml` runs on a pushed `v*` tag or a new `release/v<version>` branch, re-verifies the exact
commit and publishes a GitHub release (drop-in ZIP, npm tarball, checksums). The hub needs only the
tag; its hourly build already follows the newest tag in the pinned major line.

Pitfall: a tag pushed by `tag-version` with the workflow token does not start `release.yml`, so the
newest GitHub release is `v1.2.3`; `v1.2.4` through `v1.3.1` are tags without release assets. To
publish assets, create `release/v<version>` while `main` is still at that commit (`release.yml`
accepts a tag `tag-version` already created; see `docs/RELEASING.md`).

## 7. On the hub

Cartridge **03**, accent violet, "DOM DEFENSE". One action: PRESS START, then the screen morphs
into `/games/swarm-protocol/`. "TEST A RELEASE" offers `v1.0.13`.

## 8. Lessons and pitfalls

- Do not port Swarm to `createArcade` piecemeal; share helpers through `shared/` instead.
- Hover suppression must cover labels, SVG icons, pseudo-elements and group hover rules, and be
  restored on depletion and cleanup, or host buttons look broken after play.
- Mobile fills must not keep replacing SVG images (fixed in 1.0.13); update on health changes.
- Move focus away from an alert that is about to disappear; guard double activation of paid
  rescues and revalidate before charging.
- One Swarm installation per page. Shadow DOM is UI encapsulation, not a security sandbox.
- `README.md` still starts with the retired Astro site (`npm run dev`, `site:build`); use
  `npm run dev:playground`. `CHANGELOG.md` has no 1.3.1 entry.

## Keeping this file current

Update HANDOFF.md and FUTURE.md as part of any change that alters behaviour, architecture or
workflow. Every repo in the ecosystem keeps both files.
