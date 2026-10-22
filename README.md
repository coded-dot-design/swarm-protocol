# Swarm Protocol

A hidden, opt-in game that runs across a real webpage. Little agents eat selected letters into `0` and `1`, grow stronger, and hunt marked buttons. Squash them before the buttons lose their color.

The supported installation is a **self-hosted drop-in ZIP**. Copy the built files into your website and serve them with your own assets. Visitors do not load the game from GitHub, npm, or a separate game server.

**v1.0.8** uses brand pink (`#F4457A`) for light-mode kill scores. Feedback continues to follow the system light/dark setting, including changes during play. It includes v1.0.6 directional edge alerts when bugs attack buttons outside the viewport. The corrected keyboard activation remains **↑ ↑ ↓ ↓ ← → ← → B A Enter**. npm publication is not required to use this release.

## Install in Astro

Download `swarm-protocol-drop-in-1.0.8.zip` from the `v1.0.8` release, then extract it. Choose the built drop-in asset; GitHub's automatically generated source archives contain the development project.

1. Copy `public/swarm-protocol/` into your Astro project's `public/` folder.
2. Copy `components/SwarmDropIn.astro` into your project's `src/components/` folder.
3. Import and render that component once in your existing shared layout:

```astro
---
// Keep your layout's existing imports and frontmatter.
import SwarmDropIn from '../components/SwarmDropIn.astro';
---

<!-- Add this near the end of the existing body. -->
<SwarmDropIn />
```

Mark your existing elements:

```astro
<h1 data-swarm-text>Your existing heading</h1>
<p data-swarm-text>A little static copy for the agents to eat.</p>

<a href="/contact/" data-swarm-target>Contact us</a>

<footer>
  <span data-swarm-trigger>© {new Date().getFullYear()}</span>
  Your company
</footer>
```

Keep the CTA's current URL and handlers. Select static presentation text and lead-opening buttons outside forms/dialogs. You can configure exact CSS selectors instead of adding attributes; edit `public/swarm-protocol/1.0.8/install.js`.

Run your site's usual `npm run dev`, or `npm run build` followed by `npm run preview`. No commit, deployment, package install, or React integration is needed for this test.

See **[the complete drop-in guide](docs/DROP-IN.md)** for mobile testing, configuration, ordinary HTML integration, browser-only testing, troubleshooting, and removal.

## Play

| Control | Behavior |
| --- | --- |
| `↑ ↑ ↓ ↓ ← → ← → B A Enter` | Reveal the target launcher while ordinary page content is focused. |
| Hold marked footer text for 900 ms, release, then tap within five seconds | Open the instructions on mobile. |
| Eye control | Hide the scoreboard while the same round continues. |
| Target launcher | Reopen the scoreboard. |
| Escape | End the round, restore the page, and fully hide/relock the game. |

No Caps Lock or modifier chord is used. On desktop, open the launcher and select **Release the swarm**. The mobile secret opens those instructions directly. Letter eating, time-based waves, scatter behavior, multi-hit agents, sound, and the target cursor are included.

When bugs attack a button outside the viewport, a thin pulsing border and arrow point toward it with **“Other sections under attack — Scroll to squash.”** Scroll in that direction to defend it. The cue clears when the button comes into view or the attack stops, remains visible with the scoreboard minimized, and becomes steady when reduced motion is enabled.

Kill scores, burst fragments, and hit rings follow the system light/dark preference automatically. Light-mode scores use brand pink (`#F4457A`) while bursts and rings retain their deeper colors; scores have a contrasting outline and stay fully opaque for 0.7 seconds before a 0.4-second fade. A system theme change updates active effects on the next game frame. Reduced motion keeps score text stationary and removes burst fragments. No theme switch or extra configuration is needed.

## Stay on a tested version

Each published release has its own tag, ZIP, and static asset folder. A site using `/swarm-protocol/1.0.8/install.js` keeps using that version as this repository evolves.

The exact-version download pattern is:

```text
https://github.com/coded-dot-design/swarm-protocol/releases/download/v1.0.8/swarm-protocol-drop-in-1.0.8.zip
```

That URL becomes available when the release is published. Download once and copy the files into your site; it is not a browser script URL. Avoid a `latest` download URL in automation that must stay pinned.

To upgrade, copy the new release's complete version folder alongside the old one, carry over your selector/storage configuration, and update the version in your local `SwarmDropIn.astro`. Test before releasing the site. To roll back, point the component at the retained old folder. Never load both installers together.

Published tags and release assets are preserved. Fixes get a new version. See **[release and versioning instructions](docs/RELEASING.md)**.

## Loading and page isolation

The small installer and scheduler load with the page. Activation code waits for page load, a one-second delay, then an idle opportunity; the engine and game interface load when opened. Astro navigation cleans up pending setup or an active installation.

The launcher, scoreboard, and canvas use Shadow DOM. Production code is module-scoped and adds no globals. The selected page text, button styles, surfaces, cursor, and footer cue are intentional interactions whose owned changes are restored on exit. Shadow DOM is UI encapsulation, not a JavaScript security sandbox.

The release includes a separate self-contained DevTools test script. It can temporarily run on an already-open page, but embeds the whole game and does not represent production loading performance. Use only one Swarm installation on a page.

## Develop and build a release locally

To build from source, use Node 22, matching CI, and Python 3 for the standard-library ZIP builder. Neither is an extra game dependency for a site using the prebuilt drop-in. Run from this repository:

```bash
npm ci
npm run check
npm run release:build
```

`check` runs the typecheck, runtime build, and test suite. `release:build` creates the versioned drop-in ZIP and `SHA256SUMS.txt` in `artifacts/`. Neither command publishes anything.

The runtime sources are in `src/`; framework adapters are in `integration/`. The optional programmatic/React API is documented in **[API.md](docs/API.md)**. The internal package name remains `@chriscooley/swarm-protocol`; the GitHub organization name does not require a runtime change or npm publication.

## License

MIT © 2026 Chris Cooley. Retain [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) when redistributing. A visible credit is appreciated and optional.
