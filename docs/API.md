# Swarm Protocol

A small, opt-in game that turns selected page content into a playground. Bugs physically eat letters, grow into button hunters, and drain liquid power from your marked targets. Click or tap to squash them, build combos, and survive the next wave.

The installation is completely hidden. The recommended `./deferred` entry initially loads a small scheduler, waits for page load, a one-second delay, and an idle opportunity, then imports the activation bootstrap. That bootstrap creates no game UI, canvas, audio context, animation loop, or storage reads. The keyboard sequence reveals a small floating target button; a completed footer secret opens the instructions. The engine and full widget load only when the visitor opens or starts the game.

Original game and integration code: **MIT, copyright 2026 Chris Cooley**. The embedded Lucide bug geometry retains its ISC license; see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Install the prepared package

For an npm-managed Astro integration, install the pinned package asset from the GitHub release:

```sh
npm install https://github.com/coded-dot-design/swarm-protocol/releases/download/v1.0.13/chriscooley-swarm-protocol-1.0.13.tgz
```

This records the versioned URL in your package manifest and lockfile. Commit both so CI can install the same package. GitHub is contacted during dependency installation; the deployed game is bundled and served by your own website. Pushing to GitHub does not change an installed version automatically. npm registry publication is still deferred; the package name remains `@chriscooley/swarm-protocol`.

See [Astro](#astro) below for the included component. When migrating from the drop-in, replace `SwarmDropIn` with `SwarmProtocol` in your shared layout, carry over selector/storage configuration, and remove the old installer include. Once no code references them, remove the old `SwarmDropIn.astro` and copied `public/swarm-protocol/` files. Preserve the existing `data-swarm-*` page attributes and CTA handlers. If upgrading from a local `file:vendor/...tgz` dependency, the URL install replaces that dependency; remove its unused vendor tarball after confirming the manifest and lockfile use the URL.

The [self-hosted drop-in ZIP](./DROP-IN.md) remains available for sites that prefer copied static assets. You can also install a downloaded package file directly with `npm install ./chriscooley-swarm-protocol-1.0.13.tgz`.

To create a tarball from the source repository:

```sh
npm ci
npm pack
```

`npm pack` runs type checking, the minified build, and tests first. The release workflow packages the same build after those checks have passed. The package is ESM, has **zero runtime dependencies**, and declares React as an optional peer. Only the `./react` entry requires React. Build and test dependencies do not ship in the runtime package.

## Plain JavaScript

Use the deferred installer on the client and retain its scheduling handle for cleanup:

```js
import { installSwarmDeferred } from '@chriscooley/swarm-protocol/deferred';

const pending = installSwarmDeferred({
  triggerSelector: '[data-swarm-trigger]',
  targetSelector: '[data-swarm-target]',
  storageKey: 'my-site-swarm-best-v1',
  onError: error => console.error('Swarm Protocol:', error),
}, { delayMs: 1000, idleTimeoutMs: 2000 });

void pending.ready.catch(error => console.error('Swarm setup failed:', error));
// pending.ready resolves to the installer handle, or null when canceled.
// On route changes or unmount: pending.destroy();
```

It waits for page load, then `delayMs`, then an idle opportunity with `idleTimeoutMs` as the idle timeout. A timer substitutes when idle callbacks are unavailable. Hidden tabs wait until visible and restart the delay. `destroy()` cancels pending setup or destroys the completed installation. A late import cannot mount after cancellation. The secrets start listening only after the delayed bootstrap is ready; the initial script still contains the small scheduler and lifecycle glue.

If your application already owns scheduling, `import { installSwarm } from '@chriscooley/swarm-protocol'` installs the hidden activation bootstrap immediately and returns the controller directly. The following `swarm` examples refer to that controller, obtained either directly or from `pending.ready`.

All entries can be imported during server rendering; call installers only in a browser. Keep the entire generated `dist/` tree when serving the build without an application bundler. Neither entry statically imports the engine or widget. The standalone HTML demo embeds all code for convenience; use the split npm build for production loading.

### Mark the content

Add attributes to existing elements while preserving their original handlers, links, and semantics:

```html
<h1 data-swarm-text>Keep the critical work isolated.</h1>
<p data-swarm-text>These letters are part of the game.</p>

<button
  type="button"
  data-swarm-target
  data-swarm-label="Contact"
>
  Contact us
</button>

<!-- Explicitly choose the copyright/date text used for the mobile secret. -->
<footer><span data-swarm-trigger>© 2026</span> Your company</footer>
```

| Attribute | Purpose |
| --- | --- |
| `data-swarm-target` | A button or link that bugs can hunt and damage. |
| `data-swarm-label` | A short, readable target name for the score panel. |
| `data-swarm-text` | Static presentation text whose eligible letters can be eaten. |
| `data-swarm-surface` | Optional presentation surface that may show temporary damage. |
| `data-swarm-trigger` | Hold this footer text for 900 ms, then tap it during the five-second color cue. |
| `data-swarm-ui` | Protect game controls and other interface regions from game input. |
| `data-swarm-ignore` | Exclude an entire region from targeting, text/surface changes, game input, and the cursor. |

Choose lead-opening targets outside actual forms and dialogs. Form fields, forms, dialogs, editable content, and unmarked buttons retain native input. Do not use a form's submit button as a game target. All connected, rendered marked targets participate, including targets currently offscreen.

Text changes happen on individual text nodes outside a framework's reconciler. Use static presentation copy and stop the round before replacing an affected region. Links, buttons, form fields, editable content, code, live announcements, scripts, styles, and protected UI are excluded from letter eating. Quit, restart, unmount, and the automatic restoration after a loss restore recorded page changes while preserving newer application writes.

## Configure the hidden trigger and game targets

`triggerSelector` chooses the footer text used for the secret; `targetSelector` chooses the buttons or links the bugs hunt. Both already accept normal CSS selectors. Prefer explicit `data-swarm-trigger` and `data-swarm-target` attributes so only the elements you choose participate. These are the defaults, shown together here so they are easy to customize:

```js
const swarm = installSwarm({
  triggerSelector: '[data-swarm-trigger]',
  targetSelector: '[data-swarm-target]',
});
```

The same options are React props:

```tsx
<SwarmGame
  triggerSelector="[data-swarm-trigger]"
  targetSelector="[data-swarm-target]"
/>
```

For existing markup, replace either value with a specific selector, such as `'#footer-copyright'` or `'[data-lead-cta]'`. Multiple marked game targets can participate; the footer secret must be completed on the same chosen trigger. Keep triggers on plain text and hunted CTAs outside forms, dialogs, and editable regions. The game does not infer targets from button wording or guess which copyright text is the secret.

## Hidden activation and exit

By default, enter this sequence with page content focused:

**↑ ↑ ↓ ↓ ← → ← → B A Enter**

Each next key must arrive within 2.2 seconds. Text fields, editable regions, controls, menus, and protected UI do not participate. The sequence reveals a 46-pixel floating target button, detached from the screen edge. It expands to show **Swarm Protocol** on hover or keyboard focus. Clicking it loads the game and shows instructions without starting a round.

For the mobile secret, mark the copyright/date text explicitly with `data-swarm-trigger`, or provide its selector with `triggerSelector`. Hold that same element for **900 ms**, then release. The text changes color and fades during a **five-second window**. A separate tap on it before that window closes opens the game instructions. The release that completed the hold never opens the game by itself; ordinary taps and arbitrary footer text do not activate it. Moving away, scrolling, cancellation, leaving the page, and Escape cancel the pending gesture or cue. These gesture timers exist only while the visitor is interacting with the chosen trigger.

```js
const swarm = installSwarm({
  triggerSelector: '#site-copyright',
});
```

**Escape immediately ends the round, removes every bug, restores the page, hides all game UI, and locks the installation again.** Returning requires the full key sequence or footer secret. Escape also cancels opening while the module downloads. It does not block the page's own Escape handling, such as closing a dialog. Closing the game with its normal Close control restores the round and returns to the floating target button. Pause and Resume remain explicit controls.

There is no Caps Lock listener, Caps Lock visibility toggle, or modifier-chord activation mode. Set `keyboard: false` and/or `triggerSelector: false` to disable built-in unlock inputs. There is no stored unlock state between installations or page visits. Application code can still explicitly open the game through its handle:

```js
swarm.unlock();       // Reveal only the floating target button; no game download.
await swarm.open();   // Show instructions, or restore the current round's panel.
await swarm.start();  // Load if needed and start a round.
```

## Minimize the scoreboard while playing

Use the scoreboard's **Minimize** control to fold it into a small target button. The existing round continues: bugs move and eat, targets take damage, and waves arrive as before. A paused round stays paused. Programmatic pause/resume calls preserve the minimized presentation. Tap the floating target to restore the same scoreboard; reopening does not start a new round or resume a paused one. Results automatically reappear when the game ends.

The installer and React ref both expose the same control:

```js
swarm.minimize();             // Fold an existing active round; no game download.
await swarm.open();           // Restore its panel without resetting the round.
// React: game.current?.minimize()
```

Minimize is available for running, intermission, and paused rounds. It leaves the instructions and final results visible. Use Pause to freeze gameplay, Close to stop and restore the page, and Escape to fully exit and relock. Calling `minimize()` while opening is still pending cancels that opening; it does not load or start the game.

## Astro

Use the included framework-free component so Astro does not need React solely for this game:

```sh
mkdir -p src/components
cp node_modules/@chriscooley/swarm-protocol/integration/SwarmProtocol.astro src/components/SwarmProtocol.astro
```

Import it in your existing shared layout and add `<SwarmProtocol />` once near the end of the body. Edit the component's selector and storage-key constants, then mark the existing footer text, CTAs, and static text. Its processed script uses `./deferred`, handles an initial boot and `astro:page-load` idempotently, and destroys pending or active setup on `astro:before-swap`.

```astro
---
import SwarmProtocol from '../components/SwarmProtocol.astro';
---
<!-- Inside your existing layout's body, after the page content: -->
<SwarmProtocol />
```

Keep the template's plain `<script>` with no `is:inline` or `type` attribute so Astro processes its TypeScript and npm imports. See [Astro scripts](https://docs.astro.build/en/guides/client-side-scripts/) and [navigation lifecycle events](https://docs.astro.build/en/guides/view-transitions/#lifecycle-events). For a copied-static-assets integration, use the separate [drop-in guide](./DROP-IN.md) and its `SwarmDropIn.astro` component. That external-script component intentionally uses `is:inline`; this npm component uses a processed script instead.

An existing Astro React integration can instead use `<SwarmGame client:idle />` from the React entry. The adapter uses the same load/delay/idle scheduler after hydration. Keep one integration and do not use `transition:persist` for the initial setup.

## React

Use the same game through the optional adapter:

```tsx
import { useRef } from 'react';
import SwarmGame, {
  type SwarmGameHandle,
} from '@chriscooley/swarm-protocol/react';

export function App({ pathname }: { pathname: string }) {
  const game = useRef<SwarmGameHandle>(null);

  return (
    <>
      <main>
        <h1 data-swarm-text="">Keep the critical work isolated.</h1>
        <button type="button" data-swarm-target="" data-swarm-label="Contact">
          Contact us
        </button>
      </main>
      <footer><span data-swarm-trigger="">© 2026</span> Your company</footer>
      <SwarmGame
        ref={game}
        routeKey={pathname}
        storageKey="my-app-swarm-best-v1"
      />
    </>
  );
}
```

The adapter renders an empty host during SSR and starts the same deferred scheduler inside its effect. `delayMs` and `idleTimeoutMs` default to 1000 and 2000. It remains hidden until unlocked. Parent renders and updated callbacks do not restart it. Pass a changed `routeKey` when a persistent layout swaps content. Effect cleanup and Astro’s before-swap event destroy the scheduler/installation; pending setup cannot mount after navigation or unmount. The ref exposes the installer methods except `destroy()`, which React owns. `open()` and `start()` return promises and can be requested before the client module finishes loading. Minimize, pause, stop, hide, route changes, and unmount cancel queued opening requests.

## Keep your real CTA/form flow

A successful bug hit consumes that pointer action and its compatibility click. A missed shot on a marked target stays a genuine click for the site's existing handler. The game does not synthesize CTA clicks, open a form, or submit data.

Pause at the application's existing form-opening hook:

```js
function openLeadForm() {
  swarm.pause(); // In React: game.current?.pause()
  existingOpenLeadForm();
}
```

Mark the form's outer modal or panel `data-swarm-ui`. Leave the round paused when the form closes so the visitor can choose Resume, or explicitly resume through the same handle. If the form code lives outside an Astro installer, keep the handle in that client module or connect it to the site's existing form-open event; do not add another game instance.

## API

`installSwarm(options?)` accepts the options below. `installSwarmDeferred(options?, scheduling?)` accepts the same options plus `{ delayMs?: number, idleTimeoutMs?: number }` in its second argument, and returns `{ ready, destroy }`. React adds the two scheduling values as props.

| Option | Default |
| --- | --- |
| `targetSelector` | `[data-swarm-target]` |
| `textSelector` | `[data-swarm-text]` |
| `surfaceSelector` | `[data-swarm-surface]` |
| `storageKey` | `swarm-protocol-best-v1` |
| `keyboard` | `'sequence'`; or `false` |
| `triggerSelector` | `[data-swarm-trigger]`; or `false` |
| `reducedMotion` | Browser preference |
| `host` | Widget host created on first open/start |
| `document` | The host's document, or the current browser document |
| `onState`, `onEvent`, `onError` | Optional callbacks |

The handle has `unlock()`, `open()`, `start()`, `minimize()`, `pause()`, `resume()`, `stop()`, `hide()`, `destroy()`, `getSnapshot()`, and `isUnlocked()`. `minimize()` folds an active round without changing its status. `stop()` restores the round and returns to the unlocked floating button when visible. `hide()` also hides it. `destroy()` releases listeners, UI, engine, and audio resources. `getSnapshot()` is `null` until the full widget loads and after an Escape exit. `resume()` does not reopen a game that Escape has locked. Imports and types are available from the root entry; React adds `routeKey` and omits manual `host`/`document` management.

Host `onState` and `onEvent` callbacks run in their normal order. If one throws, `installSwarm` disables that hook for the installation and reports the failure once through `onError`, so gameplay and cleanup continue. A throwing `onError` is guarded, disabled, and falls back to `console.error`. The low-level core/widget entries retain ordinary throwing callback behavior; a failed initial widget mount cleans up before rethrowing.

`@chriscooley/swarm-protocol/core` exports `createDomDefender` for a custom HUD. `./widget` exports `mountSwarmGame` for direct UI mounting. Those low-level entries load the game immediately when imported. Use `./deferred` for delayed bootstrap loading or the root installer for immediate activation listeners with an on-demand game.

## Gameplay and input

Each bug starts with one hit point. It must reach a visible Unicode letter and visibly chew it before replacing just that letter with `0` or `1`. Six eaten letters produce tier 2; twelve produce tier 3 and a full button hunter. Punctuation, digits, spaces, and untouched letters stay unchanged. If food is unavailable, an underfed bug may hunt at its earned tier; CTA bites do not increase its strength. Squashing a bug makes neighbors within 210 CSS pixels scatter for 1.0–1.3 seconds, then return.

Kills award `(10 + speed bonus + tier bonus) × combo`. The speed bonus is 20 before age 3 seconds or 10 before age 6 seconds; each tier above the first adds 10. Kills within 1.5 seconds build up to a ×4 combo. Waves arrive every 18 active seconds, starting at 12 arrivals and adding 6 per wave, capped at 48 live plus queued bugs. Clearing early gives `50 × wave` points, repairs surviving targets by 9, and starts a 3-second intermission. A timed advance grants no clear bonus or repair.

Rendered targets start with their native hover background color as the liquid power fill. It drains vertically, turns yellow (`#CDDE00`) at 60% health, and becomes pink (`#F4457A`) at 25%. Two thin canvas bands pulse from the button, slowing from a 0.7-second to a 2.8-second cycle as health falls. Every real bite briefly latches the bug, disturbs the liquid near the contact point, nudges the button, and releases a solid 2.4–4.2px bubble in that bug's exact color. Letter-feeding digits and kill scores are unchanged.

On desktop, six bubbles of varied size (1.25–5.2px) rise and fade inside the liquid behind the label. They use the opposite light/dark tone of the original button surface. Hover smoothly accelerates their existing motion clock up to 4× speed for a boiling effect; leaving hover eases back to a simmer. It does not change fill opacity, color, health, or beacon phase. The paint rate remains capped at 12Hz.

On viewports up to 640px or with a coarse pointer, the fill uses a native CSS linear gradient and three quiet radial-gradient bubbles. It contains no game SVG image to repeatedly decode and remains unchanged between health updates. This mobile path skips interior boiling, liquid ripples, and bite shaking, and uses one softer beacon with a 50% longer cycle and smaller spread. The bug still visibly latches and emits solid particles in its own color. Sticky touch hover does not speed up the fill or cause extra background paints. Native tap highlights are temporarily transparent on powered targets and restored on depletion or cleanup. Resizing/changing pointer capability switches paths without resetting health.

While powered, native CSS hover rules are scoped away from the target and its descendants/pseudo-elements. This prevents hover color, border, font, icon, shadow, filter, and motion changes without canceling pointer/click events. The guard scans accessible stylesheets once per round and temporarily edits their selectorText with zero-specificity exclusions. Selector lists preserve independent focus rules; nested/group selectors, negative hover, important rules, and adopted/same-origin imported sheets are handled. Cleanup restores owned selectors only if the host has not changed them. Stylesheets added later or unreadable cross-origin sheets cannot be guarded; use same-origin site CSS for complete suppression. JavaScript hover handlers remain the host's responsibility.

The game owns background properties (plus the mobile tap highlight) and disables target transitions until depletion or cleanup. Existing label styles and resting shadows remain; no game shadow is added. At zero health the fill/beacon disappear, native hover returns, and a slight depleted tilt remains (yielding to native interaction). Stop/Escape restores owned inline styles and attributes while preserving newer host edits. Native click, keyboard activation, and separate focus-visible indicators remain available.

The palette is sampled once when the round first paints a target, using accessible stylesheets and the active system theme. Solid hover colors, CSS variables, media queries, nesting, selector specificity, and named cascade layers are supported. The temporary color probe is removed immediately; hover rule exclusions last only for the round. It does not continuously re-read styles on hover or animate a second loop. For cross-origin stylesheets that cannot be read, pseudo-element/JavaScript hover surfaces, or gradient-only hover designs, the current background is the fallback (then border/text color if transparent). Set `--swarm-power-color` on the target to use its exact existing hover token without discovery:

```css
/* Use your site's existing hover-color token here. */
[data-swarm-target] {
  --swarm-power-color: var(--button-hover-background);
}
```

The rings and external bite bubbles share the existing canvas/frame loop and particle cap. Interior bubbles use the button background, so no elements cover or wrap the label. No button box shadows, blur, dependencies, extra animation loops, or timers are added. Desktop powered backgrounds repaint at most 12 times per second for interior bubbles and bite ripples; mobile backgrounds repaint only for health/mode changes, under the same cap; there are additional paints at state/interaction boundaries. Offscreen targets do not animate their backgrounds. Reduced motion uses a steady border and static fill, without bubbles, shaking, ripples, body pulses, or tilt. All rendered targets must reach zero to end the round; offscreen pursuit continues. The page automatically restores after a loss while retaining results.

Mouse play has a 32-pixel target cursor. Native cursors and input remain over protected controls and return when play pauses or ends. Touch uses brief tap rings with no persistent cursor. Coarse pointers or widths up to 640 pixels use a 62-pixel hit diameter and 72% movement speed; desktop hit diameter is 46 pixels. Reduced motion shortens decorative feedback. Pause and tab hiding freeze gameplay clocks.

Sound uses short, quiet Web Audio tones, with no audio asset or music download. It initializes only after a real user gesture. Mute preference and best score are stored locally, with a safe fallback when storage is unavailable. No scores, keys, or page text are transmitted.

Offscreen button attacks display directional edge cues with a softly pulsing bug icon and “Other sections under attack — Scroll to squash.” These use the engine's existing target rectangles and attached-attacker state; offscreen travel alone does not show a warning. Multiple affected edges can show simultaneously. Partially visible targets do not warn. The separate Shadow DOM overlay is pointer-transparent, keeps working when the scoreboard is minimized, and clears on pause, game over, stop, or destroy. Both `reducedMotion` and the browser's reduced-motion preference suppress its pulse. No public API changes or additional integration options are required.

Kill scores keep the exact color of the squashed bug in both system themes. A dark inner outline and theme-aware outer outline keep them distinct over page content, with 0.7 seconds fully opaque followed by a 0.4-second fade. Burst fragments and hit rings still adapt to the system light/dark setting. Reduced motion keeps scores stationary and removes fragments. No theme switch or extra configuration is needed.

## Shadow DOM, page ownership, and CSP

The launcher, score panel, and bugs' canvas each live in an owned **open shadow root**. Their internal CSS selectors and DOM queries stay scoped, with explicit style resets on the hosts. The package uses module-scoped JavaScript and does not install global variables. Keep the fixed UI outside transformed or clipped application wrappers.

Shadow DOM is CSS and DOM encapsulation, **not a JavaScript sandbox or a guarantee against every host-page interaction**. Same-page code can access an open shadow root or remove its host, inherited properties and host styles still need deliberate resets, and document input/lifecycle events are shared. See [MDN's Shadow DOM guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM).

The game intentionally changes the opted-in page text, CTA styles, pointer cursor, and temporary footer cue outside those roots. These are scoped, recorded changes, restored when play or the secret gesture ends while preserving newer application writes. If the application changes a painted inline property’s value or priority, the engine relinquishes that property rather than overwriting it during later repaint or restoration. Page content is not cloned into a shadow tree; that would prevent the intended interaction with the real page. Do not let a framework replace an affected content region mid-round; stop first.

The widget uses static `innerHTML` for its own markup/icons, and shadow roots use inline styles. Page content and labels are handled as text. Sites enforcing inline-style or Trusted Types restrictions must adapt those static assignments to their existing policy; there is no nonce option in this release. The custom cursor uses an SVG `data:` URL with a native crosshair fallback if that image is blocked. Check these behaviors under the actual deployed CSP; do not weaken site policy to accommodate the widget.

The game operates in its current document and cannot select content inside another iframe or a closed shadow root. Dynamic participating content should be followed by a stop/restart. The game is a pointer/touch activity; the UI controls and Contra unlock sequence provide keyboard access to opening and leaving it.

## Build, test, and ship

Use Node 20 or newer and the lockfile:

```sh
npm ci
npm run check
npm run size
npm pack
```

The build emits minified ESM with code splitting and external React, plus TypeScript declarations. GitHub CI runs type checking, the build, and tests, then builds the drop-in ZIP. A matching stable version tag publishes that ZIP and its checksum as a GitHub Release. No pipeline step deploys a site or publishes to an npm registry. The source repository includes no logo, branded demo, credentials, or downloaded site assets. A historical engine fixture exists only in the source tests for before/after performance equivalence and is excluded from the runtime tarball.

Tests cover delayed load/idle/visibility scheduling and cancellation, dormant installation, keyboard/footer unlock behavior, full Escape exit, scoreboard minimization, cleanup, SSR imports/rendering, strict consumer declarations, the lazy chunk boundary, and preserved engine behavior. [PERFORMANCE.md](../PERFORMANCE.md) records the deterministic optimization checks and their limits. Finish with real-page checks for CTA handling, restoration across routes, actual CSP, and iOS/Android input/audio; synthetic tests do not replace that integration pass.

## Attribution

You may use, modify, and redistribute the original code under MIT, including commercial use, while preserving the license notice. Please retain the ISC notice for the embedded Lucide geometry too.

If you enjoy it, a visible credit such as “Swarm Protocol by Chris Cooley” is appreciated. **Visible credit is an optional request, not an additional license condition.**
