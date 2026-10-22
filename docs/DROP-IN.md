# Swarm Protocol 1.0.8 — self-hosted drop-in

The game is already built. Copy its files into your Astro site, add one component, and test locally. This method requires no package installation, package registry, or Git push. You can keep this same integration permanently and serve the game with your site's own static assets.

There are two ways to use this kit:

- **Permanent integration:** copy the `public/` files and use the supplied Astro component. This preserves delayed loading and is the recommended way to test the complete integration.
- **Temporary browser test:** run the separate script in `browser-test/` against a page already open in your browser. Only your browser session sees the game.

Kill scores, burst fragments, and hit rings follow the system light/dark preference automatically. Light-mode scores use brand pink (`#F4457A`) while bursts and rings retain their deeper colors; scores have a contrasting outline and stay fully opaque for 0.7 seconds before a 0.4-second fade. A system theme change updates active effects on the next game frame. Reduced motion keeps score text stationary and removes burst fragments. No theme switch or extra configuration is needed.

## 1. Copy the files into your Astro project

Copy this kit's entire `public/swarm-protocol/` folder into your existing Astro project's `public/` directory. Merge it with the existing content; keep the version folder and all nested files together so their relative imports resolve.

Copy `components/SwarmDropIn.astro` into your site's `src/components/` folder.

You should have these paths in your site:

```text
public/swarm-protocol/1.0.8/install.js
public/swarm-protocol/1.0.8/deferred.js
public/swarm-protocol/1.0.8/chunks/...
src/components/SwarmDropIn.astro
```

## 2. Include the component once

Add this import inside the existing frontmatter of your shared layout. Adjust the relative path for your layout's location:

```astro
import SwarmDropIn from '../components/SwarmDropIn.astro';
```

Then place this once near the end of the existing `<body>`:

```astro
<SwarmDropIn />
```

The component uses Astro's `BASE_URL`, including a configured path such as `/work/`. It needs no React integration or `client:*` directive.

If your site is served from the domain root, you can instead put this one tag in the Astro layout:

```astro
<script is:inline type="module" src="/swarm-protocol/1.0.8/install.js"></script>
```

For ordinary HTML, omit `is:inline`. For an Astro site with a configured base path, use the supplied component. Include either the component or the tag, once. Remove any earlier Swarm installer from that layout before adding this one.

## 3. Choose the page elements

Add attributes to your existing elements while keeping their content, links, and event handlers:

```astro
<h1 data-swarm-text>Your existing heading</h1>
<p data-swarm-text>Some existing static presentation text.</p>

<a href="/contact/" data-swarm-target data-swarm-label="Contact">
  Contact us
</a>

<footer>
  <span data-swarm-trigger>© 2026</span> Your company
</footer>
```

Keep your CTA's current URL or click handler. Choose buttons or links outside forms and dialogs, rather than form submit buttons. Choose a few static text regions instead of the entire application root.

| Attribute | Purpose |
| --- | --- |
| `data-swarm-target` | A CTA that bugs can hunt and damage. |
| `data-swarm-label` | An optional short target name for the scoreboard. |
| `data-swarm-text` | Static text whose letters bugs can eat. |
| `data-swarm-trigger` | Copyright/date text for the mobile secret. |
| `data-swarm-surface` | An optional presentation surface that bugs may damage. |
| `data-swarm-ui` | Protect a real form's outer panel or other controls. |
| `data-swarm-ignore` | Exclude a region entirely. |

You can also edit the selector constants at the top of `public/swarm-protocol/1.0.8/install.js` to match exact existing CSS selectors. The footer trigger, attack targets, text, and surfaces are independently configurable. Change `storageKey` there if you want a separate best-score history.

## 4. Test locally and test the production build

From the Astro project, use its existing scripts. Standard Astro scripts are:

```bash
npm run dev
```

Open the local URL printed by Astro. No commit or push is needed. For the production output, stop the dev server and run:

```bash
npm run build
npm run preview
```

Open the preview URL and check a normal page load, activation, an active round, the eye control, Escape, and navigation to another page. Test the existing CTA/form interaction as well: a bug hit is handled by the game, and a missed hit that lands on the actual CTA can still trigger its original action.

For a phone on the same Wi-Fi:

```bash
npm run dev -- --host
```

Open the Network URL printed by Astro on the phone. Test the marked footer gesture, tapping bugs, scrolling, and switching away from the browser.

## 5. Activate, minimize, and exit

**Desktop:** focus the page, then enter this sequence in order:

```text
Up Up Down Down Left Right Left Right B A Enter
```

No Caps Lock or modifier key is needed. Do not type it into an input. Enter successive keys within about two seconds. The target button appears; click it to open the instructions, then click Start.

**Mobile:** hold the marked copyright/date text for 900 ms, release, then tap the same text during its five-second color cue.

The eye hides the scoreboard while play continues. The target button opens it again, and game-over results reopen automatically. Escape ends the game, restores the page, and fully hides/relocks it. Enter the secret again to return.

Offscreen button attacks show a pulsing line at the corresponding screen edge, a directional arrow, and **“Other sections under attack — Scroll to squash.”** The cue appears only for attached attackers, clears when the button returns to view or the attack stops, and stays visible while the scoreboard is minimized. Pausing or ending the round clears the cues. Reduced-motion settings use a steady line. Cues do not capture clicks, taps, or scrolling.

## 6. Loading and isolation

The small `install.js` and deferred scheduler load with the page. The hidden activation code waits for page load, a 1,000 ms delay, then an idle opportunity; the idle request has a 2,000 ms timeout. The engine and game UI load only when opened. Hidden tabs wait until visible. Astro navigation cancels pending setup or destroys the active installation before the page changes.

The launcher, scoreboard, and bug canvas use Shadow DOM. Runtime code is module-scoped, and the production installer adds no global variables. The game intentionally changes participating page text, targets, surfaces, and its cursor/trigger presentation; it records these changes for restoration. Shadow DOM encapsulates the UI; it is not a JavaScript security sandbox.

The initial installer and scheduler total about **1.7 kB gzip** across their files. The rest remains behind the delayed activation and game-open boundaries. These are file-size measurements, not a promise of zero page-load cost; use your actual site's production preview to measure its behavior.

## 7. Try it on an already-open website without installing it

Use `browser-test/swarm-browser-test.js` for a temporary desktop test in Chrome or Edge:

1. Open the work page you want to try, then open Developer Tools.
2. In **Sources → Snippets**, create a new snippet and paste the entire contents of `swarm-browser-test.js`.
3. Edit the settings at the top of that snippet. Set `targetSelector` to the exact existing CTA selector and `textSelector` to a few static text regions. Set `triggerSelector` to the copyright/date text if you want to test that gesture. Surfaces are optional. The defaults use the same `data-swarm-*` attributes shown above; alternatively, add those attributes temporarily in the Elements panel.
4. Run the whole snippet with **Ctrl+Enter** on Windows/Linux or **Cmd+Enter** on macOS.
5. Leave `autoOpen: true` to show instructions after the delay, then click Start. Set it to `false` to test the normal secret activation instead.

The test file contains the complete game, so it fetches no external game files. It installs after page load, a one-second delay, and an idle opportunity. Because the full code is already present and parsed, this is a gameplay/integration test, not a production load-speed benchmark. Use the Astro build/preview route above to assess delayed loading.

Click Start in the game for normal gesture-triggered audio. Escape ends the round and hides/relocks the game. Refresh or navigate away to remove the temporary installation. You can also remove it immediately from the DevTools Console:

```js
globalThis[Symbol.for('chriscooley.swarm-protocol.browser-test')]?.destroy()
```

The wrapper uses separate temporary score/sound keys and removes those keys on destruction or page exit. The normal permanent installation retains its local best score and sound preference. Run this test only when the page has no other active Swarm installation. The game does not send clicks on your behalf; the page's actual links and handlers remain live.

If your page reports a Content Security Policy or Trusted Types error, test the integration in your local Astro copy and review the specific conflict. Keep the site's existing security protections in place.

## 8. Keep it permanently when you are happy

Include the copied files and component in your site's normal release. The site serves the assets itself; there is no separate game server, GitHub download, or package-registry request at runtime.

For a later release, copy its complete versioned folder, update the version in `SwarmDropIn.astro`, and deploy them together. Keep the MIT license and third-party notices with distributed files. Visible credit is appreciated and optional.

To remove the integration, remove the component/tag and copied files, then reload. The participating data attributes are inert without the game and may also be removed.

Your personal GitHub repository can hold the source and release downloads later. A versioned npm package can be added as another installation option in a future release; neither is required for this drop-in.

## Troubleshooting

- **No game after typing the code:** let the page finish loading and wait a few seconds, click ordinary page content, then enter the sequence again. Inputs, links, buttons, and forms do not accept the secret sequence.
- **A JavaScript file returns 404 or an HTML/MIME error:** copy the complete version folder, including `chunks/`. Use the supplied component when your Astro site has a configured base path. Test through Astro's HTTP server, rather than opening a file directly.
- **The bugs do not attack the intended CTA:** check `targetSelector` in `install.js`, or add `data-swarm-target` to the actual visible button/link.
- **The footer secret does not activate:** use a plain text element marked `data-swarm-trigger`, outside a link, form, or editable field. Hold, release, then tap separately.
- **Two launchers or overlapping rounds:** use only one installer. Do not combine this drop-in with an npm/React installer or the temporary browser-test snippet on the same page.

## Verification included

`verification/verification.txt` describes the checks performed for this release. `verification/runtime-manifest.json` records the hashes and sizes of the production runtime files, which are copied unchanged from version 1.0.8.

## Astro references

- [Public assets](https://docs.astro.build/en/basics/project-structure/#public)
- [External/public scripts](https://docs.astro.build/en/guides/client-side-scripts/#load-external-scripts)
- [Base path](https://docs.astro.build/en/reference/configuration-reference/#base)
- [ClientRouter lifecycle events](https://docs.astro.build/en/guides/view-transitions/#lifecycle-events)
- [Local dev, build, preview, and phone testing](https://docs.astro.build/en/reference/cli-reference/)
- [Chrome DevTools Snippets](https://developer.chrome.com/docs/devtools/javascript/snippets)
