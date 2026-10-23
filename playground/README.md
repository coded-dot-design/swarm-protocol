# Local game playground

A standalone fictional webpage for testing DOM games away from a production or company site. Swarm imports the repository's real source directly. No copied implementation, account, API keys, or package reinstall is needed between source edits. There are no remote fonts, images, or services.

## Run

Use Node **22.12 or newer** on the Node 22 line, or a newer supported Node release such as Node 24.

```bash
git clone https://github.com/coded-dot-design/swarm-protocol.git
cd swarm-protocol
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Select **Start game**. Vite reloads the page when game JavaScript changes; a reload starts with a restored page and a fresh game installation. The original keyboard sequence and mobile footer activation also work. The playground uses a separate local best-score key.

To pick up repository updates, stop the server and run:

```bash
git pull
npm ci
npm run dev
```

For a phone on the same trusted local network, run `npm run dev -- --host 0.0.0.0` and open the printed network URL on the phone. The default server only listens on your own computer.

## Useful checks

- **Full page:** seven bases, static text, native links and buttons, and a nested scrolling room. Watch the power drain and hover boil; clicking a demo button still reports its original action.
- **Distant base:** only the Contact button at the bottom is food. Bugs still spawn near you, then travel there. Squash bugs to earn points, wait for an offscreen attack, and test the locked / Jump / Jump + Zap alert states. No artificial points or gameplay overrides are added.
- **Letters only:** no button targets. Check letter consumption, viewport attraction, and restoration.
- **Pause / Resume:** check that the game freezes and continues. **Reset** destroys the installation, restores the page, and mounts a fresh hidden installation. Switching scenario or motion also resets the round.
- **Escape:** exit completely, verify restoration, then start again. The footer's hold / release / tap secret is available on touch devices.
- **Light / dark:** the page and game follow system preference. Use your OS setting or browser DevTools Rendering panel to emulate `prefers-color-scheme`; there is no competing theme toggle.
- **Mobile / motion:** use an actual phone or DevTools touch emulation. Test controls can force reduced game motion, or follow the system. Changing system motion resets the current round.
- **Host interactions:** try anchor navigation, nested scrolling, and the form while playing. Form fields are protected; submission stays on the page and sends nothing.

The toolbar receives game snapshots and writes only changed text. It adds no animation loop. Recent events are capped at six. `window.playground.getSnapshot()` is available in the console for local inspection.

## Build and preview

```bash
npm run playground:build
npm run playground:preview
```

Open **http://127.0.0.1:4173** to test the built page. Output goes to `artifacts/playground/`. `npm run check` continues to check the game package; CI also builds the playground.

Vite is a development dependency. The playground, its CSS, and Vite are excluded from the published game package and the drop-in ZIP. A development `node_modules` directory is not the game's runtime or download size. This is a source integration test bed; use the release package on a real consumer site when checking package exports or Astro integration.

## Add a future game

Add a lazy entry to `games/index.js` and implement `games/your-game.js`:

```js
export function mount({ document, board, onState, onEvent, onError }) {
  // Attach your game to `board` (#game-board), or use the marked page fixtures.
  // Return an instance owned by this mount call.
  return { start, pause, resume, destroy, getSnapshot };
}
```

`mount` is synchronous; `start` may return a promise. `getSnapshot()` returns `null` before play, then an object with `status`, `alive`, and `score`. Supported statuses are `idle`, `running`, `intermission`, `paused`, and `gameover`. Emit snapshots through `onState` when those values change. The Swarm adapter also accepts `scenario` and `reducedMotion`; adapt or ignore them for a different game, and adjust the controls when needed.

`destroy()` must stop timers/animation, remove listeners and owned DOM, and restore host changes. Never leave the previous game running after a switch. Keep future-game code inside its adapter/module so it is loaded only when selected. The registry and controller shell are development fixtures, not part of the public game API.
