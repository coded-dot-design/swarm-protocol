# Swarm Protocol

## Play and develop the Astro site

Product page: https://coded-dot-design.github.io/swarm-protocol/ (available after Pages is enabled and the deployment succeeds). Created by **Chris Cooley / coded.design**.

Use Node **24** (`nvm use`), then run from this repository, where `package.json` lives:

```sh
npm ci
npm run dev
```

Open the exact local URL Astro prints, including the `/swarm-protocol/` base path. `npm ci` uses the committed lockfile. `npm run dev:playground` keeps the original Vite regression playground available. The product site loads built game distributions; after editing game source, run `npm run build` and restart `npm run dev`.

```sh
npm run check
npm run site:build
npm run site:preview
```

`site:build` writes static output to `artifacts/site` and checks the launch script, styles and Pages asset paths. Pages builds run on every push to `main`; PR checks also build the product site. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. No custom domain or paid hosting is required for this public repository. If the deploy job ran before enabling Pages, rerun that failed job afterward.

The page defaults to your system color scheme, with persistent light/dark overrides. Game launches are explicit and lazy-loaded. Recall destroys the active controller and restores eligible game-owned edits. Menu controls, code examples and the launcher are excluded from game targets.



A hidden, opt-in game that runs across a real webpage. Little agents eat selected letters into `0` and `1`, grow stronger, and hunt marked buttons. Squash them before the buttons lose their color.

Install the versioned npm package or use the **self-hosted drop-in ZIP**. Both serve the built game with your own website assets. Visitors do not load the game from GitHub, npm, or a separate game server.

**v1.1.0** adds points-funded **Jump / Jump + Zap** to offscreen attack alerts. Bugs arrive in your viewport near the pointer; small bugs stay near local food and buttons, while grown hunters keep their mission and bite letters in their path. Scrolling can outrun the swarm. Mobile keeps its steady CSS fill and lighter effects; desktop retains its hover boil. Activation remains **↑ ↑ ↓ ↓ ← → ← → B A Enter**.

## Local playground

Test on a standalone fictional webpage before updating your company site. From this repository, with Node 22.12+ (or Node 24):

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Start, pause, and reset the real game; test distant attacks, letters only, nested scrolling, system light/dark mode, and ordinary page interactions. Source edits reload directly. The playground and Vite are development-only and are excluded from the game package and drop-in ZIP. See **[playground setup and testing](playground/README.md)** for phone testing, updates, build preview, and adding future games.

## Install the drop-in ZIP in Astro

Download `swarm-protocol-drop-in-1.1.0.zip` from the `v1.1.0` release, then extract it. Choose the built drop-in asset; GitHub's automatically generated source archives contain the development project.

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

Keep the CTA's current URL and handlers. Select static presentation text and lead-opening buttons outside forms/dialogs. You can configure exact CSS selectors instead of adding attributes; edit `public/swarm-protocol/1.1.0/install.js`.

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

When bugs attack an offscreen button, the edge alert offers the strongest action your score can afford. Below 50 points it warns you to scroll manually; from 50 points it offers **Jump**; from 200 points it offers **Jump + Zap**. Every rescue raises the jump price by 25 points and the zap price by 25 points; each zap raises its price by another 150 points. A zap clears a 140–220px radius around the destination, returning only 1 point per kill. It earns no combo multiplier or bonus for a wave it finishes. Prices reset on restart. Manual scrolling is always free.

Alerts are keyboard/touch controls in a separate Shadow DOM. The rest of the overlay remains pointer-transparent. They clear when the attack stops, the target becomes visible, or the round pauses/ends; reduced motion uses a steady warning and a brief stationary zap ring.

Kill scores keep the exact color of the squashed bug in both system themes. A dark inner outline and theme-aware outer outline keep them distinct over page content, with 0.7 seconds fully opaque followed by a 0.4-second fade. Burst fragments and hit rings still adapt to the system light/dark setting. Reduced motion keeps scores stationary and removes fragments. No theme switch or extra configuration is needed.

## Install through npm and Astro

For an integration managed by your site's build, install the versioned npm package asset:

```sh
npm install https://github.com/coded-dot-design/swarm-protocol/releases/download/v1.1.0/chriscooley-swarm-protocol-1.1.0.tgz
```

Use the included `integration/SwarmProtocol.astro` template and the deferred package entry, following [the npm/Astro guide](./docs/API.md#astro). Keep one installer and preserve existing selector/storage configuration when migrating from the drop-in. Commit the package manifest and lockfile. The game is served by your website after building; GitHub is only a package source during installation. npm registry publication is not required.

## Stay on a tested version

Each published release has its own tag, ZIP, and static asset folder. A site using `/swarm-protocol/1.1.0/install.js` keeps using that version as this repository evolves.

The exact-version download pattern is:

```text
https://github.com/coded-dot-design/swarm-protocol/releases/download/v1.1.0/swarm-protocol-drop-in-1.1.0.zip
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
