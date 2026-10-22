/**
 * Swarm Protocol — MIT © 2026 Chris Cooley.
 * A small, dormant entry point. The game imports only after open() or start().
 */
const SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
const KEY_GUARD = 'input,textarea,select,button,a[href],form,dialog,[role="dialog"],[role="textbox"],[role="combobox"],[role="slider"],[role="button"],[role="menu"],[role="listbox"],[role="grid"],[role="tree"],[contenteditable],[data-swarm-ui],[data-swarm-ignore]';
const TRIGGER_GUARD = 'input,textarea,select,a[href],form,dialog,[role="dialog"],[role="textbox"],[role="combobox"],[contenteditable],[data-swarm-ignore]';
const HOLD_MS = 900, ARMED_MS = 5000, MOVE_LIMIT_SQUARED = 144;
const PILL_STYLE = ':host{all:initial!important;position:fixed!important;right:max(22px,env(safe-area-inset-right))!important;bottom:max(22px,env(safe-area-inset-bottom))!important;z-index:2147483100!important;display:block!important;pointer-events:none!important;direction:ltr!important;writing-mode:horizontal-tb!important;color-scheme:dark!important}:host([hidden]){display:none!important}button{box-sizing:border-box;display:flex;align-items:center;width:46px;height:46px;padding:0 12px;border:1px solid #424957;border-radius:24px;background:#15181e;color:#ecf5fa;font:12px/1.4 system-ui,sans-serif;box-shadow:0 5px 24px #0004;cursor:pointer;touch-action:manipulation;pointer-events:auto;overflow:hidden;transition:width .18s ease-out,background .18s ease-out}button:focus-visible{width:168px;outline:2px solid #06c4ff;outline-offset:3px}svg{width:20px;height:20px;color:#06c4ff;flex:0 0 20px}.label{max-width:0;margin-left:0;opacity:0;overflow:hidden;white-space:nowrap;transition:max-width .18s ease-out,margin-left .18s ease-out,opacity .18s ease-out}button:focus-visible .label{max-width:120px;margin-left:10px;opacity:1}button.enter{animation:swarm-enter .18s ease-out both}@keyframes swarm-enter{from{transform:translateY(8px) scale(.94);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}@media(hover:hover) and (pointer:fine){button:hover{width:168px;background:#202630}button:hover .label{max-width:120px;margin-left:10px;opacity:1}}@media(max-width:640px){:host{right:max(12px,env(safe-area-inset-right))!important;bottom:max(12px,env(safe-area-inset-bottom))!important}}@media(prefers-reduced-motion:reduce){button,.label{animation:none!important;transition:none!important}}';
const PILL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>';

/**
 * Install one hidden game on this document. Keyboard state is an integer
 * sequence position and timestamps; typed text is never retained or transmitted.
 * @param {import('./swarm-loader.js').SwarmInstallOptions} [options]
 */
export function installSwarm(options = {}) {
  const doc = options.document || options.host?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc?.defaultView) throw new Error('installSwarm() must be called in a browser.');
  const win = doc.defaultView;
  const keyboard = options.keyboard ?? 'sequence';
  const triggerSelector = options.triggerSelector ?? '[data-swarm-trigger]';
  const storageKey = options.storageKey || 'swarm-protocol-best-v1';
  let destroyed = false, unlocked = false, visible = false, widgetShown = false;
  let widget = null, widgetHost = null, ownsWidgetHost = false, loading = null;
  let pillHost = null, pillButton = null, lastSnapshot = null;
  let progress = 0, lastKeyAt = 0, epoch = 0;
  let pressing = null, armed = null, ignoredClick = null, confirmingClick = null;
  let exiting = false;
  let desiredAction = null;
  const disposers = [];
  const failedHooks = new Set();
  function reportError(error) {
    const errors = [error];
    if (!failedHooks.has('onError')) {
      try { if (options.onError) { options.onError(error); return; } }
      catch (failure) { failedHooks.add('onError'); errors.push(failure); }
    }
    try { (win.console || globalThis.console)?.error?.('[Swarm Protocol]', ...errors); } catch (_) {}
  }
  function notifyHost(name, value) {
    if (failedHooks.has(name)) return;
    try { options[name]?.(value); }
    catch (error) {
      // Disable a faulty hook before reporting it, including for reentrant
      // host actions. A host exception must not break the game's frame loop.
      failedHooks.add(name);
      reportError(error);
    }
  }
  const pathOf = event => event.composedPath?.() || [event.target];
  const guarded = (path, selector) => path.some(node => node?.closest?.(selector));
  const now = () => win.performance.now();
  function on(target, type, handler, settings) {
    target.addEventListener(type, handler, settings);
    disposers.push(() => target.removeEventListener(type, handler, settings));
  }
  function resetSequence() { progress = 0; lastKeyAt = 0; }
  // These temporary styles belong only to the explicitly marked footer text.
  // Restore each value only if the application has not written a newer value.
  function suppressSelection(target) {
    const hadStyle = target.hasAttribute('style');
    const saved = ['user-select', '-webkit-user-select', '-webkit-touch-callout'].map(property => ({
      property, value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property),
    }));
    for (const { property } of saved) target.style.setProperty(property, 'none', 'important');
    return () => {
      for (const { property, value, priority } of saved) {
        if (target.style.getPropertyValue(property) !== 'none' || target.style.getPropertyPriority(property) !== 'important') continue;
        if (value) target.style.setProperty(property, value, priority);
        else target.style.removeProperty(property);
      }
      if (!hadStyle && !target.getAttribute('style')?.trim()) target.removeAttribute('style');
    };
  }
  function releasePress() {
    if (!pressing) return;
    win.clearTimeout(pressing.timer);
    pressing.restore();
    pressing = null;
  }
  function clearArmed() {
    if (!armed) return;
    win.clearTimeout(armed.timer);
    armed.animation?.cancel();
    armed = null;
  }
  function resetTrigger() {
    releasePress();
    clearArmed();
    ignoredClick = null;
    confirmingClick = null;
  }
  function triggerTarget(event) {
    const path = pathOf(event);
    if (guarded(path, TRIGGER_GUARD)) return null;
    return path.map(node => node?.closest?.(triggerSelector)).find(Boolean) || null;
  }
  function armTrigger(press) {
    if (pressing !== press || !press.target.isConnected || doc.hidden) { resetTrigger(); return; }
    press.timer = 0;
    const style = win.getComputedStyle(press.target);
    const animation = press.target.animate([
      { color: '#06c4ff', textShadow: '0 0 8px #06c4ff66', offset: 0 },
      { color: '#06c4ff', textShadow: '0 0 8px #06c4ff33', offset: .15 },
      { color: style.color, textShadow: style.textShadow, offset: 1 },
    ], { duration: ARMED_MS, easing: 'ease-out', fill: 'none' });
    armed = { target: press.target, until: now() + ARMED_MS, animation, timer: win.setTimeout(resetTrigger, ARMED_MS) };
  }
  function triggerDown(event) {
    if (destroyed || doc.hidden || event.defaultPrevented) return;
    if (event.isPrimary === false || pressing) { resetTrigger(); return; }
    if (event.button !== 0) { resetTrigger(); return; }
    const target = triggerTarget(event);
    if (!target?.isConnected) { resetTrigger(); return; }
    const confirming = armed?.target === target && now() < armed.until;
    if (!confirming) clearArmed();
    ignoredClick = null;
    confirmingClick = null;
    const press = {
      id: event.pointerId, target, x: event.clientX, y: event.clientY,
      confirming, timer: 0, restore: suppressSelection(target),
    };
    pressing = press;
    if (!confirming) press.timer = win.setTimeout(() => armTrigger(press), HOLD_MS);
  }
  function triggerMove(event) {
    if (!pressing || event.pointerId !== pressing.id) return;
    const dx = event.clientX - pressing.x, dy = event.clientY - pressing.y;
    if (dx * dx + dy * dy > MOVE_LIMIT_SQUARED) resetTrigger();
  }
  function triggerUp(event) {
    if (!pressing || event.pointerId !== pressing.id) return;
    triggerMove(event);
    if (!pressing) return;
    const press = pressing;
    if (press.confirming && armed?.target === press.target && now() < armed.until && press.target.isConnected) {
      confirmingClick = press.target;
    } else {
      // The compatibility click from releasing the long hold must not open it.
      ignoredClick = press.target;
    }
    releasePress();
  }
  function triggerClick(event) {
    if (destroyed || doc.hidden || event.defaultPrevented) return;
    const target = triggerTarget(event);
    if (!target || armed?.target !== target || now() >= armed.until) { resetTrigger(); return; }
    if (pressing) return;
    if (ignoredClick === target) { ignoredClick = null; return; }
    if (confirmingClick !== target && event.detail !== 0) return;
    resetTrigger();
    if (event.cancelable) event.preventDefault();
    void open().catch(() => {});
  }
  function suppressNativeHold(event) {
    const target = triggerTarget(event);
    if (target && (pressing?.target === target || armed?.target === target) && event.cancelable) event.preventDefault();
  }
  function hidePill() {
    if (pillHost) pillHost.hidden = true;
  }
  function ensurePill() {
    if (pillHost) return;
    pillHost = doc.createElement('div');
    pillHost.setAttribute('data-swarm-ui', '');
    pillHost.setAttribute('data-swarm-launcher', '');
    pillHost.hidden = true;
    const root = pillHost.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = PILL_STYLE + (options.reducedMotion ? 'button,.label{animation:none!important;transition:none!important}' : '');
    pillButton = doc.createElement('button');
    pillButton.type = 'button';
    pillButton.setAttribute('aria-label', 'Open Swarm Protocol game');
    pillButton.innerHTML = PILL_ICON + '<span class="label" aria-hidden="true">Swarm Protocol</span>';
    root.append(style, pillButton);
    doc.body.appendChild(pillHost);
    on(pillButton, 'click', () => { void open().catch(() => {}); });
  }
  function reveal() {
    if (destroyed || exiting) return;
    unlocked = true;
    visible = true;
    if (widgetShown) return;
    ensurePill();
    if (!pillHost.hidden) return;
    pillButton.classList.toggle('enter', !options.reducedMotion);
    pillHost.hidden = false;
  }
  function unlock() { resetTrigger(); reveal(); }
  function closedByPlayer() {
    widgetShown = false;
    if (visible && !destroyed) reveal();
  }
  function loadWidget() {
    if (widget) return Promise.resolve(widget);
    if (loading) return loading;
    const requestedEpoch = epoch;
    loading = import('./swarm-widget.js').then(({ mountSwarmGame }) => {
      // A hide, route change, or unmount during download must not create UI.
      if (destroyed || requestedEpoch !== epoch || !desiredAction) return null;
      widgetHost = options.host || doc.createElement('div');
      ownsWidgetHost = !options.host;
      if (ownsWidgetHost) doc.body.appendChild(widgetHost);
      if (!widgetHost.isConnected) throw new Error('Swarm Protocol needs a connected host.');
      const mounted = mountSwarmGame(widgetHost, {
        document: doc,
        targetSelector: options.targetSelector,
        textSelector: options.textSelector,
        surfaceSelector: options.surfaceSelector,
        bestKey: storageKey,
        reducedMotion: options.reducedMotion,
        initiallyClosed: false,
        showLauncher: false,
        onState(snapshot) { lastSnapshot = snapshot; notifyHost('onState', snapshot); },
        onEvent(event) { notifyHost('onEvent', event); },
        onClose: closedByPlayer,
      });
      // Initial state callbacks may synchronously navigate, hide, or unmount.
      if (destroyed || requestedEpoch !== epoch || !desiredAction || !visible) {
        mounted.destroy();
        if (ownsWidgetHost) widgetHost?.remove();
        widgetHost = null;
        return null;
      }
      widget = mounted;
      return widget;
    }).catch(error => {
      if (!destroyed && requestedEpoch === epoch) {
        widgetShown = false;
        desiredAction = null;
        if (ownsWidgetHost) widgetHost?.remove();
        widgetHost = null;
        reveal();
        reportError(error);
      }
      throw error;
    }).finally(() => { loading = null; });
    return loading;
  }
  async function show(action) {
    if (destroyed || exiting) return;
    unlocked = true;
    visible = true;
    desiredAction = action;
    const requestedEpoch = epoch;
    let controller = await loadWidget();
    if (!controller && !destroyed && requestedEpoch === epoch && visible && desiredAction) controller = await loadWidget();
    if (!controller || destroyed || requestedEpoch !== epoch || !visible) return;
    // Concurrent open/start calls use their latest intent, not duplicate starts.
    const intent = desiredAction;
    desiredAction = null;
    if (!intent) return;
    widgetShown = true;
    hidePill();
    if (intent === 'start') controller.start();
    else controller.open();
  }
  function open() { return show('open'); }
  function start() { return show('start'); }
  function minimize() {
    cancelPending();
    if (destroyed || exiting || !widget || !unlocked || !visible) return;
    widget.minimize();
  }
  function pause() { cancelPending(); widget?.pause(); }
  function resume() {
    if (!widget || destroyed || !unlocked || !visible) return;
    visible = true;
    // A paused, minimized round should stay folded after a host form closes.
    if (!widgetShown) {
      widgetShown = true;
      hidePill();
      widget.open();
    }
    widget.resume();
  }
  function cancelPending() { epoch++; desiredAction = null; }
  function stop() {
    cancelPending();
    widget?.stop();
    widgetShown = false;
    if (visible && unlocked && !destroyed) reveal();
  }
  function hide() {
    resetTrigger();
    visible = false;
    cancelPending();
    widget?.stop();
    widgetShown = false;
    hidePill();
  }
  function exitGame() {
    if (destroyed || exiting) return;
    exiting = true;
    visible = false;
    unlocked = false;
    cancelPending();
    resetSequence();
    resetTrigger();
    hidePill();
    const previous = widget;
    widget = null;
    widgetShown = false;
    previous?.destroy();
    if (ownsWidgetHost) widgetHost?.remove();
    widgetHost = null;
    ownsWidgetHost = false;
    lastSnapshot = null;
    exiting = false;
  }
  function escapeKey(event) {
    if (event.key === 'Escape' && !event.repeat && !event.isComposing) exitGame();
    // Leave the event available to the page's own dialog/menu Escape handler.
  }
  function keyDown(event) {
    if (destroyed || event.repeat || event.isComposing || doc.hidden || event.defaultPrevented) {
      resetSequence();
      return;
    }
    const path = pathOf(event);
    if (guarded(path, KEY_GUARD)) { resetSequence(); return; }
    if (keyboard === false) return;
    if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      resetSequence();
      return;
    }
    const time = now();
    if (time - lastKeyAt > 2200) progress = 0;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === SEQUENCE[progress]) {
      progress++;
      lastKeyAt = time;
      // Do not take the first arrow from ordinary page navigation.
      if (progress >= 2 && event.cancelable) event.preventDefault();
      if (progress === SEQUENCE.length) {
        resetSequence();
        unlock();
      }
    } else {
      progress = key === SEQUENCE[0] ? 1 : 0;
      lastKeyAt = progress ? time : 0;
    }
  }
  function interrupted() { resetSequence(); resetTrigger(); }
  function beforeSwap() { hide(); interrupted(); }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelPending();
    for (const off of disposers) off();
    widget?.destroy();
    widget = null;
    lastSnapshot = null;
    if (ownsWidgetHost) widgetHost?.remove();
    pillHost?.remove();
    pillHost = null; pillButton = null; widgetHost = null;
    interrupted();
  }
  on(doc, 'keydown', escapeKey, true);
  if (keyboard !== false) on(doc, 'keydown', keyDown);
  if (triggerSelector) {
    on(doc, 'pointerdown', triggerDown, { passive: true });
    on(doc, 'pointermove', triggerMove, { passive: true });
    on(doc, 'pointerup', triggerUp, { passive: true });
    on(doc, 'pointercancel', resetTrigger, { passive: true });
    on(doc, 'scroll', resetTrigger, { capture: true, passive: true });
    on(doc, 'click', triggerClick);
    on(doc, 'contextmenu', suppressNativeHold);
    on(doc, 'selectstart', suppressNativeHold);
  }
  on(win, 'blur', interrupted);
  on(doc, 'visibilitychange', () => { if (doc.hidden) interrupted(); });
  on(doc, 'astro:before-swap', beforeSwap);
  return { unlock, open, start, minimize, pause, resume, stop, hide, destroy, getSnapshot: () => widget?.getSnapshot() || lastSnapshot, isUnlocked: () => unlocked };
}
