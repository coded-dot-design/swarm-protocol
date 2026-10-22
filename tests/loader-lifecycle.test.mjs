/**
 * Swarm Protocol — MIT © 2026 Chris Cooley.
 * Portable loader lifecycle regression tests; no browser or dependencies needed.
 *
 * Run: node qa/loader-lifecycle.mjs [path/to/src/swarm-loader.js]
 * Can also live at tests/loader-lifecycle.test.mjs in the standalone package.
 * Only the dynamic import is replaced inside this test's VM evaluation. The
 * production loader receives no test hooks and is never changed by this file.
 *
 * Scope: import/callback races, activation boundaries, and cleanup. The widget
 * stub deliberately models a synchronous initial onState callback and one owned
 * listener. This is not a substitute for real-browser layout/input testing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script, createContext } from 'node:vm';
import test from 'node:test';

const sourcePath = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../src/swarm-loader.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const importPattern = /import\((['"])\.\/swarm-widget\.js\1\)/g;
assert.equal([...source.matchAll(importPattern)].length, 1, 'Expected exactly one lazy widget import to substitute.');
assert.equal((source.match(/export function installSwarm\(/g) || []).length, 1, 'Expected the public installSwarm export.');
const instrumented = source
  .replace(importPattern, '__loadWidget()')
  .replace('export function installSwarm(', 'function installSwarm(')
  + '\ninstallSwarm;';

function deferred() {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

// Drain promise reactions without wall-clock sleeps or production timers.
async function settle() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

function fixture() {
  const nodes = [];
  const calls = {
    imports: 0, mounts: 0, open: 0, start: 0, minimize: 0, pause: 0, resume: 0,
    stop: 0, destroy: 0, activeWidgets: 0, createdElements: 0,
    scheduled: 0, forbiddenWork: 0, network: 0, storage: 0,
  };
  let time = 0;
  let moduleLoaded = false;
  const pendingImports = [];
  const mounts = [];
  const widgetActions = [];
  const timers = new Map();
  const animations = [];
  const consoleErrors = [];
  let timerSerial = 0;

  class Style {
    constructor(onChange) {
      this.values = new Map();
      this.onChange = onChange;
      return new Proxy(this, {
        get(target, key) { return key in target ? target[key] : target.getPropertyValue(String(key).replace(/[A-Z]/g, value => '-'+value.toLowerCase())); },
        set(target, key, value) {
          if (key in target) target[key] = value;
          else target.setProperty(String(key).replace(/[A-Z]/g, letter => '-'+letter.toLowerCase()), value);
          return true;
        },
      });
    }
    setProperty(name, value, priority = '') { this.values.set(name, { value: String(value), priority }); this.onChange(); }
    getPropertyValue(name) { return this.values.get(name)?.value || ''; }
    getPropertyPriority(name) { return this.values.get(name)?.priority || ''; }
    removeProperty(name) { const value=this.getPropertyValue(name); if(this.values.delete(name)) this.onChange(); return value; }
    get cssText() { return [...this.values].map(([name, item]) => name+': '+item.value+(item.priority?' !'+item.priority:'')+';').join(' '); }
    set cssText(value) {
      this.values.clear();
      for (const part of value.split(';')) {
        const index=part.indexOf(':'); if(index<0) continue;
        const name=part.slice(0,index).trim(), raw=part.slice(index+1).trim();
        this.setProperty(name,raw.replace(/\s*!important$/,''),/!important$/.test(raw)?'important':'');
      }
      this.onChange();
    }
  }

  class EventTarget {
    constructor() { this.listeners = new Map(); nodes.push(this); }
    addEventListener(type, handler, options) {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const list = this.listeners.get(type) || [];
      if (!list.some(item => item.handler === handler && item.capture === capture)) list.push({ handler, capture });
      this.listeners.set(type, list);
    }
    removeEventListener(type, handler, options) {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.handler !== handler || item.capture !== capture));
    }
    listenerCount(type) {
      return type ? (this.listeners.get(type) || []).length : [...this.listeners.values()].reduce((sum, list) => sum + list.length, 0);
    }
  }

  class Element extends EventTarget {
    constructor(tagName, ownerDocument) {
      super();
      this.tagName = tagName.toUpperCase();
      this.nodeType = 1;
      this.ownerDocument = ownerDocument;
      this.parentNode = null;
      this.children = [];
      this.attributes = new Map();
      this.hidden = false;
      this.shadowRoot = null;
      this.style = new Style(() => this.attributes.set('style',''));
      const classes = new Set();
      this.classList = {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          const enabled = force ?? !classes.has(name);
          if (enabled) classes.add(name); else classes.delete(name);
          return enabled;
        },
      };
    }
    get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
    get isConnected() { return this.parentNode === this.ownerDocument || !!this.parentNode?.isConnected; }
    appendChild(child) {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    replaceChildren(...children) {
      for (const child of [...this.children]) child.remove();
      this.append(...children);
    }
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index !== -1) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
    setAttribute(name, value) {
      if(name==='style') this.style.cssText=String(value);
      this.attributes.set(name, String(value));
    }
    removeAttribute(name) {
      if(name==='style') this.style.values.clear();
      this.attributes.delete(name);
    }
    getAttribute(name) {
      if(name==='style') return this.attributes.has(name)?this.style.cssText:null;
      return this.attributes.get(name) ?? null;
    }
    hasAttribute(name) { return this.attributes.has(name); }
    matches(selector) {
      return selector.split(',').some(part => {
        const match = part.trim().match(/^([a-z][\w-]*)?(?:\[([\w:-]+)(?:="([^"]*)")?\])?$/i);
        assert.ok(match, `Fake DOM needs support for selector: ${part}`);
        const [, tag, attribute, value] = match;
        return (!tag || tag.toUpperCase() === this.tagName)
          && (!attribute || (this.hasAttribute(attribute) && (value === undefined || this.getAttribute(attribute) === value)));
      });
    }
    closest(selector) {
      for (let current = this; current; current = current.parentElement) if (current.matches(selector)) return current;
      return null;
    }
    attachShadow() {
      assert.equal(this.shadowRoot, null);
      this.shadowRoot = new ShadowRoot(this);
      return this.shadowRoot;
    }
    getBoundingClientRect() { return { left: 100, top: 700, right: 220, bottom: 724, width: 120, height: 24 }; }
    animate(keyframes, settings) {
      const animation = { element: this, keyframes, settings, playState: 'running', cancel() { this.playState='idle'; }, finish() { this.playState='finished'; } };
      animations.push(animation);
      return animation;
    }
  }

  class ShadowRoot extends EventTarget {
    constructor(host) { super(); this.host = host; this.children = []; }
    get isConnected() { return this.host.isConnected; }
    appendChild(child) {
      child.remove(); child.parentNode = this; this.children.push(child); return child;
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    replaceChildren(...children) {
      for (const child of [...this.children]) child.remove();
      this.append(...children);
    }
  }

  const forbiddenWork = name => () => {
    calls.forbiddenWork++;
    throw new Error(`Dormant loader unexpectedly scheduled ${name}.`);
  };
  const forbiddenNetwork = () => { calls.network++; throw new Error('Loader unexpectedly accessed the network outside its lazy import.'); };
  const forbiddenStorage = () => { calls.storage++; throw new Error('Loader unexpectedly accessed storage.'); };
  const win = new EventTarget();
  Object.assign(win, {
    console: { error(...values) { consoleErrors.push(values); } },
    performance: { now: () => time },
    setTimeout(callback, delay = 0) { const id=++timerSerial; calls.scheduled++;timers.set(id,{ callback, at:time+Math.max(0,delay) });return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: forbiddenWork('interval'),
    requestAnimationFrame: forbiddenWork('RAF'), requestIdleCallback: forbiddenWork('idle callback'),
    fetch: forbiddenNetwork,
    localStorage: { getItem: forbiddenStorage, setItem: forbiddenStorage },
    getComputedStyle: element => ({ color: element.style.color || 'rgb(120, 120, 120)', getPropertyValue: name => element.style.getPropertyValue(name) || (name === 'color' ? 'rgb(120, 120, 120)' : '') }),
    matchMedia: () => ({ matches: false }),
  });
  const doc = new EventTarget();
  doc.defaultView = win;
  doc.hidden = false;
  doc.children = [];
  doc.body = new Element('body', doc);
  doc.body.parentNode = doc;
  doc.children.push(doc.body);
  doc.createElement = tag => { calls.createdElements++; return new Element(tag, doc); };

  function element(tag = 'div', attributes = {}, parent = doc.body) {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    parent?.appendChild(node);
    return node;
  }
  function composedPath(target) {
    const path = [];
    for (let node = target; node; node = node instanceof ShadowRoot ? node.host : node.parentNode) path.push(node);
    if (!path.includes(doc) && target === doc) path.push(doc);
    if (path.includes(doc)) path.push(win);
    return path;
  }
  function dispatch(type, target = doc.body, properties = {}) {
    const path = target === win ? [win] : composedPath(target);
    let stopped = false;
    const event = {
      type, target, key: '', repeat: false, isComposing: false,
      defaultPrevented: false, cancelable: true, isTrusted: true,
      altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
      clientX: 160, clientY: 712, detail: 1,
      getModifierState: name => name === 'CapsLock' ? !!properties.caps : false,
      composedPath: () => path.slice(),
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; },
      stopImmediatePropagation() { stopped = true; },
      stopPropagation() { stopped = true; },
      ...properties,
    };
    // Model capture and bubble phases. A listener removed by an earlier
    // callback must not run later in the same dispatch, matching EventTarget.
    for (const [route, capture] of [[path.slice().reverse(), true], [path, false]]) {
      for (const node of route) {
        for (const item of [...(node.listeners?.get(type) || [])]) {
          if (!(node.listeners?.get(type) || []).includes(item)) continue;
          if (item.capture === capture) item.handler.call(node, event);
          if (stopped) return event;
        }
      }
    }
    return event;
  }
  function key(keyValue, caps = false, target = doc.body, properties = {}) {
    return dispatch('keydown', target, { key: keyValue, caps, ...properties });
  }
  function capsKey(value, target = doc.body, type = 'keydown') {
    return dispatch(type, target, { key: 'CapsLock', caps: value });
  }
  const module = {
    mountSwarmGame(host, options) {
      calls.mounts++;
      calls.activeWidgets++;
      host.setAttribute('data-swarm-ui', '');
      const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      const button = element('button', {}, shadow);
      const onInput = () => {};
      win.addEventListener('swarm-stub-input', onInput);
      let destroyed = false;
      let snapshot = { status: 'idle', score: 0 };
      const update = status => { snapshot = { ...snapshot, status }; options.onState?.(snapshot); };
      const controller = {
        open() { assert.equal(destroyed, false); calls.open++; widgetActions.push('open'); options.onState?.(snapshot); },
        start() { assert.equal(destroyed, false); calls.start++; widgetActions.push('start'); update('running'); },
        minimize() { assert.equal(destroyed, false); calls.minimize++; widgetActions.push('minimize'); },
        pause() { assert.equal(destroyed, false); calls.pause++; widgetActions.push('pause'); if (snapshot.status === 'running') update('paused'); },
        resume() { assert.equal(destroyed, false); calls.resume++; widgetActions.push('resume'); if (snapshot.status === 'paused') update('running'); },
        stop() { assert.equal(destroyed, false); calls.stop++; widgetActions.push('stop'); update('idle'); },
        destroy() {
          assert.equal(destroyed, false, 'Controller must be destroyed only once.');
          destroyed = true; calls.destroy++; calls.activeWidgets--;
          widgetActions.push('destroy');
          win.removeEventListener('swarm-stub-input', onInput);
          shadow.replaceChildren();
        },
        getSnapshot: () => snapshot,
      };
      mounts.push({ host, options, controller, button });
      // The real widget renders its initial snapshot before mount returns.
      options.onState?.(snapshot);
      return controller;
    },
  };
  const loadWidget = () => {
    calls.imports++;
    if (moduleLoaded) return Promise.resolve(module);
    const request = deferred();
    pendingImports.push(request);
    return request.promise;
  };
  const context = createContext({
    document: doc, window: win, __loadWidget: loadWidget,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, setInterval: win.setInterval,
    requestAnimationFrame: win.requestAnimationFrame, requestIdleCallback: win.requestIdleCallback,
    MutationObserver: forbiddenWork('MutationObserver'), ResizeObserver: forbiddenWork('ResizeObserver'),
    fetch: forbiddenNetwork, XMLHttpRequest: forbiddenNetwork, WebSocket: forbiddenNetwork,
    localStorage: win.localStorage,
  });
  const installSwarm = new Script(instrumented, { filename: sourcePath }).runInContext(context);
  function resolveImport() {
    const request = pendingImports.shift();
    assert.ok(request, 'Expected a pending widget import.');
    moduleLoaded = true;
    request.resolve(module);
  }
  function rejectImport(error) {
    const request = pendingImports.shift();
    assert.ok(request, 'Expected a pending widget import.');
    request.reject(error);
  }
  function pill() { return doc.body.children.find(node => node.hasAttribute('data-swarm-launcher')) || null; }
  function assertClean(expectedChildren = []) {
    assert.equal(nodes.reduce((sum, node) => sum + node.listenerCount(), 0), 0, 'Every loader and widget listener must be released.');
    assert.equal(calls.activeWidgets, 0, 'No mounted widget may remain.');
    assert.deepEqual(doc.body.children, expectedChildren, 'Only caller-owned DOM may remain.');
    assert.equal(timers.size, 0, 'No hold or armed-window timer may survive cleanup.');
    assert.equal(animations.filter(animation => animation.playState === 'running').length, 0, 'No armed animation may survive cleanup.');
    assert.equal(calls.forbiddenWork, 0, 'Loader must not schedule RAF, observers, intervals, or idle callbacks.');
    assert.equal(calls.network, 0, 'No network calls except the instrumented lazy import.');
    assert.equal(calls.storage, 0, 'Dormant loader must not read or write storage.');
  }
  return {
    doc, win, calls, mounts, widgetActions, element, dispatch, key, capsKey, pill, animations, consoleErrors,
    install: options => installSwarm({ document: doc, ...options }),
    installSwarm, resolveImport, rejectImport, assertClean,
    setTime(value) { time = value; },
    advance(ms) {
      const until = time + ms;
      let count = 0;
      while (true) {
        const next = [...timers].filter(([,timer]) => timer.at <= until).sort((a,b) => a[1].at-b[1].at || a[0]-b[0])[0];
        if (!next) break;
        assert.ok(++count < 1000, 'Timer callbacks must not spin.');
        timers.delete(next[0]); time = next[1].at; next[1].callback();
      }
      time = until;
    },
    pendingTimers: () => timers.size,
    listenerCount: () => nodes.reduce((sum, node) => sum + node.listenerCount(), 0),
  };
}

test('module evaluation and dormant installation create no UI, import, or background work', () => {
  const f = fixture();
  assert.equal(f.listenerCount(), 0, 'Importing the entry module is inert.');
  assert.equal(f.calls.createdElements, 0);
  const installation = f.install();
  for (const value of 'ordinary letters and punctuation!?') f.key(value);
  assert.equal(installation.isUnlocked(), false);
  assert.equal(installation.getSnapshot(), null);
  assert.equal(f.calls.createdElements, 0);
  assert.equal(f.calls.imports, 0);
  assert.equal(f.calls.scheduled, 0, 'Dormant loader must not create even a timeout.');
  installation.destroy();
  f.assertClean();
});

for (const action of ['hide', 'pause', 'stop', 'destroy']) {
  test(`${action} during pending import prevents mounting or starting`, async () => {
    const f = fixture();
    const installation = f.install();
    const pending = installation.start();
    assert.equal(f.calls.imports, 1);
    installation[action]();
    f.resolveImport();
    await pending;
    assert.equal(f.calls.mounts, 0);
    assert.equal(f.calls.start, 0);
    installation.destroy();
    f.assertClean();
  });
}

test('Astro before-swap cancels pending import and removes no caller content', async () => {
  const f = fixture();
  const installation = f.install();
  const pending = installation.start();
  f.dispatch('astro:before-swap', f.doc);
  f.resolveImport();
  await pending;
  assert.equal(f.calls.mounts, 0);
  installation.destroy();
  f.assertClean();
});

test('hide then open during the same pending import honors the new intent', async () => {
  const f = fixture();
  const installation = f.install();
  const oldRequest = installation.start();
  installation.hide();
  const newRequest = installation.open();
  assert.equal(f.calls.imports, 1, 'The in-flight module request is shared.');
  f.resolveImport();
  await Promise.all([oldRequest, newRequest]);
  assert.equal(f.calls.mounts, 1);
  assert.equal(f.calls.start, 0, 'The cancelled start must never run.');
  assert.equal(f.calls.open, 1);
  assert.equal(installation.getSnapshot().status, 'idle');
  installation.destroy();
  f.assertClean();
});

for (const [actions, expected] of [
  [['open', 'start', 'start'], 'start'],
  [['start', 'open'], 'open'],
]) {
  test(`concurrent ${actions.join(' → ')} consumes only the latest intent`, async () => {
    const f = fixture();
    const installation = f.install();
    const pending = actions.map(action => installation[action]());
    assert.equal(f.calls.imports, 1);
    f.resolveImport();
    await Promise.all(pending);
    assert.equal(f.calls.mounts, 1);
    assert.equal(f.calls.start, expected === 'start' ? 1 : 0);
    assert.equal(f.calls.open, expected === 'open' ? 1 : 0);
    installation.destroy();
    f.assertClean();
  });
}

test('concurrent starts on an existing widget do not duplicate a new round', async () => {
  const f = fixture();
  const installation = f.install();
  const open = installation.open();
  f.resolveImport();
  await open;
  await Promise.all([installation.start(), installation.start(), installation.start()]);
  assert.equal(f.calls.start, 1);
  assert.equal(f.calls.mounts, 1);
  installation.destroy();
  f.assertClean();
});

test('minimize on a dormant installation creates no UI, import, or background work', () => {
  const f=fixture(), installation=f.install();
  installation.minimize();
  assert.equal(installation.isUnlocked(),false);
  assert.equal(installation.getSnapshot(),null);
  assert.equal(f.calls.imports,0);assert.equal(f.calls.createdElements,0);
  assert.equal(f.calls.scheduled,0);assert.deepEqual(f.widgetActions,[]);
  installation.destroy();f.assertClean();
});

for(const action of ['open','start']) {
  test(`minimize cancels a pending ${action} without mounting or starting the game`, async () => {
    const f=fixture(), installation=f.install();
    const pending=installation[action]();
    installation.minimize();f.resolveImport();await pending;
    assert.equal(f.calls.imports,1);assert.equal(f.calls.mounts,0);
    assert.equal(f.calls.createdElements,0);assert.deepEqual(f.widgetActions,[]);
    await installation.open();
    assert.equal(f.calls.mounts,1);assert.deepEqual(f.widgetActions,['open']);
    installation.destroy();f.assertClean();
  });
}

test('minimize delegates once without pausing, stopping, restarting, or revealing the external FAB', async () => {
  const f=fixture(), installation=f.install();
  installation.unlock();
  const pending=installation.start();f.resolveImport();await pending;
  assert.equal(f.pill().hidden,true);
  installation.minimize();
  assert.deepEqual(f.widgetActions,['start','minimize']);
  assert.equal(f.calls.minimize,1);assert.equal(f.calls.activeWidgets,1);
  assert.equal(installation.getSnapshot().status,'running');
  assert.equal(installation.isUnlocked(),true);assert.equal(f.pill().hidden,true);
  installation.unlock();
  assert.equal(f.pill().hidden,true,'The mounted widget retains responsibility for its own collapsed FAB.');
  installation.destroy();f.assertClean();
});

test('pause and resume after minimize preserve the collapsed HUD while resuming the engine', async () => {
  const f=fixture(), installation=f.install();
  installation.unlock();
  const pending=installation.start();f.resolveImport();await pending;
  installation.minimize();installation.pause();
  assert.equal(installation.getSnapshot().status,'paused');
  installation.resume();
  assert.deepEqual(f.widgetActions,['start','minimize','pause','resume']);
  assert.equal(f.calls.open,0,'Resuming gameplay must not unfold an already mounted, minimized HUD.');
  assert.equal(installation.getSnapshot().status,'running');
  assert.equal(f.pill().hidden,true);
  installation.destroy();f.assertClean();
});

for(const action of ['stop','close']) {
  test(`resume after ${action} still reopens the normally hidden widget`, async () => {
    const f=fixture(), installation=f.install();
    installation.unlock();
    const pending=installation.start();f.resolveImport();await pending;
    if(action==='stop') installation.stop();
    else {
      // The real widget's Close action stops its round before notifying the loader.
      f.mounts[0].controller.stop();
      f.mounts[0].options.onClose();
    }
    assert.equal(f.pill().hidden,false);
    installation.resume();
    assert.deepEqual(f.widgetActions,['start','stop','open','resume']);
    assert.equal(f.pill().hidden,true);
    assert.equal(f.calls.start,1,'Reopening a stopped widget must not silently start a new round.');
    installation.destroy();f.assertClean();
  });
}

for(const action of ['hide','Escape','destroy']) {
  test(`minimize after ${action} cannot resurrect the game or its controls`, async () => {
    const f=fixture(), installation=f.install();
    installation.unlock();
    const pending=installation.start();f.resolveImport();await pending;
    if(action==='Escape') f.key('Escape');else installation[action]();
    const before={...f.calls}, actions=f.widgetActions.slice(), children=f.doc.body.children.slice();
    installation.minimize();await settle();
    assert.deepEqual(f.calls,before);assert.deepEqual(f.widgetActions,actions);
    assert.deepEqual(f.doc.body.children,children);
    assert.ok(!f.pill()||f.pill().hidden);
    installation.destroy();f.assertClean();
  });
}

for (const action of ['hide', 'destroy']) {
  test(`synchronous initial onState ${action} disposes the not-yet-returned widget`, async () => {
    const f = fixture();
    let installation;
    installation = f.install({ onState() { installation[action](); } });
    const pending = installation.start();
    f.resolveImport();
    await pending;
    assert.equal(f.calls.mounts, 1);
    assert.equal(f.calls.destroy, 1);
    assert.equal(f.calls.activeWidgets, 0);
    assert.equal(f.calls.start + f.calls.open, 0);
    installation.destroy();
    f.assertClean();
  });
}

test('synchronous initial onState hide then open replaces the cancelled mount once', async () => {
  const f = fixture();
  let installation, reopened, handled = false;
  installation = f.install({ onState() {
    if (handled) return;
    handled = true;
    installation.hide();
    reopened = installation.open();
  } });
  const pending = installation.start();
  f.resolveImport();
  await pending;
  await reopened;
  assert.equal(f.calls.mounts, 2);
  assert.equal(f.calls.destroy, 1);
  assert.equal(f.calls.activeWidgets, 1);
  assert.equal(f.calls.start, 0);
  assert.equal(f.calls.open, 1);
  installation.destroy();
  f.assertClean();
});

test('caller host survives reentrant destroy, and its owner document reaches the widget', async () => {
  const f = fixture();
  // A different document is essential: the VM's global document must not win
  // over the explicit host's ownerDocument (for example, an iframe mount).
  const alternate = fixture();
  const host = alternate.element();
  let installation;
  installation = f.installSwarm({ host, onState() { installation.destroy(); } });
  const pending = installation.open();
  f.resolveImport();
  await pending;
  assert.equal(f.mounts[0].options.document, alternate.doc);
  assert.equal(host.isConnected, true);
  assert.equal(host.shadowRoot.children.length, 0);
  f.assertClean();
  alternate.assertClean([host]);
});

test('module load failure reports once and restores a retryable pill', async () => {
  const f = fixture();
  const errors = [];
  const installation = f.install({ onError: error => errors.push(error) });
  const pending = installation.open();
  const error = new Error('Fixture download failed.');
  const rejection = assert.rejects(pending, candidate => candidate === error);
  f.rejectImport(error);
  await rejection;
  assert.deepEqual(errors, [error]);
  assert.equal(f.pill()?.hidden, false);
  assert.equal(f.calls.mounts, 0);
  const retry = installation.open();
  f.resolveImport();
  await retry;
  assert.equal(f.calls.open, 1);
  installation.destroy();
  f.assertClean();
});

test('destroy is idempotent and later public activation methods stay inert', async () => {
  const f = fixture();
  const installation = f.install();
  installation.unlock();
  installation.destroy();
  installation.destroy();
  installation.unlock();
  await installation.open();
  await installation.start();
  installation.pause(); installation.resume(); installation.stop(); installation.hide();
  f.key('CapsLock', true);
  assert.equal(f.calls.imports, 0);
  assert.equal(installation.getSnapshot(), null);
  f.assertClean();
});

const CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a','b','a','Enter'];
function enterCode(f, target=f.doc.body, properties={}) {
  for (const value of CODE) { f.advance(80); f.key(value, false, target, properties); }
}
function beginHold(f, trigger, properties={}) { return f.dispatch('pointerdown',trigger,properties); }
function release(f, trigger, properties={}) {
  f.dispatch('pointerup',trigger,properties);
  return f.dispatch('click',trigger,properties);
}
function arm(f, trigger) {
  const importsBefore=f.calls.imports;
  beginHold(f,trigger);
  f.advance(900);
  release(f,trigger);
  assert.equal(f.calls.imports,importsBefore,'The release/compatibility click of a long press must not open the game.');
}
function tap(f, trigger) {
  beginHold(f,trigger);
  f.advance(50);
  release(f,trigger);
}
function copyright(f, attributes={}) { return f.element('span',{'data-swarm-trigger':'',...attributes}); }

// The keyboard command is deliberately independent of Caps Lock state.
test('the exact plain sequence reveals the FAB without downloading or starting the game', () => {
  const f=fixture(), installation=f.install();
  enterCode(f);
  assert.equal(installation.isUnlocked(),true);
  assert.equal(f.pill()?.hidden,false);
  assert.equal(f.calls.imports,0);
  assert.equal(f.calls.start,0);
  assert.equal(f.calls.scheduled,0);
  installation.destroy(); f.assertClean();
});

for (const [label,tag,attributes] of [
  ['input','input',{}], ['editable content','div',{contenteditable:''}],
  ['ordinary button','button',{}], ['link','a',{href:'#contact'}],
  ['ignored region','section',{'data-swarm-ignore':''}],
]) {
  test(`typing the code in ${label} does not activate or prevent native keys`, () => {
    const f=fixture(), target=f.element(tag,attributes), installation=f.install();
    for(const value of CODE) assert.equal(f.key(value,false,target).defaultPrevented,false);
    assert.equal(installation.isUnlocked(),false);assert.equal(f.calls.imports,0);
    installation.destroy();f.assertClean([target]);
  });
}

test('modifiers, repeat, composition, and a long gap cannot complete the command', () => {
  for (const properties of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{repeat:true},{isComposing:true},{defaultPrevented:true}]) {
    const f=fixture(), installation=f.install();
    enterCode(f,f.doc.body,properties);
    assert.equal(installation.isUnlocked(),false,JSON.stringify(properties));
    installation.destroy();f.assertClean();
  }
  const f=fixture(), installation=f.install();
  f.key(CODE[0]);f.key(CODE[1]);f.advance(2201);
  for(const value of CODE.slice(2)) f.key(value);
  assert.equal(installation.isUnlocked(),false);
  enterCode(f); assert.equal(installation.isUnlocked(),true);
  installation.destroy();f.assertClean();
});

test('Caps Lock transitions do nothing before, during, and after a round', async () => {
  const f=fixture(), installation=f.install();
  f.capsKey(true);f.capsKey(false);assert.equal(installation.isUnlocked(),false);
  enterCode(f);
  const pending=installation.start();f.resolveImport();await pending;
  for(const type of ['keydown','keyup']) { f.capsKey(true,f.mounts[0].button,type);f.capsKey(false,f.mounts[0].button,type); }
  assert.equal(f.calls.stop,0);assert.equal(f.calls.destroy,0);
  assert.equal(installation.getSnapshot().status,'running');
  installation.hide();
  f.capsKey(true);f.capsKey(false);
  assert.equal(f.pill()?.hidden,true);
  assert.equal(f.calls.imports,1);
  installation.destroy();f.assertClean();
});

test('Escape on an unlocked FAB fully relocks it and requires the complete command again', () => {
  const f=fixture(), installation=f.install();
  enterCode(f);
  const event=f.key('Escape');
  assert.equal(installation.isUnlocked(),false);
  assert.ok(!f.pill() || f.pill().hidden);
  assert.equal(f.calls.imports,0);
  assert.equal(event.defaultPrevented,false,'The site must retain its native Escape behavior.');
  f.capsKey(true);f.dispatch('click',f.doc.body);
  assert.equal(installation.isUnlocked(),false);
  for(const value of CODE.slice(2)) f.key(value);
  assert.equal(installation.isUnlocked(),false);
  enterCode(f);assert.equal(installation.isUnlocked(),true);
  installation.destroy();f.assertClean();
});

test('Escape cancels a pending import, and a later secret activation can open normally', async () => {
  const f=fixture(), installation=f.install();
  const pending=installation.start();
  f.key('Escape');f.resolveImport();await pending;
  assert.equal(f.calls.mounts,0);assert.equal(installation.isUnlocked(),false);
  assert.ok(!f.pill() || f.pill().hidden);
  installation.resume();assert.equal(f.calls.open+f.calls.start,0);
  enterCode(f);await installation.open();
  assert.equal(f.calls.mounts,1);assert.equal(f.calls.open,1);
  installation.destroy();f.assertClean();
});

for (const targetKind of ['page','widget button','form input']) {
  test(`Escape from ${targetKind} destroys the round and resume cannot resurrect it`, async () => {
    const f=fixture(), form=targetKind==='form input'?f.element('form'):null;
    const input=form?f.element('input',{},form):null;
    const installation=f.install({keyboard:false});
    const pending=installation.start();f.resolveImport();await pending;
    const target=input || (targetKind==='widget button'?f.mounts[0].button:f.doc.body);
    const event=f.key('Escape',false,target);
    assert.equal(installation.isUnlocked(),false);
    assert.equal(f.calls.destroy,1);assert.equal(f.calls.activeWidgets,0);
    assert.ok(!f.pill() || f.pill().hidden);
    assert.equal(event.defaultPrevented,false);
    installation.resume();
    assert.equal(f.calls.resume,0);
    assert.equal(f.calls.open,0);
    f.key('Escape',false,target);
    assert.equal(f.calls.destroy,1,'Repeated Escape must not destroy the same widget twice.');
    installation.destroy();f.assertClean(form?[form]:[]);
  });
}

test('Escape from a synchronous initial state callback cleans a partially mounted widget', async () => {
  const f=fixture();let installation;
  installation=f.install({onState(){ f.key('Escape'); }});
  const pending=installation.start();f.resolveImport();await pending;
  assert.equal(f.calls.mounts,1);assert.equal(f.calls.destroy,1);assert.equal(f.calls.activeWidgets,0);
  assert.equal(f.calls.start+f.calls.open,0);assert.equal(installation.isUnlocked(),false);
  installation.destroy();f.assertClean();
});

test('ordinary taps and the old five-tap shortcut never unlock the footer secret', () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  for(let index=0;index<6;index++) tap(f,trigger);
  assert.equal(installation.isUnlocked(),false);assert.equal(f.calls.imports,0);
  f.advance(6000);assert.equal(f.calls.imports,0);assert.equal(f.pendingTimers(),0);
  installation.destroy();f.assertClean([trigger]);
});

test('hold, release, then a distinct tap opens instructions without autoplay', async () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  beginHold(f,trigger);f.advance(899);
  assert.equal(f.calls.imports,0);assert.equal(installation.isUnlocked(),false);
  f.advance(1);release(f,trigger);
  assert.equal(f.calls.imports,0);assert.equal(installation.isUnlocked(),false);
  tap(f,trigger);
  assert.equal(f.calls.imports,1);assert.equal(installation.isUnlocked(),true);
  f.resolveImport();await settle();
  assert.equal(f.calls.open,1);assert.equal(f.calls.start,0);
  installation.destroy();f.assertClean([trigger]);
});

test('a detail-zero compatibility click from releasing the long hold cannot open instructions', async () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  beginHold(f,trigger);f.advance(900);
  release(f,trigger,{detail:0});
  assert.equal(f.calls.imports,0,'Even a detail-zero release click still belongs to the original hold.');
  assert.equal(installation.isUnlocked(),false);
  tap(f,trigger);
  assert.equal(f.calls.imports,1,'A separate subsequent tap can still confirm the armed cue.');
  f.resolveImport();await settle();
  assert.equal(f.calls.open,1);assert.equal(f.calls.start,0);
  installation.destroy();f.assertClean([trigger]);
});

test('the second tap is accepted before the five-second cue expires', async () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  arm(f,trigger);f.advance(4949);tap(f,trigger);
  assert.equal(f.calls.imports,1);
  f.resolveImport();await settle();
  installation.destroy();f.assertClean([trigger]);
});

test('an expired cue restores the trigger and requires a fresh long press', () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  trigger.style.setProperty('color','rgb(1, 2, 3)','important');
  const previous=trigger.style.cssText;
  arm(f,trigger);f.advance(5000);
  assert.equal(trigger.style.cssText,previous);
  assert.equal(f.pendingTimers(),0);
  tap(f,trigger);
  assert.equal(f.calls.imports,0);assert.equal(installation.isUnlocked(),false);
  installation.destroy();f.assertClean([trigger]);
});

for (const phase of ['holding','armed']) {
  for (const interruption of ['movement','scroll','pointercancel','second pointer','blur','hidden','route','Escape','destroy']) {
    test(`${interruption} during ${phase} cancels the footer gesture and restores its presentation`, () => {
      const f=fixture(), trigger=copyright(f), installation=f.install();
      trigger.style.color='rgb(1, 2, 3)';
      trigger.style.setProperty('user-select','text','important');
      const previous=trigger.style.cssText;
      beginHold(f,trigger);f.advance(phase==='armed'?900:300);
      if(phase==='armed') release(f,trigger);
      if(interruption==='movement') {
        // A fresh tap that turns into a scroll must also cancel an armed cue.
        if(phase==='armed') beginHold(f,trigger);
        f.dispatch('pointermove',trigger,{clientX:173});
      } else if(interruption==='scroll') f.dispatch('scroll',f.doc);
      else if(interruption==='pointercancel') f.dispatch('pointercancel',trigger);
      else if(interruption==='second pointer') f.dispatch('pointerdown',trigger,{pointerId:2,isPrimary:false});
      else if(interruption==='blur') f.dispatch('blur',f.win);
      else if(interruption==='hidden') { f.doc.hidden=true;f.dispatch('visibilitychange',f.doc); }
      else if(interruption==='route') f.dispatch('astro:before-swap',f.doc);
      else if(interruption==='Escape') f.key('Escape');
      else installation.destroy();
      release(f,trigger);f.advance(6000);tap(f,trigger);
      assert.equal(f.calls.imports,0);assert.equal(installation.isUnlocked(),false);
      assert.equal(trigger.style.cssText,previous,'The gesture may not leave styling behind.');
      installation.destroy();f.assertClean([trigger]);
    });
  }
}

test('a cue does not authorize a tap on a different marked target', () => {
  const f=fixture(), first=copyright(f), second=copyright(f), installation=f.install();
  arm(f,first);tap(f,second);
  assert.equal(f.calls.imports,0);assert.equal(installation.isUnlocked(),false);
  installation.destroy();f.assertClean([first,second]);
});

test('unmarked footer text, links, forms, and editable regions do not acquire a hold timer', () => {
  for(const [tag,attrs,parentTag] of [
    ['span',{},null], ['a',{'data-swarm-trigger':'',href:'#legal'},null],
    ['span',{'data-swarm-trigger':''},'form'],
    ['span',{'data-swarm-trigger':'',contenteditable:''},null],
  ]) {
    const f=fixture(), parent=parentTag?f.element(parentTag):null;
    const target=f.element(tag,attrs,parent||f.doc.body),installation=f.install();
    beginHold(f,target);f.advance(1000);release(f,target);tap(f,target);
    assert.equal(f.calls.scheduled,0);assert.equal(f.calls.imports,0);
    installation.destroy();f.assertClean([parent||target]);
  }
});

test('an explicit custom trigger selector works and triggerSelector false disables the gesture', async () => {
  const f=fixture(), target=f.element('span',{'data-footer-secret':''}), installation=f.install({triggerSelector:'[data-footer-secret]',targetSelector:'[data-custom-swarm-target]'});
  arm(f,target);tap(f,target);assert.equal(f.calls.imports,1);
  f.resolveImport();await settle();
  assert.equal(f.mounts[0].options.targetSelector,'[data-custom-swarm-target]','The custom game target selector must reach the lazy widget unchanged.');
  installation.destroy();f.assertClean([target]);
  const other=fixture(), trigger=copyright(other), disabled=other.install({triggerSelector:false});
  beginHold(other,trigger);other.advance(1000);release(other,trigger);tap(other,trigger);
  assert.equal(other.calls.imports,0);assert.equal(other.calls.scheduled,0);
  disabled.destroy();other.assertClean([trigger]);
});

test('detaching a trigger while held does not arm or load the game', () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  beginHold(f,trigger);trigger.remove();f.advance(1000);
  assert.equal(f.calls.imports,0);assert.equal(installation.isUnlocked(),false);
  installation.destroy();f.assertClean();
});

test('cancelling the cue preserves a newer application color change', () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  trigger.style.color='red';arm(f,trigger);
  trigger.style.color='purple';f.key('Escape');
  assert.equal(trigger.style.color,'purple');
  installation.destroy();f.assertClean([trigger]);
});

test('a held cue expires safely even when its finger has not yet been released', () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  beginHold(f,trigger);f.advance(5900);
  assert.equal(f.pendingTimers(),0);
  assert.equal(trigger.hasAttribute('style'),false,'A temporary selection style must not leave an empty attribute.');
  release(f,trigger);tap(f,trigger);
  assert.equal(f.calls.imports,0);assert.equal(installation.isUnlocked(),false);
  installation.destroy();f.assertClean([trigger]);
});

test('native hold suppression is confined to the marked text while its gesture is active', () => {
  const f=fixture(), trigger=copyright(f), other=f.element('span'), installation=f.install();
  for(const type of ['contextmenu','selectstart']) {
    assert.equal(f.dispatch(type,trigger).defaultPrevented,false);
    assert.equal(f.dispatch(type,other).defaultPrevented,false);
  }
  beginHold(f,trigger);
  for(const type of ['contextmenu','selectstart']) {
    assert.equal(f.dispatch(type,trigger).defaultPrevented,true);
    assert.equal(f.dispatch(type,other).defaultPrevented,false);
  }
  f.advance(900);release(f,trigger);
  assert.equal(f.dispatch('contextmenu',trigger).defaultPrevented,true);
  f.advance(5000);
  for(const type of ['contextmenu','selectstart']) assert.equal(f.dispatch(type,trigger).defaultPrevented,false);
  installation.destroy();f.assertClean([trigger,other]);
});

test('cancelling a hold preserves newer application styles on the marked text', () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  beginHold(f,trigger);
  trigger.style.setProperty('user-select','all','important');
  trigger.style.color='purple';
  f.key('Escape');
  assert.equal(trigger.style.getPropertyValue('user-select'),'all');
  assert.equal(trigger.style.getPropertyPriority('user-select'),'important');
  assert.equal(trigger.style.color,'purple');
  assert.equal(trigger.style.getPropertyValue('-webkit-user-select'),'');
  assert.equal(trigger.style.getPropertyValue('-webkit-touch-callout'),'');
  installation.destroy();f.assertClean([trigger]);
});

test('after Escape the footer must be held and tapped again, even if it previously unlocked', async () => {
  const f=fixture(), trigger=copyright(f), installation=f.install();
  arm(f,trigger);tap(f,trigger);f.resolveImport();await settle();
  f.key('Escape');assert.equal(installation.isUnlocked(),false);
  tap(f,trigger);assert.equal(f.calls.imports,1);assert.equal(installation.isUnlocked(),false);
  arm(f,trigger);tap(f,trigger);await settle();
  assert.equal(f.calls.mounts,2);assert.equal(f.calls.open,2);assert.equal(f.calls.start,0);
  installation.destroy();f.assertClean([trigger]);
});

test('unlock, open, close, and destroy release all owned nodes/listeners without idle work', async () => {
  const f = fixture();
  const installation = f.install();
  installation.unlock();
  const button = f.pill().shadowRoot.children.find(node => node.tagName === 'BUTTON');
  f.dispatch('click', button);
  assert.equal(f.calls.imports, 1);
  f.resolveImport();
  await settle();
  assert.equal(f.calls.open, 1);
  assert.equal(f.calls.start, 0);
  assert.equal(f.pill().hidden, true);
  f.mounts[0].options.onClose();
  assert.equal(f.pill().hidden, false);
  installation.hide();
  installation.destroy();
  f.assertClean();
});


test('a throwing onState hook is reported once and disabled without blocking mounting or future rounds', async () => {
  const f = fixture(), failure = new Error('consumer state hook failed'), errors = [];
  let stateCalls = 0;
  const installation = f.install({ onState() { stateCalls++; throw failure; }, onError: error => errors.push(error) });
  const pending = installation.start(); f.resolveImport(); await pending;
  assert.equal(f.calls.activeWidgets, 1); assert.equal(installation.getSnapshot().status, 'running');
  for (let index = 0; index < 20; index++) assert.doesNotThrow(() => f.mounts[0].options.onState({ status: 'running', score: index }));
  installation.pause(); installation.resume();
  assert.equal(installation.getSnapshot().status, 'running');
  assert.equal(stateCalls, 1); assert.deepEqual(errors, [failure]); assert.equal(f.consoleErrors.length, 0);
  f.key('Escape'); await installation.start();
  assert.equal(f.calls.mounts, 2); assert.equal(stateCalls, 1, 'Faulty hook stays disabled for this installation');
  assert.deepEqual(errors, [failure]);
  installation.destroy(); f.assertClean();
});

test('a throwing onEvent hook cannot interrupt engine callers or disable a healthy state hook', async () => {
  const f = fixture(), failure = new Error('consumer event hook failed'), errors = [], states = [];
  let eventCalls = 0;
  const installation = f.install({ onState: snapshot => states.push(snapshot.status), onEvent() { eventCalls++; throw failure; }, onError: error => errors.push(error) });
  const pending = installation.start(); f.resolveImport(); await pending;
  assert.deepEqual(states, ['idle', 'running'], 'Healthy initial callback order is unchanged');
  for (let index = 0; index < 20; index++) assert.doesNotThrow(() => f.mounts[0].options.onEvent({ type: 'bite' }));
  installation.pause(); installation.resume();
  assert.deepEqual(states, ['idle', 'running', 'paused', 'running']);
  assert.equal(eventCalls, 1); assert.deepEqual(errors, [failure]);
  assert.equal(installation.getSnapshot().status, 'running');
  installation.destroy(); f.assertClean();
});

for (const reporter of ['absent', 'throwing']) {
  test(`callback reporting has a guarded console fallback when onError is ${reporter}`, async () => {
    const f = fixture(), stateFailure = new Error('state failed'), eventFailure = new Error('event failed'), reportFailure = new Error('reporter failed');
    let errorCalls = 0;
    const options = { onState() { throw stateFailure; }, onEvent() { throw eventFailure; } };
    if (reporter === 'throwing') options.onError = () => { errorCalls++; throw reportFailure; };
    const installation = f.install(options);
    const pending = installation.start(); f.resolveImport(); await pending;
    assert.equal(f.consoleErrors.length, 1); assert.equal(f.consoleErrors[0][1], stateFailure);
    if (reporter === 'throwing') assert.equal(f.consoleErrors[0][2], reportFailure);
    // A broken host logger must not send the original hook failure back into RAF.
    const logger = f.win.console.error;
    f.win.console.error = (...values) => { logger(...values); throw new Error('logger failed'); };
    for (let index = 0; index < 20; index++) {
      assert.doesNotThrow(() => f.mounts[0].options.onState({ status: 'running' }));
      assert.doesNotThrow(() => f.mounts[0].options.onEvent({ type: 'damage' }));
    }
    assert.equal(f.consoleErrors.length, 2, 'Each failing hook logs once, never on every snapshot');
    assert.equal(f.consoleErrors[1][1], eventFailure);
    assert.equal(errorCalls, reporter === 'throwing' ? 1 : 0, 'A failing onError is also disabled');
    assert.equal(installation.getSnapshot().status, 'running');
    installation.destroy(); f.assertClean();
  });
}

for (const action of ['hide', 'destroy']) {
  test(`error reporting can synchronously ${action} during the first state callback without a partial mount leak`, async () => {
    const f = fixture(), failure = new Error('initial hook failed');
    let installation, errors = 0;
    installation = f.install({ onState() { throw failure; }, onError(error) { assert.equal(error, failure); errors++; installation[action](); } });
    const pending = installation.start(); f.resolveImport(); await pending;
    assert.equal(errors, 1); assert.equal(f.calls.mounts, 1); assert.equal(f.calls.destroy, 1);
    assert.equal(f.calls.activeWidgets, 0); assert.equal(f.calls.start, 0);
    installation.destroy(); f.assertClean();
  });
}
