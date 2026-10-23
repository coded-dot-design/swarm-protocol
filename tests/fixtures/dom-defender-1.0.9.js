import { createAttackIndicators, getAttackEdges } from '../../src/attack-indicators.js';
import { feedbackColors } from './feedback-colors-1.0.9.js';

/**
 * DOM Defender — a dependency-free, opt-in overlay.
 * All page mutations are recorded and reversed by stop(), restart or destroy().
 * A React island can own this controller without owning the page beneath it.
 */
export function createDomDefender(options = {}) {
  const doc = options.document || document;
  const win = doc.defaultView || window;
  const selectors = {
    target: options.targetSelector || '[data-swarm-target]',
    text: options.textSelector || '[data-swarm-text]',
    surface: options.surfaceSelector || '[data-swarm-surface]',
    ui: '[data-swarm-ui]',
  };
  const MAX_BUGS = 48;
  const MAX_PARTICLES = 120;
  const MAX_AIM_EFFECTS = 8;
  const WAVE_SECONDS = 18;
  const CHEW_SECONDS = .24;
  const LETTERS_PER_TIER = 6;
  const MAX_FOOD_CANDIDATES = 240;
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const bestKey = options.bestKey || 'swarm-protocol-best-v1';
  const tierColors = ['#ff6b6b', '#d984ff', '#8573ee'];
  const stripePalette = ['#06c4ff', '#4428e8', '#8573ee', '#74dfa1'];
  const protectedPointerSelector = '[data-swarm-ui],[data-swarm-ignore],dialog,[role="dialog"],[aria-modal="true"],form,input,textarea,select,option,[contenteditable]';
  const cursorSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke-linecap="round"><circle cx="16" cy="16" r="8" stroke="#101010" stroke-width="4"/><path d="M16 3v3m0 20v3M3 16h3m20 0h3" stroke="#101010" stroke-width="4"/><circle cx="16" cy="16" r="8" stroke="#06c4ff" stroke-width="1.5"/><path d="M16 3v3m0 20v3M3 16h3m20 0h3" stroke="#ecfcff" stroke-width="1.5"/></g><circle cx="16" cy="16" r="2" fill="#fff" stroke="#101010" stroke-width="1.5"/></svg>';
  const reticleCursor = `url("data:image/svg+xml,${encodeURIComponent(cursorSVG)}") 16 16, crosshair`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const active = () => state.status === 'running' || state.status === 'intermission';
  const reducedMotion = options.reducedMotion ?? (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  const coarseQuery = win.matchMedia?.('(pointer: coarse)');
  const darkQuery = win.matchMedia?.('(prefers-color-scheme: dark)');
  const coarsePointer = () => width <= 640 || coarseQuery?.matches;
  let best = 0;
  try { best = Math.max(0, Number(win.localStorage.getItem(bestKey)) || 0); } catch {}
  const state = { status: 'idle', score: 0, best, wave: 0, kills: 0, combo: 1, elapsed: 0 };
  let canvas = null, canvasHost = null, ctx = null, raf = 0, lastNow = 0, lastState = 0;
  let width = win.innerWidth, height = win.innerHeight, ratio = 1;
  let bugs = [], particles = [], targets = [], textAreas = [], surfaces = [], uiRects = [];
  let remaining = 0, spawnIn = 0, nextWaveIn = 0, comboTime = -Infinity;
  let pausedFrom = 'running', pausedForVisibility = false, destroyed = false;
  let geometryDirty = true, geometryAt = 0, roundId = 0, suppressedClick = null;
  let gameoverTimeout = 0;
  let foodQueue = [], foodCandidates = [], foodCursor = 0, foodScanIn = 0, foodRevision = 0, foodBudget = 0;
  let glyphRange = null;
  let cursorRecord = null, lastPointer = null, aimEffects = [];
  const styleLedger = new Map();
  const originalStyleAttributes = new Map();
  const textLedger = new Map();
  const attributeLedger = new Map();
  const listeners = [];
  const attackIndicators = createAttackIndicators(doc, reducedMotion);

  function on(target, name, callback, settings) {
    target.addEventListener(name, callback, settings);
    listeners.push(() => target.removeEventListener(name, callback, settings));
  }
  function emit(type, data = {}) {
    options.onEvent?.({ type, ...data });
  }
  function getSnapshot() {
    const enrolled = targets.filter(t => t.enrolled && t.rendered && t.element.isConnected);
    const health = enrolled.length ? enrolled.reduce((sum, t) => sum + t.health, 0) / enrolled.length : 100;
    return {
      ...state,
      alive: bugs.length,
      offscreenBugs: bugs.filter(b => b.x < 0 || b.y < 0 || b.x > width || b.y > height).length,
      frenzy: state.status !== 'idle' && state.status !== 'gameover' && !targets.some(t => t.rendered && t.visible && t.health > 0),
      remaining,
      integrity: Math.round(health),
      nextWaveIn: Math.max(0, nextWaveIn),
      targets: enrolled.map(t => ({ id: t.id, label: t.label, health: Math.round(t.health), visible: t.visible })),
    };
  }
  function notify(force = false) {
    const now = win.performance.now();
    if (force || now - lastState >= 100) {
      lastState = now;
      options.onState?.(getSnapshot());
    }
  }
  function status(value) {
    state.status = value;
    if (value !== 'running') attackIndicators.update(0);
    if (value === 'running') syncCursor();
    else restoreCursor();
    if (!active()) {
      aimEffects = [];
      if (value === 'paused') draw();
    }
    emit('status', { status: value });
    notify(true);
  }
  function setStyle(element, property, value) {
    if (!styleLedger.has(element)) {
      styleLedger.set(element, new Map());
      originalStyleAttributes.set(element, cursorRecord?.element === element ? cursorRecord.hadStyle : element.hasAttribute('style'));
    }
    const properties = styleLedger.get(element);
    if (!properties.has(property)) properties.set(property, {
      original: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
      latest: null, latestPriority: null, abandoned: false,
    });
    const record = properties.get(property);
    const current = element.style.getPropertyValue(property), priority = element.style.getPropertyPriority(property);
    // Once the host edits this property, its newer value owns the rest of the
    // round. Do not overwrite it on a later footprint or restore the old value.
    if (record.abandoned || (record.latest !== null && (current !== record.latest || priority !== record.latestPriority))) { record.abandoned = true; return; }
    if (record.requested === value && current === record.latest && priority === record.latestPriority) return;
    element.style.setProperty(property, value);
    record.latest = element.style.getPropertyValue(property);
    record.latestPriority = element.style.getPropertyPriority(property);
    record.requested = value;
  }
  function setAttribute(element, name, value) {
    if (!attributeLedger.has(element)) attributeLedger.set(element, new Map());
    const attributes = attributeLedger.get(element);
    if (!attributes.has(name)) attributes.set(name, { original: element.getAttribute(name), latest: null });
    if (attributes.get(name).latest === value && element.getAttribute(name) === value) return;
    element.setAttribute(name, value);
    attributes.get(name).latest = value;
  }
  function restorePage() {
    restoreCursor();
    aimEffects = [];
    glyphRange?.detach?.();
    glyphRange = null;
    for (const [node, record] of textLedger) {
      // Preserve a newer value supplied by React, a CMS, or another script.
      if (!record.abandoned && node.nodeValue === record.latest) node.nodeValue = record.original;
    }
    for (const [element, properties] of styleLedger) {
      for (const [name, record] of properties) {
        if (record.abandoned || element.style.getPropertyValue(name) !== record.latest || element.style.getPropertyPriority(name) !== record.latestPriority) continue;
        if (record.original) element.style.setProperty(name, record.original, record.priority);
        else element.style.removeProperty(name);
      }
      if (!originalStyleAttributes.get(element) && !element.getAttribute('style')) element.removeAttribute('style');
    }
    for (const [element, attributes] of attributeLedger) {
      for (const [name, record] of attributes) {
        if (element.getAttribute(name) !== record.latest) continue;
        if (record.original === null) element.removeAttribute(name);
        else element.setAttribute(name, record.original);
      }
    }
    styleLedger.clear();
    originalStyleAttributes.clear();
    textLedger.clear();
    foodQueue = []; foodCandidates = [];
    attributeLedger.clear();
  }
  function rectVisible(r) {
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < width && r.top < height;
  }
  function contains(r, x, y, margin = 0) {
    return x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
  }
  function forbiddenText(node) {
    return node.parentElement?.closest('a,button,input,textarea,select,script,style,noscript,pre,code,[contenteditable],[data-swarm-ui],[data-swarm-ignore],[data-swarm-target],[aria-live]');
  }
  function discoverPage() {
    targets = [...doc.querySelectorAll(selectors.target)].filter(element => !element.closest('[data-swarm-ignore]')).map((element, index) => ({
      element,
      id: element.id || `swarm-target-${index + 1}`,
      label: element.getAttribute('data-swarm-label') || element.getAttribute('aria-label') || element.textContent.trim().slice(0, 48) || `Target ${index + 1}`,
      health: 100, worstHealth: 100, rect: null, visible: false, rendered: false, enrolled: false, bites: 0,
      stripes: new Map(), stripeSerial: 0, stripeWidth: 0, originalBackground: null,
      paintDirty: false, lastPaint: -Infinity,
    }));
    const seenNodes = new Set();
    textAreas = [...doc.querySelectorAll(selectors.text)].filter(el => !el.closest(selectors.ui)).map(element => {
      const nodes = [];
      const walker = doc.createTreeWalker(element, 4);
      let node;
      while ((node = walker.nextNode())) {
        if (/\p{L}/u.test(node.nodeValue || '') && !seenNodes.has(node) && !forbiddenText(node)) {
          nodes.push(node);
          seenNodes.add(node);
        }
      }
      const area = { element, nodes, rect: null, visible: false, revision: 0, records: [] };
      for (const node of nodes) {
        const original = node.nodeValue || '';
        const chars = segmenter ? [...segmenter.segment(original)].map(part => part.segment) : Array.from(original);
        const record = { node, original, latest: original, chars, offsets: [], glyphs: [], owner: area, abandoned: false };
        updateTextOffsets(record);
        let slot = 0;
        record.glyphs = chars.flatMap((letter, index) => /\p{L}/u.test(letter) ? [{ record, index, slot: slot++, letter, eaten: false, reservedBy: 0, rect: null, revision: -1, areaRevision: -1, measuredAt: -Infinity }] : []);
        textLedger.set(node, record);
        area.records.push(record);
      }
      return area;
    });
    // Interleave small runs from each node so the first page block cannot take
    // the entire bounded glyph cache. Reservations are kept on the glyphs.
    const records = textAreas.flatMap(area => area.records);
    foodQueue = [];
    for (let offset = 0; records.some(record => offset < record.glyphs.length); offset += 8) {
      for (const record of records) foodQueue.push(...record.glyphs.slice(offset, offset + 8));
    }
    foodCandidates = []; foodCursor = 0; foodScanIn = 0; foodRevision++;
    surfaces = [...doc.querySelectorAll(selectors.surface)].filter(el => !el.closest(`${selectors.ui},[data-swarm-ignore]`)).slice(0, 16)
      .map(element => ({ element, rect: null, visible: false, damage: 0 }));
    geometryDirty = true;
    refreshGeometry(true);
  }
  function refreshGeometry(force = false) {
    const now = win.performance.now();
    // A low-rate refresh also catches layout shifts and a changing widget size.
    if (!force && now - geometryAt < (geometryDirty ? 80 : 600)) return;
    geometryDirty = false;
    geometryAt = now;
    const newWidth = win.innerWidth, newHeight = win.innerHeight;
    if (newWidth !== width || newHeight !== height || force) {
      width = newWidth;
      height = newHeight;
      ratio = Math.min(win.devicePixelRatio || 1, 1.75);
      if (canvas) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    }
    for (const item of [...targets, ...textAreas, ...surfaces]) {
      const previousRect = item.rect;
      item.visible = item.element.isConnected && !item.element.hidden;
      item.rect = item.element.getBoundingClientRect();
      if ('records' in item && previousRect && ['left', 'top', 'width', 'height'].some(key => previousRect[key] !== item.rect[key])) item.revision++;
      if ('enrolled' in item) {
        const style = win.getComputedStyle?.(item.element);
        const display = style?.getPropertyValue('display');
        const visibility = style?.getPropertyValue('visibility');
        item.rendered = item.visible && item.rect.width > 0 && item.rect.height > 0 && display !== 'none' && visibility !== 'hidden' && visibility !== 'collapse';
        item.visible = item.rendered && rectVisible(item.rect);
        if (item.rendered) item.enrolled = true;
      } else {
        const style = win.getComputedStyle?.(item.element);
        item.visible = item.visible && rectVisible(item.rect) && style?.getPropertyValue('display') !== 'none' && style?.getPropertyValue('visibility') !== 'hidden' && style?.getPropertyValue('visibility') !== 'collapse';
      }
      if ('stripes' in item && item.stripeWidth && item.rect.width > 0) syncStripeWidth(item);
    }
    uiRects = [...doc.querySelectorAll(selectors.ui)]
      .filter(el => !el.hidden).map(el => el.getBoundingClientRect()).filter(rectVisible);
    syncCursor();
  }
  function ensureCanvas() {
    if (canvas) return;
    // A separate shadow tree keeps page-wide canvas rules out of the game.
    // This noninteractive overlay must not be enrolled as a full-screen UI zone.
    canvasHost = doc.createElement('div');
    canvasHost.setAttribute('data-swarm-overlay', '');
    canvasHost.setAttribute('aria-hidden', 'true');
    const shadow = canvasHost.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = ':host{all:initial!important;position:fixed!important;inset:0!important;display:block!important;pointer-events:none!important;z-index:2147483000!important;contain:strict!important;direction:ltr!important;unicode-bidi:isolate!important}canvas{all:initial;position:absolute;inset:0;display:block;pointer-events:none;background:transparent;contain:strict}';
    canvas = doc.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-dom-defender-canvas', '');
    shadow.append(style, canvas);
    doc.body.appendChild(canvasHost);
    ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      canvasHost.remove(); canvasHost = null; canvas = null;
      throw new Error('DOM Defender requires a 2D canvas context.');
    }
  }
  function chooseTarget(bug) {
    if (!targets.length) return null;
    const available = targets.filter(t => t.rendered && t.element.isConnected && t.health > 0);
    if (!available.length) return null;
    const visible = available.filter(t => t.visible);
    const choices = visible.length ? visible : available;
    if (!choices.length) return null;
    // Distance attracts the swarm; a little randomness prevents one identical queue.
    choices.sort((a, b) => {
      const cost = t => Math.hypot((t.rect.left + t.rect.right) / 2 - bug.x, (t.rect.top + t.rect.bottom) / 2 - bug.y) + t.health * .35;
      return cost(a) - cost(b);
    });
    return Math.random() < .65 ? choices[0] : choices[Math.floor(Math.random() * choices.length)];
  }
  function spawn() {
    if (bugs.length >= MAX_BUGS) return;
    let x = 0, y = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const edge = Math.floor(Math.random() * 4);
      x = edge === 0 ? -18 : edge === 1 ? width + 18 : rand(24, width - 24);
      y = edge === 2 ? -18 : edge === 3 ? height + 18 : rand(32, height - 32);
      if (!uiRects.some(r => contains(r, clamp(x, 0, width), clamp(y, 0, height), 24))) break;
    }
    const bug = {
      id: ++roundId, x, y, angle: 0, phase: rand(0, Math.PI * 2),
      color: tierColors[0], size: rand(1.05, 1.18), tier: 1, hp: 1, feeds: 0, lettersEaten: 0, hitFlash: 0,
      speed: (rand(110, 155) + Math.min(80, state.wave * 8)) * (coarsePointer() ? .72 : 1),
      age: 0, biteIn: rand(.2, .8), target: null,
      food: null, lastFood: null, foodSearchIn: 0, foodCheckIn: 0, foodWaitUntil: state.elapsed + .45, chewing: false, chewLeft: 0,
      stripeIn: 0, scatterUntil: 0, scatterX: 0, scatterY: 0,
      pursuit: null, pursuitUntil: 0, dashIn: 0, dashX: 0, dashY: 0,
      orbit: rand(0, Math.PI * 2), attached: false,
    };
    bug.target = chooseTarget(bug);
    bugs.push(bug);
  }
  function startWave(reason = 'start') {
    state.wave++;
    const arrivals = Math.max(0, Math.min(MAX_BUGS - bugs.length - remaining, 12 + (state.wave - 1) * 6));
    remaining += arrivals;
    spawnIn = .1;
    nextWaveIn = WAVE_SECONDS;
    status('running');
    emit('wave-start', { wave: state.wave, count: arrivals, reason });
  }
  function updateBest() {
    if (state.score <= state.best) return;
    state.best = state.score;
    try { win.localStorage.setItem(bestKey, String(state.best)); } catch {}
  }
  function stripeColor(hex, strength) {
    const value = parseInt(hex.slice(1), 16);
    return `rgb(${Math.round((value >> 16) * strength)},${Math.round(((value >> 8) & 255) * strength)},${Math.round((value & 255) * strength)})`;
  }
  function cssLayers(value) {
    const layers = [];
    let depth = 0, start = 0, quote = '';
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (quote) { if (c === quote && value[i - 1] !== '\\') quote = ''; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && !depth) { layers.push(value.slice(start, i).trim()); start = i + 1; }
    }
    layers.push(value.slice(start).trim());
    return layers;
  }
  function rememberBackground(target) {
    if (target.originalBackground) return;
    const style = win.getComputedStyle?.(target.element) || target.element.style;
    const read = (name, fallback) => style.getPropertyValue(name) || fallback;
    const images = cssLayers(read('background-image', 'none'));
    const expand = (name, fallback) => {
      const values = cssLayers(read(name, fallback));
      return images.map((_, i) => values[i % values.length]);
    };
    target.originalBackground = {
      images: images[0] === 'none' ? [] : images,
      sizes: expand('background-size', 'auto'),
      positions: expand('background-position', '0% 0%'),
      repeats: expand('background-repeat', 'repeat'),
      origins: expand('background-origin', 'padding-box'),
      clips: expand('background-clip', 'border-box'),
      color: read('color', '#151515'),
    };
  }
  function syncStripeWidth(target) {
    const width = Math.max(1, Math.ceil(target.rect.width));
    if (width === target.stripeWidth) return width;
    const previous = target.stripeWidth, old = target.stripes;
    target.stripeWidth = width;
    if (previous && old.size) {
      target.stripes = new Map();
      for (let x = 0; x < width; x++) {
        const stripe = old.get(Math.min(previous - 1, Math.floor(x * previous / width)));
        if (stripe) target.stripes.set(x, stripe);
      }
      target.paintDirty = true;
    }
    return width;
  }
  function markColumns(target, origin, count, erase = false) {
    // Prefer untouched pixels close to the crawler, then fill the remaining gaps.
    // During the second stage, opaque black consumes color without exposing white.
    if (count <= 0) return;
    const candidates = [];
    const eligible = x => erase ? target.stripes.has(x) && !target.stripes.get(x).black : !target.stripes.has(x);
    // Distance ties keep the lower column first, matching the original stable
    // sort, but only the needed nearest columns are visited and retained.
    for (let distance = 0; distance < target.stripeWidth && candidates.length < count; distance++) {
      const left = origin - distance, right = origin + distance;
      if (left >= 0 && eligible(left)) candidates.push(left);
      if (distance && right < target.stripeWidth && candidates.length < count && eligible(right)) candidates.push(right);
    }
    let left = Math.min(count, candidates.length), cursor = 0;
    while (left > 0) {
      const step = ++target.stripeSerial;
      const top = step % stripePalette.length;
      const stripe = {
        id: step, black: erase, top,
        bottom: (top + 1 + Math.floor(Math.random() * (stripePalette.length - 1))) % stripePalette.length,
        strength: rand(.55, 1),
      };
      const stroke = Math.min(left, 1 + Math.floor(Math.random() * 3));
      for (let i = 0; i < stroke; i++) target.stripes.set(candidates[cursor++], stripe);
      left -= stroke;
    }
  }
  function leaveStripe(target, bug) {
    rememberBackground(target);
    const limit = syncStripeWidth(target);
    const x = clamp(Math.round(bug.x - target.rect.left + rand(-4, 4)), 0, limit - 1);
    // The first 55 integrity points consume the original fill. Footsteps repaint
    // existing colored pixels between bites, keeping the untouched white intact.
    const coverage = Math.min(limit, Math.max(2, Math.ceil(limit * (100 - target.worstHealth) / 55)));
    markColumns(target, x, Math.max(0, coverage - target.stripes.size));
    // A short fully colored stage (45–40% integrity) makes the handoff visible.
    // Black appears only after all original fill has been covered with color.
    if (target.worstHealth < 40 && target.stripes.size === limit) {
      const colored = [...target.stripes.values()].filter(stripe => !stripe.black).length;
      const remainingColor = Math.floor(limit * Math.max(0, target.worstHealth) / 40);
      markColumns(target, x, Math.max(0, colored - remainingColor), true);
    } else {
      // A step may change one existing color, but never refill an eaten slot.
      const previous = target.stripes.get(x);
      if (previous && !previous.black) {
        const step = ++target.stripeSerial, top = step % stripePalette.length;
        target.stripes.set(x, { id: step, black: false, top, bottom: (top + 1) % stripePalette.length, strength: rand(.55, 1) });
      }
    }
    target.paintDirty = true;
  }
  function paintTarget(target) {
    const el = target.element;
    target.paintDirty = false;
    target.lastPaint = state.elapsed;
    setAttribute(el, 'data-swarm-infected', target.health <= 0 ? 'breached' : 'active');
    if (target.health <= 0) {
      setStyle(el, 'background-image', 'none');
      setStyle(el, 'background-color', '#050609');
      setStyle(el, 'color', '#a0a6b2');
      setStyle(el, 'box-shadow', 'inset 0 0 0 1px #353944, 0 0 18px #00000030');
      return;
    }
    if (!target.originalBackground) return;
    const base = target.originalBackground;
    const columns = [...target.stripes.entries()].sort((a, b) => a[0] - b[0]);
    const runs = [];
    for (const [x, stripe] of columns) {
      const last = runs[runs.length - 1];
      if (last && last.stripe.id === stripe.id && last.x + last.width === x && last.width < 3) last.width++;
      else runs.push({ x, width: 1, stripe });
    }
    // Keep the real button background underneath every untouched pixel. Both
    // colored footprints and empty slots are narrow, opaque layers above it.
    const appendBase = (values, originals) => values.concat(base.images.length ? originals : []).join(',');
    const images = runs.map(({stripe}) => stripe.black ? 'linear-gradient(180deg,#050609,#050609)' : `linear-gradient(180deg,${stripeColor(stripePalette[stripe.top], stripe.strength)},${stripeColor(stripePalette[stripe.bottom], stripe.strength)})`);
    setStyle(el, 'background-image', images.concat(base.images).join(',') || 'none');
    setStyle(el, 'background-size', appendBase(runs.map(run => `${run.width}px 100%`), base.sizes) || 'auto');
    setStyle(el, 'background-position', appendBase(runs.map(run => `${run.x}px 0px`), base.positions) || '0px 0px');
    setStyle(el, 'background-repeat', appendBase(runs.map(() => 'no-repeat'), base.repeats) || 'no-repeat');
    setStyle(el, 'background-origin', appendBase(runs.map(() => 'border-box'), base.origins) || 'border-box');
    setStyle(el, 'background-clip', appendBase(runs.map(() => 'border-box'), base.clips) || 'border-box');
    const dark = target.stripes.size / target.stripeWidth > .55;
    setStyle(el, 'color', dark ? '#f7f9fb' : base.color);
    if (dark) setStyle(el, 'text-shadow', '0 1px 2px #050609, 0 0 1px #050609');
  }
  function damageTarget(target, bug) {
    target.bites++;
    target.health = Math.max(0, target.health - (1.15 + Math.min(state.wave - 1, 9) * .12));
    target.worstHealth = Math.min(target.worstHealth, target.health);
    leaveStripe(target, bug);
    if (target.health <= 0) paintTarget(target);
    if (!reducedMotion && particles.length < MAX_PARTICLES - 2) {
      particles.push({ x: bug.x, y: bug.y, vx: rand(-12, 12), vy: -rand(10, 24), life: .5, total: .5, color: bug.color, text: Math.random() > .5 ? '1' : '0' });
    }
    emit('damage', { targetId: target.id, health: target.health });
    const playable = targets.filter(t => t.enrolled && t.rendered && t.element.isConnected);
    if (playable.length && playable.every(t => t.health <= 0)) {
      updateBest();
      status('gameover');
      emit('gameover', getSnapshot());
      if (state.status === 'gameover') gameoverTimeout = win.setTimeout(() => {
        gameoverTimeout = 0;
        if (state.status !== 'gameover' || destroyed) return;
        restorePage();
        bugs = []; particles = [];
        if (ctx) ctx.clearRect(0, 0, width, height);
        if (canvas) canvas.style.display = 'none';
        emit('restored');
        notify(true);
      }, 900);
    }
  }
  function updateTextOffsets(record) {
    let offset = 0;
    record.offsets = record.chars.map(char => { const start = offset; offset += char.length; return start; });
  }
  function currentText(record) {
    if (record.abandoned || !record.node.isConnected || forbiddenText(record.node)) return false;
    // A newer React/CMS value always wins, including during a pending chew.
    if (record.node.nodeValue !== record.latest) { record.abandoned = true; return false; }
    return true;
  }
  function edibleGlyph(glyph) {
    return glyph && !glyph.eaten && glyph.record.owner.visible && currentText(glyph.record);
  }
  function releaseFood(bug) {
    if (bug.food?.reservedBy === bug.id) bug.food.reservedBy = 0;
    bug.food = null;
    bug.chewing = false;
    bug.chewLeft = 0;
  }
  function invalidateFoodGeometry() {
    geometryDirty = true;
    foodRevision++;
    foodScanIn = 0;
    foodCandidates = [];
    for (const bug of bugs) {
      releaseFood(bug);
      bug.foodSearchIn = 0;
      bug.foodWaitUntil = state.elapsed + .25;
    }
  }
  function measureGlyph(glyph, force = false) {
    const unavailable = () => { glyph.rect = null; glyph.revision = -1; return null; };
    if (!edibleGlyph(glyph)) return unavailable();
    const record = glyph.record, area = record.owner;
    if (!force && glyph.revision === foodRevision && glyph.areaRevision === area.revision && state.elapsed - glyph.measuredAt < .8) return glyph.rect;
    // Discovery plus live contact validation have a shared per-frame ceiling.
    // A deferred measurement never counts as a bite or discards a reservation.
    if (foodBudget <= 0) return undefined;
    foodBudget--;
    const parent = record.node.parentElement;
    const style = win.getComputedStyle?.(parent);
    if (parent?.hidden || style?.getPropertyValue('display') === 'none' || style?.getPropertyValue('visibility') === 'hidden' || style?.getPropertyValue('visibility') === 'collapse') return unavailable();
    if (!doc.createRange) return unavailable();
    let r;
    try {
      const range = glyphRange || (glyphRange = doc.createRange());
      const start = record.offsets[glyph.index];
      range.setStart(record.node, start);
      range.setEnd(record.node, start + record.chars[glyph.index].length);
      r = range.getBoundingClientRect();
    } catch { glyphRange = null; return unavailable(); }
    const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
    if (!rectVisible(r) || x < 1 || x > width - 1 || y < 1 || y > height - 1 || uiRects.some(ui => contains(ui, x, y, 4))) return unavailable();
    if (doc.elementFromPoint) {
      const hit = doc.elementFromPoint(x, y);
      const isOwnText = hit && (hit === parent || parent?.contains?.(hit) || (hit !== doc.body && area.element.contains?.(hit) && hit.contains?.(parent)));
      if (!isOwnText) return unavailable();
    }
    glyph.rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, x, y };
    glyph.revision = foodRevision;
    glyph.areaRevision = area.revision;
    glyph.measuredAt = state.elapsed;
    return glyph.rect;
  }
  function scanFood(dt) {
    foodBudget = 36;
    foodScanIn -= dt;
    if (foodScanIn > 0 || !foodQueue.length || !bugs.some(bug => bug.tier < 3)) return;
    foodScanIn = .10;
    foodCandidates = foodCandidates.filter(glyph => edibleGlyph(glyph));
    let measured = 0, checked = 0;
    while (checked++ < Math.min(foodQueue.length, 96) && measured < 12) {
      const glyph = foodQueue[foodCursor++ % foodQueue.length];
      if (!edibleGlyph(glyph) || glyph.reservedBy) continue;
      measured++;
      const r = measureGlyph(glyph, true);
      if (!r) continue;
      if (!foodCandidates.includes(glyph)) foodCandidates.push(glyph);
    }
    if (foodCandidates.length > MAX_FOOD_CANDIDATES) foodCandidates.splice(0, foodCandidates.length - MAX_FOOD_CANDIDATES);
  }
  function chooseFood(bug) {
    if (bug.tier >= 3) return null;
    // Continue along the same word/line before searching elsewhere. This makes
    // each changed letter readable as the result of the crawler touching it.
    if (bug.lastFood && currentText(bug.lastFood.record)) {
      const previous = bug.lastFood;
      const glyphs = previous.record.glyphs, nearby = [];
      // A letter within 12 graphemes must also be within 12 letter slots.
      for (let i = Math.max(0, previous.slot - 12), end = Math.min(glyphs.length, previous.slot + 13); i < end; i++) {
        const glyph = glyphs[i];
        if (Math.abs(glyph.index - previous.index) <= 12 && !glyph.reservedBy && edibleGlyph(glyph)) nearby.push(glyph);
      }
      nearby.sort((a, b) => Math.abs(a.index - previous.index) - Math.abs(b.index - previous.index));
      for (let i = 0; i < Math.min(4, nearby.length); i++) {
        const glyph = nearby[i];
        const r = measureGlyph(glyph);
        if (r && Math.hypot(r.x - bug.x, r.y - bug.y) < 105) return glyph;
      }
    }
    // Only five entries are ever inspected. Keep that same stable shortlist
    // without sorting the whole cache or recomputing distances in a comparator.
    const nearest = [], distances = [];
    for (const glyph of foodCandidates) {
      if (glyph.reservedBy || !edibleGlyph(glyph) || !glyph.rect) continue;
      const distance = Math.hypot(glyph.rect.x - bug.x, glyph.rect.y - bug.y);
      let index = nearest.length;
      while (index && distance < distances[index - 1]) index--;
      if (index >= 5) continue;
      for (let i = Math.min(nearest.length, 4); i > index; i--) {
        nearest[i] = nearest[i - 1];
        distances[i] = distances[i - 1];
      }
      nearest[index] = glyph;
      distances[index] = distance;
    }
    for (const glyph of nearest) if (measureGlyph(glyph)) return glyph;
    return null;
  }
  function nickSurface(bug) {
    const surface = surfaces.find(s => s.visible && contains(s.rect, bug.x, bug.y, 4));
    if (!surface || surface.damage >= 12) return;
    surface.damage++;
    const n = Math.min(16, surface.damage * 2);
    setStyle(surface.element, 'clip-path', `polygon(0 0, 100% 0, 100% 34%, calc(100% - ${n}px) 34%, calc(100% - ${n}px) 44%, 100% 44%, 100% 100%, 0 100%, 0 76%, ${Math.round(n * .7)}px 76%, ${Math.round(n * .7)}px 65%, 0 65%)`);
    setStyle(surface.element, 'filter', `saturate(${1 - surface.damage * .025})`);
  }
  function eatGlyph(bug, glyph, r) {
    const record = glyph.record;
    const binary = Math.random() < .5 ? '0' : '1';
    record.chars[glyph.index] = binary;
    record.latest = record.chars.join('');
    record.node.nodeValue = record.latest;
    glyph.eaten = true;
    record.owner.revision++;
    updateTextOffsets(record);
    geometryDirty = true;
    bug.lastFood = glyph;
    releaseFood(bug);
    bug.foodSearchIn = 0;
    bug.foodWaitUntil = state.elapsed + .35;
    bug.lettersEaten++;
    bug.feeds = bug.lettersEaten;
    const tier = Math.min(3, 1 + Math.floor(bug.lettersEaten / LETTERS_PER_TIER));
    if (tier > bug.tier) {
      bug.hp += tier - bug.tier;
      bug.color = tierColors[tier - 1];
      bug.size += .18 * (tier - bug.tier);
      bug.tier = tier;
      emit('evolve', { id: bug.id, tier, hp: bug.hp, x: bug.x, y: bug.y });
    }
    nickSurface(bug);
    if (!reducedMotion && particles.length < MAX_PARTICLES) particles.push({ x: r.x, y: r.y, vx: (bug.x - r.x) / .25, vy: (bug.y - r.y) / .25, life: .25, total: .25, color: '#74dfa1', text: binary });
    emit('bite', { id: bug.id, x: r.x, y: r.y, letter: glyph.letter, binary, lettersEaten: bug.lettersEaten, tier: bug.tier, full: bug.tier === 3 });
  }
  function chewGlyph(bug, dt) {
    if (!bug.food || !bug.chewing) return false;
    const glyph = bug.food;
    if (!edibleGlyph(glyph) || glyph.reservedBy !== bug.id) { releaseFood(bug); return false; }
    const changed = glyph.revision !== foodRevision || glyph.areaRevision !== glyph.record.owner.revision;
    if (changed || bug.chewLeft <= dt) {
      const r = measureGlyph(glyph, true);
      if (r === undefined) return true;
      const mouth = 8 * bug.size;
      if (!r || Math.hypot(r.x - (bug.x + Math.cos(bug.angle) * mouth), r.y - (bug.y + Math.sin(bug.angle) * mouth)) > 5) {
        bug.chewing = false; bug.chewLeft = 0;
        if (!r) releaseFood(bug);
        return false;
      }
      bug.chewX = r.x; bug.chewY = r.y;
      if (bug.chewLeft <= dt) { eatGlyph(bug, glyph, r); return true; }
    }
    bug.chewLeft -= dt;
    return true;
  }
  function stepBug(bug, dt) {
    bug.age += dt;
    bug.hitFlash = Math.max(0, bug.hitFlash - dt);
    const visibleLive = targets.some(t => t.rendered && t.visible && t.health > 0);
    if (!bug.target?.rendered || !bug.target.element.isConnected || bug.target.health <= 0 || (visibleLive && !bug.target.visible)) {
      const previous = bug.target;
      bug.target = chooseTarget(bug);
      if (bug.target !== previous) {
        bug.attached = false;
        bug.pursuit = null;
        bug.x = clamp(bug.x, -30, width + 30);
        bug.y = clamp(bug.y, -30, height + 30);
      }
    }
    let tx, ty;
    const scattering = state.elapsed < bug.scatterUntil;
    const target = bug.target;
    if (!scattering && bug.tier < 3) {
      if (bug.food && (!edibleGlyph(bug.food) || bug.food.reservedBy !== bug.id)) releaseFood(bug);
      bug.foodCheckIn -= dt;
      if (bug.food && !bug.chewing && (bug.foodCheckIn <= 0 || bug.food.areaRevision !== bug.food.record.owner.revision || bug.food.revision !== foodRevision)) {
        const r = measureGlyph(bug.food, true);
        if (r === null) releaseFood(bug);
        bug.foodCheckIn = .16;
      }
      bug.foodSearchIn -= dt;
      if (!bug.food && bug.foodSearchIn <= 0) {
        const glyph = chooseFood(bug);
        if (glyph) { bug.food = glyph; glyph.reservedBy = bug.id; bug.foodCheckIn = .16; }
        bug.foodSearchIn = .14;
      }
      if (bug.food) {
        if (bug.pursuit) { bug.x = clamp(bug.x, -25, width + 25); bug.y = clamp(bug.y, -25, height + 25); }
        bug.pursuit = null;
        bug.attached = false;
        if (chewGlyph(bug, dt)) return;
      }
    }
    const foodPoint = bug.food?.rect;
    let pinnedOffscreen = false;
    const orbitPoint = () => {
      const r = target.rect;
      bug.orbit += dt * 1.45;
      return {
        x: (r.left + r.right) / 2 + Math.cos(bug.orbit) * Math.max(5, r.width / 2 - 12),
        y: (r.top + r.bottom) / 2 + Math.sin(bug.orbit) * Math.max(5, r.height / 2 - 8),
      };
    };
    const wildPoint = () => {
      bug.dashIn -= dt;
      if (bug.dashIn <= 0) {
        bug.dashX = rand(24, Math.max(25, width - 24));
        bug.dashY = rand(40, Math.max(41, height - 40));
        bug.dashIn = rand(.16, .32);
      }
      return { x: bug.dashX, y: bug.dashY };
    };
    if (visibleLive && bug.pursuit) {
      // An attacker stays on its actual button when scrolling brings it back.
      if (bug.pursuit === 'attack' && target?.visible) {
        const point = orbitPoint();
        bug.x = point.x; bug.y = point.y;
      } else {
        bug.x = clamp(bug.x, -30, width + 30);
        bug.y = clamp(bug.y, -30, height + 30);
      }
      bug.pursuit = null;
    }
    if (scattering) {
      tx = bug.scatterX;
      ty = bug.scatterY;
      bug.attached = false;
    } else if (foodPoint) {
      tx = foodPoint.x;
      ty = foodPoint.y;
      bug.attached = false;
    } else if (bug.tier < 3 && state.elapsed < bug.foodWaitUntil) {
      bug.attached = false;
      const point = wildPoint(); tx = point.x; ty = point.y;
    } else if (!visibleLive && target) {
      // Scrolling away does not suspend attacks. Visible crawlers dash around,
      // leave toward the real CTA, then finish the short journey off canvas.
      if (!bug.pursuit) {
        bug.pursuit = bug.attached ? 'attack' : 'dash';
        bug.pursuitUntil = state.elapsed + rand(.65, 1.10);
        bug.dashIn = 0;
      }
      if (bug.pursuit === 'dash' && state.elapsed >= bug.pursuitUntil) bug.pursuit = 'exit';
      if (bug.pursuit === 'exit' && (bug.x < -36 || bug.x > width + 36 || bug.y < -36 || bug.y > height + 36)) {
        bug.pursuit = 'transit';
        bug.pursuitUntil = state.elapsed + rand(.45, .80);
      }
      if (bug.pursuit === 'transit' && state.elapsed >= bug.pursuitUntil) bug.pursuit = 'attack';
      bug.attached = false;
      if (bug.pursuit === 'attack') {
        const point = orbitPoint();
        const dx = point.x - bug.x, dy = point.y - bug.y;
        if (Math.hypot(dx, dy) > .1) bug.angle = Math.atan2(dy, dx);
        bug.x = tx = point.x; bug.y = ty = point.y;
        bug.attached = true;
        pinnedOffscreen = true;
      } else if (bug.pursuit === 'dash') {
        const point = wildPoint(); tx = point.x; ty = point.y;
      } else {
        const r = target.rect;
        tx = clamp((r.left + r.right) / 2, 24, width - 24);
        ty = clamp((r.top + r.bottom) / 2, 24, height - 24);
        if (r.bottom <= 0) ty = -80;
        else if (r.top >= height) ty = height + 80;
        if (r.right <= 0) tx = -80;
        else if (r.left >= width) tx = width + 80;
      }
    } else if (!target) {
      // Pages with no eligible CTA keep the swarm visible and reachable.
      bug.pursuit = null;
      bug.attached = false;
      const point = wildPoint(); tx = point.x; ty = point.y;
    } else if (target) {
      const r = target.rect;
      const point = orbitPoint(); tx = point.x; ty = point.y;
      bug.attached = contains(r, bug.x, bug.y, 6);
    } else {
      tx = width * .5 + Math.cos(bug.phase + bug.age * .2) * width * .32;
      ty = height * .5 + Math.sin(bug.phase + bug.age * .2) * height * .3;
    }
    // Exiting crawlers may pass behind the HUD to reach an offscreen CTA. The
    // canvas is below the widget and pointer handling still excludes its host.
    const passingBehindUI = pinnedOffscreen || bug.pursuit === 'exit' || bug.pursuit === 'transit';
    for (const r of passingBehindUI ? [] : uiRects) {
      if (!contains(r, tx, ty, 18) && !contains(r, bug.x, bug.y, 22)) continue;
      const distances = [Math.abs(bug.x - r.left), Math.abs(bug.x - r.right), Math.abs(bug.y - r.top), Math.abs(bug.y - r.bottom)];
      const side = distances.indexOf(Math.min(...distances));
      if (side === 0) tx = r.left - 30;
      else if (side === 1) tx = r.right + 30;
      else if (side === 2) ty = r.top - 30;
      else ty = r.bottom + 30;
      bug.attached = false;
    }
    if (!pinnedOffscreen) {
      const dx = tx - bug.x, dy = ty - bug.y, distance = Math.hypot(dx, dy);
      const desired = Math.atan2(dy, dx);
      let angleDelta = desired - bug.angle;
      while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      bug.angle += angleDelta * Math.min(1, dt * (scattering || !visibleLive ? 16 : 11));
      const travel = Math.min(distance, bug.speed * (scattering ? 1.8 : !visibleLive ? 1.6 : bug.attached ? .70 : 1) * dt);
      const sway = reducedMotion || foodPoint ? 0 : Math.sin(bug.age * 8 + bug.phase) * 9 * dt;
      bug.x += Math.cos(bug.angle) * travel + Math.sin(bug.angle) * sway;
      bug.y += Math.sin(bug.angle) * travel - Math.cos(bug.angle) * sway;
      // Exit/transit crawlers must cross the canvas boundary rather than park on it.
      if (bug.pursuit !== 'exit' && bug.pursuit !== 'transit') {
        bug.x = clamp(bug.x, -25, width + 25);
        bug.y = clamp(bug.y, -25, height + 25);
      }
    }
    if (!scattering && bug.food && !bug.chewing && Math.hypot(bug.food.rect.x - bug.x, bug.food.rect.y - bug.y) <= 8 * bug.size + 4) {
      // Only a fresh, unobscured glyph under the crawler's mouth can begin a
      // bite. A second live Range check occurs when the chew completes.
      const r = measureGlyph(bug.food, true);
      if (r && Math.hypot(r.x - bug.x, r.y - bug.y) <= 8 * bug.size + 4) {
        bug.angle = Math.atan2(r.y - bug.y, r.x - bug.x);
        bug.x = r.x - Math.cos(bug.angle) * 8 * bug.size;
        bug.y = r.y - Math.sin(bug.angle) * 8 * bug.size;
        bug.chewing = true;
        bug.chewLeft = CHEW_SECONDS;
        bug.chewX = r.x; bug.chewY = r.y;
      } else if (r === null) releaseFood(bug);
    }
    if (bug.attached && target?.health > 0) {
      bug.stripeIn -= dt;
      if (bug.stripeIn <= 0) { leaveStripe(target, bug); bug.stripeIn = rand(.12, .20); }
      bug.biteIn -= dt;
      if (bug.biteIn <= 0) { damageTarget(target, bug); bug.biteIn = rand(.72, 1.1); }
    }
  }
  let bugPaths;
  function drawBug(bug, time) {
    if (options.drawBug) { options.drawBug(ctx, bug, time); return; }
    ctx.save();
    ctx.translate(bug.x, bug.y);
    ctx.rotate(bug.angle + Math.PI / 2);
    ctx.scale(bug.size, bug.size);
    const gait = reducedMotion ? 0 : Math.sin(time * 17 + bug.phase) * Math.PI / 20;
    ctx.strokeStyle = bug.hitFlash > 0 ? '#ffffff' : bug.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    /*! @license Bug icon derived from Lucide, ISC License. See THIRD_PARTY_NOTICES.md. */
    // Exact outline from Replica's malware-bug.svg; only the legs articulate.
    if (!bugPaths) {
      bugPaths = {
        body: new win.Path2D('m8 2 1.88 1.88 M14.12 3.88 16 2 M9 7.13v-1a3.003 3.003 0 1 1 6 0v1 M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6 M12 20v-9'),
        shell: new win.Path2D('M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z'),
        legs: [
          [6.53, 9, new win.Path2D('M6.53 9C4.6 8.8 3 7.1 3 5')],
          [6, 13, new win.Path2D('M6 13H2')],
          [6.8, 17, new win.Path2D('M3 21c0-2.1 1.7-3.9 3.8-4')],
          [17.47, 9, new win.Path2D('M20.97 5c0 2.1-1.6 3.8-3.5 4')],
          [18, 13, new win.Path2D('M22 13h-4')],
          [17.2, 17, new win.Path2D('M17.2 17c2.1.1 3.8 1.9 3.8 4')],
        ],
      };
    }
    ctx.translate(-12, -12);
    ctx.fillStyle = '#101010';
    ctx.fill(bugPaths.shell);
    ctx.stroke(bugPaths.body);
    bugPaths.legs.forEach(([x, y, path], index) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(gait * (index % 2 ? -1 : 1));
      ctx.translate(-x, -y);
      ctx.stroke(path);
      ctx.restore();
    });
    ctx.restore();
    if (bug.chewing) {
      ctx.save();
      ctx.strokeStyle = '#74dfa1';
      ctx.lineWidth = 1;
      ctx.globalAlpha = .7;
      ctx.beginPath();
      ctx.arc(bug.chewX, bug.chewY, 2 + (reducedMotion ? 0 : Math.sin(time * 35) * .8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (bug.tier > 1) {
      ctx.save();
      const pipY = bug.y + 19 * bug.size;
      for (let i = 0; i < bug.tier; i++) {
        ctx.fillStyle = i < bug.hp ? bug.color : '#ffffff28';
        ctx.fillRect(bug.x - (bug.tier * 5 - 2) / 2 + i * 5, pipY, 3, 3);
      }
      ctx.restore();
    }
  }
  function draw() {
    if (!ctx) return;
    // Retain one live media query; existing effects adapt on the next frame.
    const colors = feedbackColors(darkQuery?.matches);
    ctx.clearRect(0, 0, width, height);
    for (const bug of bugs) drawBug(bug, state.elapsed);
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / (p.score ? .4 : p.total), 0, 1);
      if (p.text) {
        ctx.font = p.score ? '700 16px ui-monospace, monospace' : '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = p.score ? colors.score : p.color;
        if (p.score) {
          ctx.save();
          ctx.strokeStyle = colors.outline;
          ctx.lineWidth = 3.5;
          ctx.lineJoin = 'round';
          ctx.strokeText(p.text, p.x, p.y);
          ctx.restore();
        }
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.tier ? colors.shards[p.tier - 1] : p.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
    for (const effect of aimEffects) {
      const progress = 1 - effect.life / effect.total;
      const radius = reducedMotion ? 10 : 6 + progress * (effect.kind === 'kill' ? 14 : effect.kind === 'hit' ? 10 : 6);
      ctx.save();
      ctx.globalAlpha = (1 - progress) * (effect.kind === 'miss' ? .45 : .85);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = colors.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = colors[effect.kind];
      ctx.lineWidth = 1.25;
      ctx.stroke();
      if (effect.kind === 'kill') {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI / 2;
          ctx.moveTo(effect.x + Math.cos(angle) * (radius + 2), effect.y + Math.sin(angle) * (radius + 2));
          ctx.lineTo(effect.x + Math.cos(angle) * (radius + 5), effect.y + Math.sin(angle) * (radius + 5));
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  function frame(now) {
    raf = 0;
    if (!active() || destroyed) return;
    const dt = Math.min(.05, (now - lastNow) / 1000 || 0);
    lastNow = now;
    state.elapsed += dt;
    refreshGeometry();
    scanFood(dt);
    if (state.elapsed - comboTime > 1.5) state.combo = 1;
    if (state.status === 'intermission') {
      nextWaveIn -= dt;
      if (nextWaveIn <= 0) startWave('clear');
    } else {
      nextWaveIn -= dt;
      if (nextWaveIn <= 0) startWave('timer');
      spawnIn -= dt;
      if (remaining > 0 && spawnIn <= 0) {
        spawn();
        remaining--;
        spawnIn = Math.max(.10, .27 - state.wave * .014);
      }
      for (const bug of bugs) {
        stepBug(bug, dt);
        if (state.status === 'gameover') break;
      }
      if (!bugs.length && !remaining && state.status === 'running') clearWave();
    }
    // Coalesce the footprints from all bugs; don't rewrite a button's layers for
    // every bug or every animation frame.
    for (const target of targets) {
      if (target.paintDirty && state.elapsed - target.lastPaint >= .10) paintTarget(target);
    }
    let liveParticles = 0;
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life > 0) particles[liveParticles++] = p;
    }
    particles.length = liveParticles;
    let liveEffects = 0;
    for (const effect of aimEffects) {
      effect.life -= dt;
      if (effect.life > 0) aimEffects[liveEffects++] = effect;
    }
    aimEffects.length = liveEffects;
    attackIndicators.update(state.status === 'running' && !doc.hidden ? getAttackEdges(bugs, width, height) : 0);
    draw();
    notify();
    if (active()) raf = win.requestAnimationFrame(frame);
  }
  function schedule() {
    if (!raf && active()) {
      lastNow = win.performance.now();
      raf = win.requestAnimationFrame(frame);
    }
  }
  function clearWave() {
    const bonus = state.wave * 50;
    state.score += bonus;
    state.combo = 1;
    updateBest();
    for (const target of targets) {
      if (target.health > 0 && target.health < 100) {
        target.health = Math.min(100, target.health + 9);
        paintTarget(target);
      }
    }
    nextWaveIn = 3;
    status('intermission');
    emit('wave-clear', { wave: state.wave, bonus });
  }
  function scatterNeighbors(killed) {
    const anchor = killed.target;
    let count = 0;
    for (const friend of bugs) {
      if (friend === killed || Math.hypot(friend.x - killed.x, friend.y - killed.y) > 210) continue;
      const away = Math.atan2(friend.y - killed.y, friend.x - killed.x) + rand(-.4, .4);
      const angle = Number.isFinite(away) ? away : rand(0, Math.PI * 2);
      friend.scatterX = clamp(friend.x + Math.cos(angle) * rand(115, 175), 22, width - 22);
      friend.scatterY = clamp(friend.y + Math.sin(angle) * rand(100, 160), 32, height - 30);
      if (Math.hypot(friend.scatterX - friend.x, friend.scatterY - friend.y) < 55) {
        const inward = Math.atan2(height / 2 - friend.y, width / 2 - friend.x) + rand(-.8, .8);
        friend.scatterX = clamp(friend.x + Math.cos(inward) * 125, 22, width - 22);
        friend.scatterY = clamp(friend.y + Math.sin(inward) * 125, 32, height - 30);
      }
      friend.scatterUntil = state.elapsed + rand(1, 1.3);
      friend.angle = Math.atan2(friend.scatterY - friend.y, friend.scatterX - friend.x);
      friend.attached = false;
      friend.pursuit = null;
      releaseFood(friend);
      friend.foodSearchIn = 0;
      friend.orbit = angle + rand(-1.2, 1.2);
      friend.biteIn = Math.max(friend.biteIn, .5);
      count++;
    }
    if (count) emit('scatter', { count, x: killed.x, y: killed.y, ...(anchor ? { targetId: anchor.id } : {}) });
  }
  function kill(bug) {
    scatterNeighbors(bug);
    releaseFood(bug);
    bugs.splice(bugs.indexOf(bug), 1);
    state.combo = state.elapsed - comboTime <= 1.5 ? Math.min(4, state.combo + 1) : 1;
    comboTime = state.elapsed;
    const speedBonus = bug.age < 3 ? 20 : bug.age < 6 ? 10 : 0;
    const tierBonus = 10 * (bug.tier - 1);
    const points = (10 + speedBonus + tierBonus) * state.combo;
    state.score += points;
    state.kills++;
    updateBest();
    const shards = reducedMotion ? 0 : 7;
    for (let i = 0; i < shards && particles.length < MAX_PARTICLES - 1; i++) {
      const angle = i / shards * Math.PI * 2;
      particles.push({ x: bug.x, y: bug.y, vx: Math.cos(angle) * rand(25, 65), vy: Math.sin(angle) * rand(25, 65), life: .42, total: .42, color: bug.color, tier: bug.tier });
    }
    if (particles.length < MAX_PARTICLES) particles.push({ x: bug.x, y: bug.y - 12, vx: 0, vy: reducedMotion ? 0 : -18, life: 1.1, total: 1.1, text: `+${points}`, score: true });
    emit('kill', { points, x: bug.x, y: bug.y, combo: state.combo, speedBonus, tierBonus, tier: bug.tier, age: bug.age });
    notify(true);
  }
  function protectedPointer(path) {
    return path.some(element => {
      if (element.closest?.(protectedPointerSelector)) return true;
      const button = element.closest?.('button');
      return button && !button.closest?.(selectors.target);
    });
  }
  function pointerPath(event) {
    return event.composedPath?.() || [event.target];
  }
  function restoreCursor() {
    if (!cursorRecord) return;
    const record = cursorRecord, element = record.element;
    cursorRecord = null;
    if (element.style.getPropertyValue('cursor') === record.latest && element.style.getPropertyPriority('cursor') === 'important') {
      if (record.original) element.style.setProperty('cursor', record.original, record.priority);
      else element.style.removeProperty('cursor');
    }
    if (!record.hadStyle && !element.getAttribute('style')) element.removeAttribute('style');
  }
  function setCursor(element, path = [element]) {
    if (state.status !== 'running' || doc.hidden || lastPointer?.type !== 'mouse' || !element?.style || !element.isConnected || protectedPointer(path)) {
      restoreCursor();
      return;
    }
    if (cursorRecord?.element === element && element.style.getPropertyValue('cursor') === cursorRecord.latest && element.style.getPropertyPriority('cursor') === 'important') return;
    restoreCursor();
    const record = {
      element, original: element.style.getPropertyValue('cursor'), priority: element.style.getPropertyPriority('cursor'),
      hadStyle: element.hasAttribute('style'), latest: '',
    };
    element.style.setProperty('cursor', reticleCursor, 'important');
    record.latest = element.style.getPropertyValue('cursor');
    cursorRecord = record;
  }
  function syncCursor() {
    if (!lastPointer || state.status !== 'running' || doc.hidden || lastPointer.type !== 'mouse') { restoreCursor(); return; }
    const element = doc.elementFromPoint?.(lastPointer.x, lastPointer.y) || lastPointer.element;
    setCursor(element);
  }
  function trackPointer(event) {
    lastPointer = { x: event.clientX, y: event.clientY, type: event.pointerType || 'mouse', element: event.target };
    setCursor(event.target, pointerPath(event));
  }
  function leavePointer() {
    lastPointer = null;
    restoreCursor();
  }
  function addAimEffect(x, y, kind) {
    const total = reducedMotion ? .16 : kind === 'kill' ? .36 : kind === 'hit' ? .28 : .24;
    if (aimEffects.length >= MAX_AIM_EFFECTS) aimEffects.shift();
    aimEffects.push({ x, y, kind, life: total, total });
  }
  function pointerDown(event) {
    // A new physical press replaces any missing compatibility click from the
    // previous press. A genuine miss must never inherit hit suppression.
    suppressedClick = null;
    trackPointer(event);
    if (state.status !== 'running' || event.button > 0 || protectedPointer(pointerPath(event))) return;
    const radius = event.pointerType === 'touch' || coarsePointer() ? 31 : 23;
    let hit = null, nearest = radius;
    for (const bug of bugs) {
      const distance = Math.hypot(bug.x - event.clientX, bug.y - event.clientY);
      if (distance <= nearest) { nearest = distance; hit = bug; }
    }
    addAimEffect(event.clientX, event.clientY, hit ? hit.hp <= 1 ? 'kill' : 'hit' : 'miss');
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressedClick = { x: event.clientX, y: event.clientY, until: win.performance.now() + 700 };
    hit.hp--;
    if (hit.hp <= 0) kill(hit);
    else {
      releaseFood(hit);
      hit.foodSearchIn = .15;
      hit.hitFlash = .15;
      hit.x = clamp(hit.x - Math.cos(hit.angle) * 12, 8, width - 8);
      hit.y = clamp(hit.y - Math.sin(hit.angle) * 12, 8, height - 8);
      hit.biteIn = Math.max(hit.biteIn, .45);
      emit('hit', { id: hit.id, hp: hit.hp, tier: hit.tier, x: hit.x, y: hit.y });
    }
  }
  function clickCapture(event) {
    if (!suppressedClick || event.detail === 0) return;
    if (protectedPointer(pointerPath(event))) { suppressedClick = null; return; }
    const hit = suppressedClick;
    if (win.performance.now() > hit.until) { suppressedClick = null; return; }
    if (Math.hypot(event.clientX - hit.x, event.clientY - hit.y) < 34) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressedClick = null;
    }
  }
  function start() {
    if (destroyed) throw new Error('Cannot restart a destroyed DOM Defender controller.');
    attackIndicators.update(0);
    if (raf) win.cancelAnimationFrame(raf);
    if (gameoverTimeout) win.clearTimeout(gameoverTimeout);
    gameoverTimeout = 0;
    raf = 0;
    restorePage();
    bugs = []; particles = []; remaining = 0; suppressedClick = null;
    Object.assign(state, { score: 0, wave: 0, kills: 0, combo: 1, elapsed: 0 });
    comboTime = -Infinity;
    pausedForVisibility = false;
    ensureCanvas();
    canvas.style.display = 'block';
    discoverPage();
    startWave('start');
    schedule();
    return getSnapshot();
  }
  function pause() {
    if (!active()) return getSnapshot();
    pausedFrom = state.status;
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    for (const bug of bugs) { bug.chewing = false; bug.chewLeft = 0; }
    status('paused');
    return getSnapshot();
  }
  function resume() {
    if (state.status !== 'paused' || doc.hidden || destroyed) return getSnapshot();
    pausedForVisibility = false;
    invalidateFoodGeometry();
    status(pausedFrom);
    schedule();
    return getSnapshot();
  }
  function stop() {
    if (raf) win.cancelAnimationFrame(raf);
    if (gameoverTimeout) win.clearTimeout(gameoverTimeout);
    gameoverTimeout = 0;
    raf = 0;
    bugs = []; particles = []; remaining = 0; nextWaveIn = 0; suppressedClick = null;
    restorePage();
    targets = []; textAreas = []; surfaces = [];
    if (ctx) ctx.clearRect(0, 0, width, height);
    if (canvas) canvas.style.display = 'none';
    pausedForVisibility = false;
    status('idle');
    return getSnapshot();
  }
  function destroy() {
    if (destroyed) return;
    stop();
    destroyed = true;
    for (const off of listeners) off();
    canvasHost?.remove();
    canvasHost = null; canvas = null; ctx = null;
    attackIndicators.destroy();
  }
  on(win, 'pointerdown', pointerDown, { capture: true, passive: false });
  on(win, 'pointermove', trackPointer, { capture: true, passive: true });
  on(win, 'pointerover', trackPointer, { capture: true, passive: true });
  on(win, 'pointerout', event => { if (!event.relatedTarget) leavePointer(); }, { passive: true });
  on(win, 'pointercancel', () => { suppressedClick = null; aimEffects = []; leavePointer(); }, { passive: true });
  on(win, 'blur', leavePointer);
  on(win, 'click', clickCapture, true);
  on(win, 'resize', invalidateFoodGeometry, { passive: true });
  on(doc, 'scroll', invalidateFoodGeometry, { capture: true, passive: true });
  on(doc, 'visibilitychange', () => {
    if (doc.hidden && active()) { pause(); pausedForVisibility = true; }
    else if (!doc.hidden && pausedForVisibility) resume();
  });
  on(doc, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
    if (doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    if (active()) { event.preventDefault(); pause(); }
    else if (state.status === 'paused') { event.preventDefault(); resume(); }
  });
  return { start, pause, resume, stop, destroy, getSnapshot };
}
