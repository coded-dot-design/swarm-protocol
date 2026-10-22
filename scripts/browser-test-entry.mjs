// Test-only wrapper. The production package is imported unchanged.
import { installSwarmDeferred } from '../dist/deferred.js';

export function runBrowserTest(settings) {
  const key = Symbol.for('chriscooley.swarm-protocol.browser-test');
  const previous = globalThis[key];
  if (previous) {
    if (previous.owner !== 'Swarm Protocol browser test' || typeof previous.destroy !== 'function') {
      throw new Error('The browser-test namespace is occupied. Reload the page before testing.');
    }
    previous.destroy();
  }
  if (document.querySelector('[data-swarm-launcher],[data-swarm-overlay]')) {
    throw new Error('A game is already visible on this page. Remove the other installation before testing.');
  }
  for (const name of ['targetSelector', 'textSelector', 'surfaceSelector', 'triggerSelector']) {
    const selector = settings[name];
    if (name === 'triggerSelector' && selector === false) continue;
    if (typeof selector !== 'string' || !selector.trim()) {
      throw new Error(`${name} must be a CSS selector. Use a selector that matches nothing to opt out.`);
    }
    document.querySelectorAll(selector); // Fail clearly before installing for invalid CSS.
  }
  const targets = document.querySelectorAll(settings.targetSelector);
  if (!targets.length) {
    throw new Error('No attack target matched. Set targetSelector at the top of this snippet to the CSS selector of your lead button, or add data-swarm-target to that element in DevTools.');
  }
  const textRegions = document.querySelectorAll(settings.textSelector).length;
  if (!textRegions) {
    console.warn('[Swarm Protocol test] No text matched. Set textSelector to a few static headings/paragraphs to test letter eating.');
  }

  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storageKey = `swarm-protocol-browser-test:${token}`;
  let pending = null;
  let installation = null;
  let disposed = false;

  function destroy() {
    if (disposed) return;
    disposed = true;
    pending?.destroy();
    installation = null;
    document.removeEventListener('astro:before-swap', destroy);
    window.removeEventListener('pagehide', destroy);
    for (const name of [storageKey, `${storageKey}:sound`]) {
      try { window.localStorage.removeItem(name); } catch {}
    }
    if (globalThis[key] === handle) delete globalThis[key];
  }

  const handle = Object.freeze({
    owner: 'Swarm Protocol browser test',
    version: __SWARM_VERSION__,
    destroy,
    getSnapshot: () => installation?.getSnapshot() ?? null,
  });
  globalThis[key] = handle;
  document.addEventListener('astro:before-swap', destroy, { once: true });
  window.addEventListener('pagehide', destroy, { once: true });

  pending = installSwarmDeferred({
    targetSelector: settings.targetSelector,
    textSelector: settings.textSelector,
    surfaceSelector: settings.surfaceSelector,
    triggerSelector: settings.triggerSelector,
    storageKey,
    onError(error) {
      console.error('[Swarm Protocol test]', error);
      destroy();
    },
  }, { delayMs: 1000, idleTimeoutMs: 2000 });
  void pending.ready.then(async (game) => {
    if (disposed || !game) return;
    installation = game;
    console.info(`[Swarm Protocol test] Ready: ${targets.length} target(s), ${textRegions} text region(s). Escape hides/relocks; refresh removes this test.`);
    if (settings.autoOpen !== false) await game.open();
  }).catch(error => {
    console.error('[Swarm Protocol test]', error);
    destroy();
  });
  return handle;
}
