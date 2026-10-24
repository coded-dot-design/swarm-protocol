import { transformSync } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Historical fixtures are regression data only; exclude them from npm runtime.
// Focused snapshot-render parity test. The stub engine intentionally excludes
// gameplay and audio; color getters mimic CSSOM's hex-to-rgb normalization.
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[i + 1]]);
  return pairs;
}, []));
args.widget ||= fileURLToPath(new URL('../src/swarm-widget.ts', import.meta.url));
args.baseline ||= fileURLToPath(new URL('./fixtures/swarm-widget-before-hud.js', import.meta.url));
const baseSnapshot = {
  status: 'idle', score: 0, best: 430, wave: 0, kills: 0, combo: 1,
  alive: 0, remaining: 0, integrity: 100, nextWaveIn: 0, elapsed: 0,
  frenzy: false, offscreenBugs: 0,
  targets: [{ id: 'hero', label: 'Book a demo', health: 100, visible: true },
    { id: 'footer', label: 'Contact our team', health: 100, visible: false }]
};

function makeFixture() {
  const counts = { lookups: 0, text: 0, hidden: 0, style: 0, className: 0,
    classToggle: 0, attribute: 0, innerHTML: 0, replaceChildren: 0 };
  const normalizeColor = value => String(value).replace(/^#([0-9a-f]{6})$/i, (_, hex) =>
    `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4), 16)})`);
  const listeners = new Set();
  class EventTarget {
    constructor() { this._listeners = []; }
    addEventListener(type, listener, options) {
      const key = { owner: this, type, listener, capture: options === true || Boolean(options?.capture) };
      this._listeners.push(key); listeners.add(key);
    }
    removeEventListener(type, listener, options) {
      const capture = options === true || Boolean(options?.capture);
      const index = this._listeners.findIndex(entry => entry.listener === listener && entry.type === type && entry.capture === capture);
      if (index >= 0) { listeners.delete(this._listeners[index]); this._listeners.splice(index, 1); }
    }
    fire(type, event = {}, capture = null) {
      for (const entry of [...this._listeners]) {
        if (entry.type === type && (capture === null || entry.capture === capture) && this._listeners.includes(entry)) entry.listener(event);
      }
    }
  }
  class Element extends EventTarget {
    constructor(tagName = 'div') {
      super(); this.tagName = tagName; this.id = ''; this._text = ''; this._html = '';
      this._hidden = false; this._className = ''; this.children = [];
      this.attributes = {}; this.styleValues = {};
      this.style = new Proxy(this.styleValues, {
        get: (object, property) => object[property] || '',
        set: (object, property, value) => {
          counts.style++;
          object[property] = property === 'color' || property === 'background' ? normalizeColor(value) : String(value);
          return true;
        }
      });
      this.classList = { toggle: (name, force) => {
        counts.classToggle++;
        const values = new Set(this._className.split(/\s+/).filter(Boolean));
        const shouldAdd = force ?? !values.has(name);
        if (shouldAdd) values.add(name); else values.delete(name);
        this._className = [...values].join(' ');
        return shouldAdd;
      } };
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { counts.text++; this._text = String(value); this._html = ''; this.children = []; }
    get hidden() { return this._hidden; }
    set hidden(value) { counts.hidden++; this._hidden = Boolean(value); }
    get className() { return this._className; }
    set className(value) { counts.className++; this._className = String(value); }
    get innerHTML() { return this._html; }
    set innerHTML(value) { counts.innerHTML++; this._html = String(value); this._text = ''; this.children = []; }
    setAttribute(name, value) { counts.attribute++; this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { counts.attribute++; delete this.attributes[name]; }
    append(...values) { this.children.push(...values); }
    replaceChildren(...values) { counts.replaceChildren++; this._text = ''; this._html = ''; this.children = [...values]; }
    focus() { doc.focusedId = this.id; host.shadowRoot.activeElement = this; }
  }
  class ShadowRoot extends Element {
    constructor() { super('shadow-root'); this.elements = new Map(); }
    set innerHTML(html) {
      counts.innerHTML++; this._html = html; this.elements.clear();
      for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>([^<]*)/gi)) {
        const element = new Element(match[1]);
        element.id = match[3]; element._text = match[4];
        element._hidden = /(?:^|\s)hidden(?:\s|$)/.test(match[2]);
        element._className = /\bclass="([^"]*)"/.exec(match[2])?.[1] || '';
        this.elements.set(element.id, element);
      }
    }
    getElementById(id) { counts.lookups++; return this.elements.get(id) || null; }
    replaceChildren(...values) { super.replaceChildren(...values); this.elements.clear(); this.activeElement = null; }
  }
  const win = new EventTarget();
  win.localStorage = { getItem: () => null, setItem() {} };
  win.performance = { now: () => 1000 };
  win.navigator = { userActivation: { isActive: false } };
  const doc = new EventTarget(); doc.defaultView = win; doc.hidden = false; doc.focusedId = '';
  doc.createElement = tagName => new Element(tagName);
  doc.createTextNode = value => ({ textContent: String(value), tagName: '#text' });
  const host = new Element('div'); host.ownerDocument = doc; host.isConnected = true;
  host.attachShadow = () => host.shadowRoot = new ShadowRoot();
  const serialize = element => ({
    tag: element.tagName, text: element.textContent, html: element._html || '',
    hidden: element.hidden || false, classes: element.className || '',
    style: { ...(element.styleValues || {}) }, attributes: { ...(element.attributes || {}) },
    title: element.title || '', disabled: Boolean(element.disabled),
    children: (element.children || []).map(serialize)
  });
  return { host, doc, counts, listeners, snapshot: () => ({ focusedId: doc.focusedId,
    ui: Object.fromEntries([...host.shadowRoot.elements].map(([id, element]) => [id, serialize(element)])) }) };
}

async function widgetSource(path) {
  let source = await readFile(path, 'utf8');
  // Keep the historical rendering workload, with the approved damage stages.
  // This comparison measures DOM writes, not the previous color thresholds.
  if (path === args.baseline) source = source
    .replace(/health>55/g, 'health>75').replace(/health>25/g, 'health>35')
    .replace(/t.health>50/g, 't.health>75').replace(/t.health>0/g, 't.health>35');
  return transformSync(source, {loader: path.endsWith('.ts') ? 'ts' : 'js'}).code
    .replace(/(["'])\.\/target-health\.js\1/g, JSON.stringify(new URL('../src/target-health.ts', import.meta.url).href));
}

async function run(path, label, options = {}) {
  const fixture = makeFixture(), checkpoints = [], repeated = {}, callbacks = [];
  let engine, optionsForEngine, state = structuredClone(baseSnapshot);
  globalThis.__swarmHudEngineFactory = engineOptions => {
    optionsForEngine = engineOptions;
    const emit = update => { state = { ...state, ...structuredClone(update) }; engineOptions.onState(structuredClone(state)); };
    engine = {
      start: () => emit({ ...baseSnapshot, status: 'running', wave: 1, alive: 12, remaining: 12, nextWaveIn: 18 }),
      pause: () => emit({ status: 'paused' }), resume: () => emit({ status: 'running' }),
      stop: () => emit(baseSnapshot), destroy() { this.destroyed = true; },
      getSnapshot: () => structuredClone(state), emit
    };
    return engine;
  };
  const source = (await widgetSource(path)).replace(
    /import\s*\{\s*createDomDefender\s*\}\s*from\s*[\x27\x22]\.\/dom-defender\.js[\x27\x22];/,
    'const createDomDefender = globalThis.__swarmHudEngineFactory;'
  );
  const module = await import(`data:text/javascript;base64,${Buffer.from(source + '\n// ' + label).toString('base64')}`);
  const widget = module.mountSwarmGame(fixture.host, { ...options, onState: snapshot => callbacks.push(snapshot) });
  const checkpoint = name => checkpoints.push({ name, state: fixture.snapshot() });
  const repeat = (name, count = 100) => {
    const before = { ...fixture.counts };
    for (let index = 0; index < count; index++) engine.emit({});
    repeated[name] = Object.fromEntries(Object.entries(fixture.counts).map(([key, value]) => [key, value - before[key]]));
    checkpoint(name);
  };
  checkpoint('idle');
  widget.open(); checkpoint('open');
  assert.equal(fixture.host.shadowRoot.elements.get('panel').hidden, false);
  assert.equal(fixture.host.shadowRoot.elements.get('intro').hidden, false);
  widget.start(); checkpoint('start'); repeat('running-stable');
  engine.emit({ score: 780, best: 780, wave: 3, kills: 15, combo: 4, alive: 39, remaining: 48,
    integrity: 48, nextWaveIn: 6.3, frenzy: true, offscreenBugs: 21,
    targets: [{ id: 'hero', label: 'Book a demo', health: 0, visible: false },
      { id: 'footer', label: 'Talk with a security expert', health: 96, visible: false }] });
  checkpoint('frenzy'); repeat('frenzy-stable');
  widget.pause(); checkpoint('paused'); repeat('paused-stable');
  assert.equal(fixture.host.shadowRoot.elements.get('active').hidden, true);
  assert.equal(fixture.host.shadowRoot.elements.get('paused').hidden, false);
  widget.resume(); checkpoint('resumed');
  engine.emit({ status: 'intermission', nextWaveIn: 2.8, alive: 0, remaining: 0, score: 1200, integrity: 53 });
  checkpoint('intermission'); repeat('intermission-stable');
  engine.emit({ status: 'running', nextWaveIn: 18, wave: 4, alive: 30, frenzy: false, offscreenBugs: 0,
    integrity: 22, targets: [{ id: 'hero', label: 'Book a demo', health: 22, visible: true }] });
  checkpoint('low-integrity');
  engine.emit({ status: 'gameover', score: 1790, best: 1790, wave: 5, kills: 49, integrity: 0, alive: 0,
    nextWaveIn: 0, targets: [{ id: 'hero', label: 'Book a demo', health: 0, visible: true }] });
  checkpoint('gameover'); repeat('gameover-stable');
  assert.equal(fixture.host.shadowRoot.elements.get('result').hidden, false);
  assert.equal(fixture.host.shadowRoot.elements.get('record').textContent, 'NEW PERSONAL BEST');
  widget.stop(); checkpoint('closed');
  assert.equal(fixture.host.shadowRoot.elements.get('panel').hidden, true);
  assert.equal(fixture.host.shadowRoot.elements.get('launcher').hidden, options.showLauncher === false);
  widget.destroy(); checkpoint('destroyed');
  const countAfterDestroy = { ...fixture.counts };
  optionsForEngine.onState({ ...state, status: 'running', score: 999 });
  assert.deepEqual(fixture.counts, countAfterDestroy, 'late snapshot must not touch destroyed DOM');
  assert.equal(fixture.listeners.size, 0, 'all widget listeners released');
  assert.equal(engine.destroyed, true);
  delete globalThis.__swarmHudEngineFactory;
  return { checkpoints, repeated, callbacks, totals: fixture.counts };
}

// The new exit contract is deliberately verified separately from historical HUD
// parity. This models window/document capture order and the old core bubble key.
async function verifyEscapeExit(path) {
  const fixture = makeFixture(), win = fixture.doc.defaultView;
  let state = structuredClone(baseSnapshot), engine, closes = 0, corePauses = 0;
  let audioContexts = 0, audioResumes = 0, context;
  win.AudioContext = class {
    constructor() { audioContexts++; context = this; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { setValueAtTime() {} }, connect() {}, disconnect() {} }; }
    resume() { audioResumes++; this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  };
  globalThis.__swarmHudEngineFactory = options => {
    const emit = update => { state = { ...state, ...update }; options.onState(structuredClone(state)); };
    const legacyEscape = event => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
      if (['running', 'intermission'].includes(state.status)) {
        corePauses++; event.preventDefault(); emit({ status: 'paused' });
      } else if (state.status === 'paused') { event.preventDefault(); emit({ status: 'running' }); }
    };
    fixture.doc.addEventListener('keydown', legacyEscape);
    engine = {
      start() { emit({ ...baseSnapshot, status: 'running', wave: 1, alive: 12 }); options.onEvent({ type: 'wave-start', wave: 1, count: 12, reason: 'start' }); },
      pause: () => emit({ status: 'paused' }), resume: () => emit({ status: 'running' }),
      stop() { emit(structuredClone(baseSnapshot)); options.onEvent({ type: 'status', status: 'idle' }); },
      destroy() { this.stop(); fixture.doc.removeEventListener('keydown', legacyEscape); },
      getSnapshot: () => structuredClone(state)
    };
    return engine;
  };
  const source = (await widgetSource(path)).replace(
    /import\s*\{\s*createDomDefender\s*\}\s*from\s*[\x27\x22]\.\/dom-defender\.js[\x27\x22];/,
    'const createDomDefender = globalThis.__swarmHudEngineFactory;'
  );
  const module = await import(`data:text/javascript;base64,${Buffer.from(source + '\n// escape-contract').toString('base64')}`);
  const widget = module.mountSwarmGame(fixture.host, { initiallyClosed: false, onClose() { closes++; } });
  const ui = id => fixture.host.shadowRoot.elements.get(id);
  const key = (repeat = false) => {
    const event = { key: 'Escape', isTrusted: true, repeat, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    win.fire('keydown', event, true);
    fixture.doc.fire('keydown', event, true);
    fixture.doc.fire('keydown', event, false);
    win.fire('keydown', event, false);
    return event;
  };
  const exited = event => {
    assert.equal(state.status, 'idle', 'Escape stops the engine');
    for (const id of ['panel', 'launcher', 'hint', 'banner']) assert.equal(ui(id).hidden, true, 'Escape hides ' + id);
    assert.equal(ui('announce').textContent, '', 'Hidden game leaves no stale live announcement');
    assert.equal(event.defaultPrevented, false, 'Host Escape behavior remains available');
    assert.equal(event.stopped, undefined, 'Escape bubbles to host listeners');
    assert.equal(corePauses, 0, 'Widget capture stops before the legacy core pause shortcut');
    assert.equal(closes, 1, 'Escape does not invoke the normal close-to-launcher callback');
  };
  ui('close').fire('click');
  assert.equal(closes, 1); assert.equal(ui('panel').hidden, true); assert.equal(ui('launcher').hidden, false);
  widget.start();
  key(true); assert.equal(state.status, 'running', 'Autorepeated Escape does not create another action');
  exited(key()); assert.equal(audioContexts, 0, 'Escape never creates audio for a programmatic start');
  widget.open(); assert.equal(ui('panel').hidden, false, 'Explicit API open can reopen a low-level widget');
  widget.start({ isTrusted: true });
  await Promise.resolve();
  assert.equal(audioContexts, 1); assert.equal(audioResumes, 1);
  context.state = 'suspended'; widget.pause();
  exited(key()); assert.equal(audioResumes, 1, 'Escape never resumes suspended audio');
  widget.stop(); assert.equal(ui('launcher').hidden, true, 'A subsequent stop cannot reveal an escaped launcher');
  widget.destroy();
  assert.equal(fixture.listeners.size, 0, 'Escape listener is released with the widget');
  delete globalThis.__swarmHudEngineFactory;
  return { captureBeforeCore: true, fullHide: true, hostEscapePreserved: true,
    normalClosePreserved: true, noAudioUnlock: true, cleanup: true };
}

// Mount must not leave listeners behind when a consumer callback throws before
// receiving its cleanup handle. The original exception still reaches the caller.
async function verifyMountFailure(path) {
  const scenarios = [];
  for (const mode of ['constructor', 'initial-onState']) {
    const fixture = makeFixture(), failure = new Error('expected ' + mode + ' failure');
    let destroyed = 0, callbacks = 0, optionsForEngine;
    globalThis.__swarmHudEngineFactory = options => {
      optionsForEngine = options;
      if (mode === 'constructor') throw failure;
      const handler = () => {};
      fixture.doc.addEventListener('keydown', handler);
      fixture.doc.defaultView.addEventListener('pointerdown', handler, true);
      return {
        getSnapshot: () => structuredClone(baseSnapshot),
        destroy() {
          destroyed++;
          // Real core destroy emits idle synchronously; widget teardown must
          // suppress forwarding it to the failing consumer during cleanup.
          options.onState(structuredClone(baseSnapshot));
          options.onEvent({ type: 'status', status: 'idle' });
          fixture.doc.removeEventListener('keydown', handler);
          fixture.doc.defaultView.removeEventListener('pointerdown', handler, true);
        }
      };
    };
    const source = (await widgetSource(path)).replace(
      /import\s*\{\s*createDomDefender\s*\}\s*from\s*[\x27\x22]\.\/dom-defender\.js[\x27\x22];/,
      'const createDomDefender = globalThis.__swarmHudEngineFactory;'
    );
    const module = await import(`data:text/javascript;base64,${Buffer.from(source + '\n// failure-' + mode).toString('base64')}`);
    assert.throws(() => module.mountSwarmGame(fixture.host, { onState() { callbacks++; throw failure; } }), error => error === failure);
    assert.equal(callbacks, mode === 'constructor' ? 0 : 1, 'Failed callback is not retried during cleanup');
    assert.equal(destroyed, mode === 'constructor' ? 0 : 1);
    assert.equal(fixture.listeners.size, 0, 'Failed mount releases widget and engine listeners');
    assert.equal(fixture.host.shadowRoot.elements.size, 0, 'Failed mount removes its shadow UI');
    assert.equal(fixture.host.getAttribute('data-swarm-collapsed'), null);
    assert.equal(fixture.host.getAttribute('data-swarm-round'), null);
    const afterFailure = { ...fixture.counts };
    optionsForEngine.onState({ ...baseSnapshot, status: 'running' });
    assert.deepEqual(fixture.counts, afterFailure, 'Failed mount ignores late snapshots');
    delete globalThis.__swarmHudEngineFactory;
    scenarios.push(mode);
  }
  return { scenarios, cleanup: true, originalErrorRethrown: true };
}

// Minimize is a new presentation state; keep its contract outside the historical
// render comparison. Both installation modes must keep their active-round FAB.
async function verifyMinimize(path, showLauncher) {
  const fixture = makeFixture(), callbacks = [], calls = { start: 0, pause: 0, resume: 0, stop: 0, destroy: 0 };
  let state = structuredClone(baseSnapshot), engine;
  globalThis.__swarmHudEngineFactory = options => {
    const emit = update => { state = { ...state, ...structuredClone(update) }; options.onState(structuredClone(state)); };
    engine = {
      start() { calls.start++; emit({ ...baseSnapshot, status: 'running', wave: 1, alive: 12, nextWaveIn: 18 }); },
      pause() { calls.pause++; emit({ status: 'paused' }); },
      resume() { calls.resume++; emit({ status: 'running' }); },
      stop() { calls.stop++; emit(baseSnapshot); },
      destroy() { calls.destroy++; this.stop(); },
      getSnapshot: () => structuredClone(state), emit, event: options.onEvent
    };
    return engine;
  };
  const source = (await widgetSource(path)).replace(
    /import\s*\{\s*createDomDefender\s*\}\s*from\s*[\x27\x22]\.\/dom-defender\.js[\x27\x22];/,
    'const createDomDefender = globalThis.__swarmHudEngineFactory;'
  );
  const module = await import(`data:text/javascript;base64,${Buffer.from(source + '\n// minimize-' + showLauncher).toString('base64')}`);
  const widget = module.mountSwarmGame(fixture.host, { initiallyClosed: false, showLauncher, onState: value => callbacks.push(value) });
  const ui = id => fixture.host.shadowRoot.elements.get(id);
  const folded = () => {
    assert.equal(ui('panel').hidden, true); assert.equal(ui('hint').hidden, true);
    assert.equal(ui('launcher').hidden, false, 'Minimized round always has a visible FAB');
    assert.equal(fixture.host.getAttribute('data-swarm-collapsed'), '', 'Collapsed marker enables a control-sized host');
  };
  const expanded = () => {
    assert.equal(ui('panel').hidden, false); assert.equal(ui('launcher').hidden, true);
    assert.equal(fixture.host.getAttribute('data-swarm-collapsed'), null);
  };
  assert.equal(ui('minimize').hidden, true, 'Idle intro has no minimize control');
  widget.minimize(); expanded(); assert.equal(calls.start, 0);
  widget.start(); assert.equal(ui('minimize').hidden, false);
  const initial = widget.getSnapshot(), initialCalls = { ...calls };
  ui('minimize').focus(); ui('minimize').fire('click'); folded();
  assert.equal(fixture.doc.focusedId, 'launcher', 'Keyboard focus moves off the hidden minus');
  assert.deepEqual(widget.getSnapshot(), initial); assert.deepEqual(calls, initialCalls, 'Minimize never invokes an engine control');
  engine.emit({ score: 240, elapsed: 8.2, kills: 4, alive: 8, nextWaveIn: 9.8 }); folded();
  assert.equal(callbacks.at(-1).score, 240, 'Live state callbacks continue while folded');
  assert.equal(ui('score').textContent, '000240');
  engine.emit({ status: 'intermission', elapsed: 12, score: 590, kills: 12, alive: 0, nextWaveIn: 2.4 }); folded();
  const intermission = widget.getSnapshot(), callsBeforeOpen = { ...calls };
  ui('launcher').fire('click'); expanded();
  assert.deepEqual(widget.getSnapshot(), intermission); assert.deepEqual(calls, callsBeforeOpen, 'Manual reopen does not start or resume');
  assert.equal(fixture.doc.focusedId, 'minimize', 'Manual reopen restores focus to a visible header control');
  widget.minimize(); folded(); widget.pause(); folded();
  assert.equal(state.status, 'paused'); assert.match(ui('minimize').title, /stays paused/);
  const paused = widget.getSnapshot(), resumeCalls = calls.resume;
  widget.open(); expanded(); assert.deepEqual(widget.getSnapshot(), paused); assert.equal(calls.resume, resumeCalls);
  widget.minimize(); folded(); widget.resume(); folded(); assert.equal(state.status, 'running');
  engine.emit({ wave: 2, elapsed: 20, score: 700, alive: 18, nextWaveIn: 17 });
  engine.event({ type: 'wave-start', wave: 2, count: 18, reason: 'timer' });
  folded(); assert.equal(ui('banner').hidden, true, 'Minimized presentation keeps wave banners folded too');
  const callsBeforeGameover = { ...calls };
  engine.emit({ status: 'gameover', score: 870, best: 870, wave: 3, kills: 19, alive: 0, integrity: 0 });
  expanded(); assert.equal(ui('result').hidden, false); assert.equal(ui('total').textContent, '870');
  assert.equal(ui('minimize').hidden, true); assert.equal(fixture.doc.focusedId, 'restart', 'Focused collapsed FAB moves to visible results');
  assert.deepEqual(calls, callsBeforeGameover, 'Auto-results never invokes an engine control');
  widget.minimize(); expanded();
  widget.stop(); assert.equal(state.status, 'idle'); assert.equal(ui('panel').hidden, true);
  assert.equal(ui('launcher').hidden, showLauncher === false, 'Stop clears minimize and follows the normal launcher option');
  engine.emit({ status: 'gameover', score: 999 });
  assert.equal(ui('panel').hidden, true, 'Late gameover cannot reopen a stopped game');
  widget.start(); widget.minimize(); folded(); widget.start(); expanded();
  assert.equal(state.status, 'running', 'Restart clears the presentation flag');
  widget.minimize();
  const escape = { key: 'Escape', repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  fixture.doc.fire('keydown', escape, true);
  assert.equal(state.status, 'idle'); assert.equal(ui('panel').hidden, true); assert.equal(ui('launcher').hidden, true);
  assert.equal(fixture.host.getAttribute('data-swarm-collapsed'), null); assert.equal(escape.defaultPrevented, false);
  engine.emit({ status: 'gameover', score: 1000 }); assert.equal(ui('panel').hidden, true, 'Escape cannot be undone by a late result');
  widget.start(); widget.minimize(); folded(); widget.destroy();
  assert.equal(fixture.host.getAttribute('data-swarm-collapsed'), null); assert.equal(fixture.host.getAttribute('data-swarm-round'), null);
  assert.equal(fixture.host.shadowRoot.elements.size, 0); assert.equal(fixture.listeners.size, 0);
  const afterDestroy = { ...fixture.counts };
  engine.emit({ status: 'gameover' }); widget.minimize();
  assert.deepEqual(fixture.counts, afterDestroy, 'Destroyed widget cannot reopen or mutate its DOM');
  delete globalThis.__swarmHudEngineFactory;
  return { showLauncher, keepsEngineState: true, liveCallbacks: true, intermission: true,
    pausedStatePreserved: true, reopenWithoutRestart: true, automaticResults: true,
    noLateReopen: true, focusTransferred: true, collapsedHostMarker: true, cleanup: true };
}

// Compare historical HUD behavior and cache efficiency, normalizing the
// intentionally updated neon palette and excluding the newer minus control.
const historicalCheckpoints = checkpoints => JSON.parse(JSON.stringify(checkpoints).replaceAll('rgb(101, 255, 0)', 'rgb(116, 223, 161)').replaceAll('rgb(0, 229, 255)', 'rgb(6, 196, 255)').replaceAll('rgb(255, 52, 59)', 'rgb(255, 107, 107)').replaceAll('rgb(255, 234, 0)', 'rgb(255, 185, 107)')).map(checkpoint => ({ ...checkpoint,
  state: { ...checkpoint.state, ui: Object.fromEntries(Object.entries(checkpoint.state.ui).filter(([id]) => id !== 'minimize')) }
}));

const before = await run(resolve(args.baseline), 'before');
const after = await run(resolve(args.widget), 'after');
assert.deepEqual(historicalCheckpoints(after.checkpoints), before.checkpoints, 'all pre-existing HUD nodes must match historical render');
assert.deepEqual(after.callbacks, before.callbacks, 'public snapshot callbacks must be unchanged');
const hiddenBefore = await run(resolve(args.baseline), 'hidden-before', { showLauncher: false, initiallyClosed: false });
const hiddenAfter = await run(resolve(args.widget), 'hidden-after', { showLauncher: false, initiallyClosed: false });
assert.deepEqual(historicalCheckpoints(hiddenAfter.checkpoints), hiddenBefore.checkpoints, 'hidden-launcher pre-existing HUD nodes must match');
assert.deepEqual(hiddenAfter.callbacks, hiddenBefore.callbacks);
const escapeExit = await verifyEscapeExit(resolve(args.widget));
const failedMount = await verifyMountFailure(resolve(args.widget));
const minimize = [await verifyMinimize(resolve(args.widget), true), await verifyMinimize(resolve(args.widget), false)];
const changedKeys = ['lookups', 'text', 'hidden', 'style'];
const total = result => Object.fromEntries(changedKeys.map(key => [key,
  Object.values(result.repeated).reduce((sum, block) => sum + block[key], 0)]));
const report = {
  methodology: 'Stub engine, minimal shadow DOM, CSSOM color normalization; 500 identical snapshots across running/frenzy/paused/intermission/gameover. No browser frame-rate claim.',
  checkpoints: after.checkpoints.length, snapshotCallbacks: after.callbacks.length,
  traceHash: createHash('sha256').update(JSON.stringify(historicalCheckpoints(after.checkpoints))).digest('hex'),
  historicalParityScope: 'All pre-existing HUD nodes and callbacks; new minus button excluded and verified by separate minimize lifecycle tests.',
  parity: true, normalAndHiddenLauncher: true, lifecycleCleanup: true, escapeExit, failedMount, minimize,
  repeatedSnapshots: { before: total(before), after: total(after) },
  repeatedByPhase: { before: before.repeated, after: after.repeated },
  totalOperations: { before: before.totals, after: after.totals }
};
assert(total(after).text < total(before).text && total(after).hidden < total(before).hidden);
assert(total(after).style < total(before).style && total(after).lookups < total(before).lookups);
if (args.report) await writeFile(resolve(args.report), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
