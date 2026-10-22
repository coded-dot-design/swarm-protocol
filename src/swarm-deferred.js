/**
 * Swarm Protocol — MIT © 2026 Chris Cooley.
 * Load only the hidden bootstrap after the page's load, delay, and idle gates.
 */

/**
 * Schedule one installation. Route/unmount ownership remains with the caller.
 * This module has no static dependency on the bootstrap, widget, or engine.
 * @param {import('./swarm-deferred.js').SwarmInstallOptions} [options]
 * @param {import('./swarm-deferred.js').SwarmDeferredScheduling} [scheduling]
 * @returns {import('./swarm-deferred.js').SwarmDeferredInstallation}
 */
export function installSwarmDeferred(options = {}, scheduling = {}) {
  const doc = options.document || options.host?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc?.defaultView) throw new Error('installSwarmDeferred() must be called in a browser.');
  const win = doc.defaultView;
  const delayMs = Number.isFinite(scheduling.delayMs) ? Math.max(0, Math.min(2147483647, scheduling.delayMs)) : 1000;
  const idleTimeoutMs = Number.isFinite(scheduling.idleTimeoutMs) ? Math.max(1, Math.min(2147483647, scheduling.idleTimeoutMs)) : 2000;
  const canIdle = typeof win.requestIdleCallback === 'function' && typeof win.cancelIdleCallback === 'function';
  let disposed = false, loaded = doc.readyState === 'complete', gateReady = false;
  let delayTimer = null, fallbackTimer = null, idleHandle = null;
  let bootstrap = null, importing = false, installation = null;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // The caller may only need destroy(). Keep an unused failed ready promise safe
  // while preserving its rejection for callers that await or catch it.
  void ready.catch(() => {});

  function cancelScheduled() {
    if (delayTimer !== null) win.clearTimeout(delayTimer);
    if (fallbackTimer !== null) win.clearTimeout(fallbackTimer);
    if (idleHandle !== null) win.cancelIdleCallback(idleHandle);
    delayTimer = fallbackTimer = idleHandle = null;
    gateReady = false;
  }
  function cleanup() {
    cancelScheduled();
    win.removeEventListener('load', onLoad);
    doc.removeEventListener('visibilitychange', onVisibility);
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    cleanup();
    installation?.destroy();
    installation = null;
    bootstrap = null;
    resolveReady(null);
  }
  function usable() {
    if (disposed || !loaded || doc.hidden) return false;
    if (options.host && !options.host.isConnected) { destroy(); return false; }
    return true;
  }
  function fail(error) {
    if (disposed) return;
    disposed = true;
    cleanup();
    bootstrap = null;
    rejectReady(error);
  }
  function mount() {
    if (!gateReady || !usable()) return;
    try {
      const mounted = bootstrap.installSwarm({ ...options, document: doc });
      if (disposed) { mounted.destroy(); return; }
      installation = mounted;
      cleanup();
      bootstrap = null;
      resolveReady(installation);
    } catch (error) { fail(error); }
  }
  function run() {
    idleHandle = fallbackTimer = null;
    if (!usable()) return;
    gateReady = true;
    if (bootstrap) { mount(); return; }
    if (importing) return;
    importing = true;
    void import('./swarm-loader.js').then(module => {
      importing = false;
      if (disposed) return;
      bootstrap = module;
      // Visibility may have changed during the network request. Keep the module
      // cached and wait for a fresh visible delay/idle gate before installing.
      mount();
    }, fail);
  }
  function schedule() {
    if (installation || delayTimer !== null || fallbackTimer !== null || idleHandle !== null || !usable()) return;
    delayTimer = win.setTimeout(() => {
      delayTimer = null;
      if (!usable()) return;
      if (canIdle) idleHandle = win.requestIdleCallback(run, { timeout: idleTimeoutMs });
      else fallbackTimer = win.setTimeout(run, 0);
    }, delayMs);
  }
  function onLoad() {
    loaded = true;
    win.removeEventListener('load', onLoad);
    schedule();
  }
  function onVisibility() {
    if (doc.hidden) cancelScheduled();
    else schedule();
  }
  doc.addEventListener('visibilitychange', onVisibility);
  if (loaded) schedule();
  else win.addEventListener('load', onLoad, { once: true });
  return { ready, destroy };
}
