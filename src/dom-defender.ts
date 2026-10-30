import { AttachedPresentation } from './attached-presentation.js';
import { createMobileZoomLock } from '../shared/zoom-lock.js';
import { createMobileSelectionLock } from '../shared/selection-lock.js';
import type { Rect, Target, Bug, Particle, Surface, AimEffect, GameState, PointerNode } from './runtime-types.js';
import type { SwarmEvent, SwarmStatus, SwarmCoreController, SwarmCoreOptions } from '../integration/swarm-types.js';
import { createAttackIndicators, getAttackEdges, attackEdge, rescueOffer } from './attack-indicators.js';
import { feedbackColors } from './feedback-colors.js';
import { targetSignal, liquidFill, bubbleContrast, fadeSignal } from './target-health.js';
import { readTargetPalette, cssLayers } from './target-palette.js';
import { guardTargetHover, hoverLock } from './target-hover.js';
import { createEngine, type Engine } from '../vendor/fizlet/kernel/engine.js';
import { boardPage, type BoardPage } from '../vendor/fizlet/board-page.js';
import * as W from './world.js';

/**
 * DOM Defender — a dependency-free, opt-in overlay, on the Fizlet kernel.
 * One engine per round: read (geometry, scroll, what covers a bug's letter), step (the rules in
 * `world.ts`), render (canvas, liquid paint, cues). Every page change goes through the engine's
 * ledger (letters through fizlet/board-page), so stop(), restart or destroy() restore the page
 * exactly and a newer edit by the host page wins. A React island can own this controller without
 * owning the page beneath it.
 */
export function createDomDefender(options: SwarmCoreOptions = {}): SwarmCoreController {
  const doc = options.document || document;
  const win = doc.defaultView || window;
  const selectors = {
    target: options.targetSelector || '[data-swarm-target]',
    text: options.textSelector || '[data-swarm-text]',
    surface: options.surfaceSelector || '[data-swarm-surface]',
    ui: '[data-swarm-ui]',
  };
  const MAX_PARTICLES = 120;
  const MAX_AIM_EFFECTS = 8;
  // Range reads per board refresh (12.5 Hz while the page moves, 2 Hz once it is still), and
  // reserved letters checked for what covers them per frame.
  const READS = 600, COVER_CHECKS = 12;
  const bestKey = options.bestKey || 'swarm-protocol-best-v1';
  const tierColors = ['#ff6b6b', '#d984ff', '#8573ee'];
  const protectedPointerSelector = '[data-swarm-attack-cues],[data-swarm-ui],[data-swarm-ignore],dialog,[role="dialog"],[aria-modal="true"],form,input,textarea,select,option,[contenteditable]';
  const cursorSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke-linecap="round"><circle cx="16" cy="16" r="8" stroke="#101010" stroke-width="4"/><path d="M16 3v3m0 20v3M3 16h3m20 0h3" stroke="#101010" stroke-width="4"/><circle cx="16" cy="16" r="8" stroke="#06c4ff" stroke-width="1.5"/><path d="M16 3v3m0 20v3M3 16h3m20 0h3" stroke="#ecfcff" stroke-width="1.5"/></g><circle cx="16" cy="16" r="2" fill="#fff" stroke="#101010" stroke-width="1.5"/></svg>';
  const reticleCursor = `url("data:image/svg+xml,${encodeURIComponent(cursorSVG)}") 16 16, crosshair`;
  const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v));
  const rand = (a:number, b:number) => a + Math.random() * (b - a);
  const active = () => state.status === 'running' || state.status === 'intermission';
  const reducedMotion = options.reducedMotion ?? (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  const coarseQuery = win.matchMedia?.('(pointer: coarse)');
  const darkQuery = win.matchMedia?.('(prefers-color-scheme: dark)');
  const coarsePointer = () => width <= 640 || Boolean(coarseQuery?.matches);
  let best = 0;
  try { best = Math.max(0, Number(win.localStorage.getItem(bestKey)) || 0); } catch {}
  const selectionLock = createMobileSelectionLock(doc);
  const zoomLock = createMobileZoomLock(doc, options.lockZoom !== false);
  const state: GameState = { status: 'idle', score: 0, best, wave: 0, kills: 0, combo: 1, elapsed: 0 };
  let canvas: HTMLCanvasElement = null!, canvasHost: HTMLDivElement = null!, ctx: CanvasRenderingContext2D = null!, raf = 0, lastNow = 0, lastState = 0;
  let width = win.innerWidth, height = win.innerHeight, ratio = 1;
  let particles: Particle[] = [], targets: Target[] = [], surfaces: Surface[] = [], uiRects: Rect[] = [];
  let pausedFrom: SwarmStatus = 'running', pausedForVisibility = false, destroyed = false;
  let geometryDirty = true, geometryAt = 0, suppressedClick: {x:number;y:number;until:number} | null = null;
  let gameoverTimeout = 0;
  let scrollX = win.scrollX || 0, scrollY = win.scrollY || 0;
  let cursorElement: HTMLElement | null = null, lastPointer: {x:number;y:number;type:string;element:HTMLElement} | null = null, aimEffects: AimEffect[] = [];
  let releaseHover: (()=>void) | null = null;
  const listeners: (()=>void)[] = [];
  const attackIndicators = createAttackIndicators(doc, reducedMotion, rescue);
  const attachedPresentation = new AttachedPresentation(doc, setStyle);

  // ---------- The round: one engine, the page's letters, the rules ----------
  let engine: Engine | null = null, board: Pick<BoardPage, 'glyphs' | 'scans' | 'reads' | 'nearAt' | 'consume' | 'char' | 'parent' | 'refresh'> | null = null, world: W.World | null = null;
  const ctl = new Float64Array(8);
  // Letters' geometry after a scroll or resize: stale until a board refresh reads them all (under
  // its cap) at least 0.1 s later, or 0.5 s at most. A rescue waits for the world's next step.
  let staleUntil = 0, pendingRescue = false, invalidated = false, cursorDirty = false;
  // Presses this frame per bug id: the world squashes in its next step, so a second press on a bug
  // already squashed to death this frame misses (as a press on a gone bug did before).
  const pendingSquash = new Map<number, number>();
  // Per bug slot: the reserved letter last checked for cover, and when.
  const checkedId = new Int32Array(W.MAX_BUGS), checkedGlyph = new Int32Array(W.MAX_BUGS), checkedAt = new Float64Array(W.MAX_BUGS);
  let coverCursor = 0;
  // Drawing views of the world's bugs (stable per bug id), and the live list in arrival order.
  const views = new Map<number, Bug>();
  let bugs: Bug[] = [], viewStamp = 0;
  const pursuitNames = [null, 'attack', 'dash', 'exit', 'transit'] as const;
  /** A board with no letters (browsers without Intl.Segmenter). */
  const none = new Float32Array(0);
  const noLetters = { glyphs: { count: 0, x: none, y: none, w: none, h: none, spent: new Uint8Array(0) }, scans: 0, reads: 0, nearAt: () => 0, consume: () => false, char: () => '', parent: () => null, refresh() {} } as const;

  function on<K extends keyof DocumentEventMap>(target: EventTarget, name: K, callback: (event: DocumentEventMap[K])=>void, settings?: boolean | AddEventListenerOptions) {
    target.addEventListener(name, callback as EventListener, settings);
    listeners.push(() => target.removeEventListener(name, callback as EventListener, settings));
  }
  /** A host callback that throws is reported, and the round goes on (it runs inside a frame). */
  function call<T>(callback: ((value: T) => void) | undefined, value: T) {
    try { callback?.(value); } catch (error) { if (win.reportError) win.reportError(error); else console.error(error); }
  }
  function emit(type: SwarmEvent["type"], data: Record<string,unknown> = {}) {
    call(options.onEvent, { type, ...data } as SwarmEvent);
  }
  // The round's numbers the snapshot shows (kept after the round's engine is gone, as 1.3.1 did).
  let jumps = 0, zaps = 0, remaining = 0, nextWaveIn = 0;
  function getRescueOffer() {
    return rescueOffer(state.score, jumps, zaps);
  }
  function getSnapshot() {
    const enrolled = targets.filter(t => t.enrolled && t.rendered && t.element.isConnected);
    const health = enrolled.length ? enrolled.reduce((sum, t) => sum + t.health, 0) / enrolled.length : 100;
    return {
      ...state,
      rescue: { ...getRescueOffer(), jumps, zaps },
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
      call(options.onState, getSnapshot());
    }
  }
  function status(value: SwarmStatus) {
    state.status = value;
    attachedPresentation.setActive(value === 'running' || value === 'intermission');
    zoomLock.setActive(value === 'running' || value === 'intermission');
    selectionLock.setActive(value === 'running' || value === 'intermission');
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
  /** Page styles go through the round's ledger: change-only, restored exactly, host edits win. */
  function setStyle(element: HTMLElement, property: string, value: string, priority = '') {
    engine?.ledger.style(element, property, value, priority);
  }
  function setAttribute(element: Element, name: string, value: string) {
    engine?.ledger.attr(element as HTMLElement, name, value);
  }
  function restoreProperties(element: HTMLElement, names: string[]) {
    if (engine) for (const name of names) engine.ledger.unstyle(element, name);
  }
  /** Recall: every page change of the round goes back (the engine's ledger), overlays go. */
  function restorePage() {
    attachedPresentation.clear();
    zoomLock.setActive(false);
    selectionLock.setActive(false);
    releaseHover?.();
    releaseHover = null;
    cursorElement = null;
    aimEffects = [];
    engine?.destroy();
    engine = null; board = null; world = null;
    views.clear();
    bugs = [];
  }
  function rectVisible(r: Rect) {
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < width && r.top < height;
  }
  function discoverPage() {
    targets = [...doc.querySelectorAll<HTMLElement>(selectors.target)].filter(element => !element.closest('[data-swarm-ignore]')).slice(0, W.MAX_TARGETS).map((element, index) => ({
      element,
      id: element.id || `swarm-target-${index + 1}`,
      label: element.getAttribute('data-swarm-label') || element.getAttribute('aria-label') || element.textContent.trim().slice(0, 48) || `Target ${index + 1}`,
      health: 100, rect: null!, visible: false, rendered: false, enrolled: false, bites: 0,
      originalBackground: null, palette: null, cornerRadius: 8, pulsePhase: index * .17, interactive: false, interactionUntil: 0,
      hovered: false, bubbleTime: 0, bubbleHeat: 0,
      hitUntil: 0, liquidUntil: 0, liquidBite: .5, liquidActive: false, moving: false, paintDirty: true, lastPaint: -Infinity, signalColor: '', colorFrom: '', colorAt: 0, colorActive: false,
    }));
    surfaces = [...doc.querySelectorAll<HTMLElement>(selectors.surface)].filter(el => !el.closest(`${selectors.ui},[data-swarm-ignore]`)).slice(0, W.MAX_SURFACES)
      .map(element => ({ element, rect: null!, visible: false, damage: 0 }));
    geometryDirty = true;
  }
  /** Read: viewport, buttons, surfaces and the host's UI, into the world (low rate unless dirty). */
  function refreshGeometry(force = false) {
    const now = win.performance.now();
    // A low-rate refresh also catches layout shifts and a changing widget size.
    if (!force && now - geometryAt < (geometryDirty ? 80 : 600)) return;
    geometryDirty = false;
    geometryAt = now;
    const newWidth = win.innerWidth, newHeight = win.innerHeight, newRatio = Math.min(win.devicePixelRatio || 1, 1.75);
    if (newWidth !== width || newHeight !== height || newRatio !== ratio || canvas?.width !== Math.round(newWidth * newRatio)) {
      width = newWidth;
      height = newHeight;
      ratio = newRatio;
      if (canvas) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    }
    const T = world?.targets;
    targets.forEach((item, t) => {
      const previous = item.rect;
      item.rect = item.element.getBoundingClientRect();
      const style = win.getComputedStyle?.(item.element);
      const display = style?.getPropertyValue('display'), visibility = style?.getPropertyValue('visibility');
      item.rendered = item.element.isConnected && !item.element.hidden && item.rect.width > 0 && item.rect.height > 0 && display !== 'none' && visibility !== 'hidden' && visibility !== 'collapse';
      item.visible = item.rendered && rectVisible(item.rect);
      if (item.rendered) item.enrolled = true;
      if (!T) return;
      // Attached bugs belong to their button, including inside nested scrollers.
      if (previous) world!.follow(t, item.rect.left - previous.left, item.rect.top - previous.top);
      T.tx[t] = item.rect.left; T.ty[t] = item.rect.top; T.tw[t] = item.rect.width; T.th[t] = item.rect.height;
      T.rendered[t] = item.rendered ? 1 : 0; T.visible[t] = item.visible ? 1 : 0;
      T.connected[t] = item.element.isConnected ? 1 : 0; T.enrolled[t] = item.enrolled ? 1 : 0;
    });
    surfaces.forEach((item, i) => {
      item.rect = item.element.getBoundingClientRect();
      const style = win.getComputedStyle?.(item.element);
      item.visible = item.element.isConnected && !item.element.hidden && rectVisible(item.rect) && style?.getPropertyValue('display') !== 'none' && style?.getPropertyValue('visibility') !== 'hidden' && style?.getPropertyValue('visibility') !== 'collapse';
      if (!world) return;
      const r = world.surfaces.rects;
      r[i * 4] = item.rect.left; r[i * 4 + 1] = item.rect.top; r[i * 4 + 2] = item.rect.right; r[i * 4 + 3] = item.rect.bottom;
      world.surfaces.visible[i] = item.visible ? 1 : 0;
    });
    world?.surfaces.set(surfaces.length);
    uiRects = [...doc.querySelectorAll<HTMLElement>(selectors.ui)]
      .filter(el => !el.hidden).map(el => el.getBoundingClientRect()).filter(rectVisible).slice(0, W.MAX_UI);
    if (world) {
      uiRects.forEach((r, i) => { const u = world!.ui.rects; u[i * 4] = r.left; u[i * 4 + 1] = r.top; u[i * 4 + 2] = r.right; u[i * 4 + 3] = r.bottom; });
      world.ui.set(uiRects.length);
      ctl[W.VW] = width; ctl[W.VH] = height;
    }
    cursorDirty = true;
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
    ctx = canvas.getContext('2d', { alpha: true })!;
    if (!ctx) {
      canvasHost.remove(); canvasHost = null!; canvas = null!;
      throw new Error('DOM Defender requires a 2D canvas context.');
    }
  }
  function updateBest() {
    if (state.score <= state.best) return;
    state.best = state.score;
    try { win.localStorage.setItem(bestKey, String(state.best)); } catch {}
  }
  function rememberBackground(target: Target) {
    if (target.originalBackground) return;
    target.palette = readTargetPalette(target.element, doc);
    setStyle(target.element, 'transition', 'none', 'important');
    setAttribute(target.element, hoverLock, 'active');
    const style = win.getComputedStyle?.(target.element) || target.element.style;
    const read = (name:string, fallback:string) => style.getPropertyValue(name) || fallback;
    const images = cssLayers(read('background-image', 'none'));
    target.palette!.base = read('background-color', 'transparent');
    target.palette!.bubbles! = bubbleContrast(target.palette!.base === 'transparent' || target.palette!.base === 'rgba(0, 0, 0, 0)' ? target.palette.power : target.palette!.base);
    const bubbleInk = target.palette!.bubbles! === '#ffffff' ? 'rgb(255 255 255 / .24)' : 'rgb(16 16 16 / .24)';
    target.palette!.calmBubbles! = [[1.5, 17, 65], [3.5, 57, 32], [2.3, 83, 76]]
      .map(([radius, x, y]) => `radial-gradient(circle ${radius}px at ${x}% ${y}%,${bubbleInk} 90%,transparent 100%)`);
    const expand = (name:string, fallback:string) => {
      const values = cssLayers(read(name, fallback));
      return images.map((_, i) => values[i % values.length]);
    };
    target.cornerRadius = Math.min(target.rect.height / 2, parseFloat(read('border-top-left-radius', '8')) || 0);
    target.originalBackground = {
      images: images[0] === 'none' ? [] : images,
      sizes: expand('background-size', 'auto'),
      positions: expand('background-position', '0% 0%'),
      repeats: expand('background-repeat', 'repeat'),
      origins: expand('background-origin', 'padding-box'),
      clips: expand('background-clip', 'border-box'),
    };
  }
  const targetPaintProperties = ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'background-origin', 'background-clip'];
  function paintTarget(target: Target) {
    target.paintDirty = false;
    target.lastPaint = state.elapsed;
    target.calm = coarsePointer();
    const el = target.element;
    setAttribute(el, 'data-swarm-infected', target.health <= 0 ? 'breached' : 'active');
    if (target.health <= 0) {
      target.liquidActive = false;
      setAttribute(el, hoverLock, 'inactive');
      restoreProperties(el, [...targetPaintProperties, 'transition', '-webkit-tap-highlight-color']);
      if (!reducedMotion && !target.interactive) {
        setStyle(el, 'translate', '0px 2px');
        setStyle(el, 'rotate', '-3deg');
      }
      target.moving = false;
      return;
    }
    rememberBackground(target);
    if (target.calm) setStyle(el, '-webkit-tap-highlight-color', 'transparent', 'important');
    else restoreProperties(el, ['-webkit-tap-highlight-color']);
    const base = target.originalBackground!;
    const signal = targetSignal(target.health, target.palette?.power);
    if (target.signalColor !== signal.color) {
      target.colorFrom = target.signalColor || signal.color;
      target.signalColor = signal.color;
      target.colorAt = state.elapsed;
    }
    const colorProgress = reducedMotion ? 1 : Math.min(1, (state.elapsed - target.colorAt) / .35);
    target.colorActive = target.colorFrom !== target.signalColor && colorProgress < 1;
    const fillColor = fadeSignal(target.colorFrom, target.signalColor, colorProgress);
    // One solid color with a hard horizontal edge: the fill drains downward.
    // Original background layers remain visible in the empty part of the tank.
    const appendBase = (values:string[], originals:string[]) => [...values, ...(base.images.length ? originals : [])].join(',');
    const animated = !reducedMotion && !target.calm && target.visible;
    const ripple = animated ? Math.max(0, target.liquidUntil - state.elapsed) / .65 : 0;
    target.liquidActive = ripple > 0;
    const bubbles = animated ? {
      color: target.palette!.bubbles!, time: target.bubbleTime,
      width: Math.max(1, target.rect.width), height: Math.max(1, target.rect.height),
    } : null;
    const layer = liquidFill(signal.fill, fillColor, ripple, .65 * (1 - ripple), target.liquidBite, 1, bubbles);
    // Mobile keeps the actual color in a native CSS gradient. Static radial
    // bubbles need no image decoding or continuous background replacement.
    const calmBubbles = target.calm && !reducedMotion ? target.palette!.calmBubbles! : [];
    const layers = [...calmBubbles, layer];
    const sizes = [...calmBubbles.map(() => `100% ${signal.fill}%`), '100% 100%'];
    const positions = [...calmBubbles.map(() => '0% 100%'), '0% 0%'];
    // Only the power background outranks host hover rules, including !important.
    setStyle(el, 'background-color', target.palette!.base, 'important');
    setStyle(el, 'background-image', [...layers, ...base.images].join(','), 'important');
    setStyle(el, 'background-size', appendBase(sizes, base.sizes), 'important');
    setStyle(el, 'background-position', appendBase(positions, base.positions), 'important');
    setStyle(el, 'background-repeat', appendBase(layers.map(() => 'no-repeat'), base.repeats), 'important');
    setStyle(el, 'background-origin', appendBase(layers.map(() => 'border-box'), base.origins), 'important');
    setStyle(el, 'background-clip', appendBase(layers.map(() => 'border-box'), base.clips), 'important');
  }
  function targetInteraction(event: FocusEvent | PointerEvent) {
    if (!targets.length || destroyed) return;
    for (const target of targets) {
      const el = target.element;
      if (!el.contains(event.target as Node | null) && !el.contains(event.relatedTarget as Node | null)) continue;
      const interactive = el.matches?.(':hover, :focus-within') || false;
      const hovered = !coarsePointer() && (el.matches?.(':hover') || false);
      if (target.interactive === interactive && target.hovered === hovered) continue;
      target.interactive = interactive;
      target.hovered = hovered;
      target.interactionUntil = state.elapsed + .35;
      if (target.health <= 0) {
        restoreProperties(el, ['translate', 'rotate']);
        target.moving = false;
      }
      geometryDirty = true;
      if (target.rendered && (!coarsePointer() || target.health <= 0)) paintTarget(target);
    }
    // Paused rounds keep their phase/health but still allow native interaction.
    if (state.status === 'paused' && !doc.hidden) { syncScroll(); refreshGeometry(); syncViews(); draw(); }
  }
  function animateTargetHit(target: Target) {
    if (coarsePointer()) {
      if (target.moving) {
        restoreProperties(target.element, ['translate', 'rotate']);
        target.moving = false;
      }
      return;
    }
    if (reducedMotion || target.health <= 0 || !target.element.isConnected) return;
    const remaining = target.hitUntil - state.elapsed;
    if (remaining > 0) {
      const progress = 1 - remaining / .22;
      const offset = Math.sin(progress * Math.PI * 4) * (1 - progress) * (target.bites % 2 ? 1 : -1);
      setStyle(target.element, 'translate', `${(offset * 2).toFixed(2)}px ${(-Math.abs(offset)).toFixed(2)}px`);
      setStyle(target.element, 'rotate', `${(offset * .9).toFixed(2)}deg`);
      target.moving = true;
    } else if (target.moving) {
      restoreProperties(target.element, ['translate', 'rotate']);
      target.moving = false;
    }
  }
  function syncScroll() {
    const x = win.scrollX || 0, y = win.scrollY || 0, dx = x - scrollX, dy = y - scrollY;
    scrollX = x; scrollY = y;
    if (!dx && !dy) return;
    // Free bugs stay in document space. Scrolling can outrun them; no edge teleport.
    world?.scroll(dx, dy);
    for (const p of particles) { p.x -= dx; p.y -= dy; }
    for (const effect of aimEffects) { effect.x -= dx; effect.y -= dy; }
  }
  function invalidateFoodGeometry() {
    geometryDirty = true;
    invalidated = true;
  }
  /** Read: a scroll or resize since the last frame. Every bug lets go of its letter and looks again
   *  once the letters are measured again. */
  function applyInvalidate() {
    invalidated = false;
    if (!world) return;
    world.invalidate();
    ctl[W.STALE] = 1;
    staleUntil = state.elapsed + .5;
  }

  // ---------- Read: geometry, input, what covers a bug's letter ----------
  function read() {
    if (targets.some(target => target.interactionUntil > state.elapsed)) geometryDirty = true;
    syncScroll();
    if (invalidated) applyInvalidate();
    refreshGeometry();
    ctl[W.COARSE] = coarsePointer() ? 1 : 0;
    ctl[W.CALM] = reducedMotion ? 1 : 0;
    ctl[W.PON] = lastPointer ? 1 : 0;
    if (lastPointer) { ctl[W.PX] = lastPointer.x; ctl[W.PY] = lastPointer.y; }
    // Fresh letters again: a board refresh (one runs within 0.08 s of a change) read them all.
    if (ctl[W.STALE] && board && ((state.elapsed >= staleUntil - .4 && board.reads < READS) || state.elapsed >= staleUntil)) ctl[W.STALE] = 0;
    checkCover();
  }
  /** A reserved letter must still be the text's own at its centre (not under a dialog, a menu or
   *  another layer): one elementFromPoint each. A letter being chewed is checked every frame (its
   *  bite lands at the end of the chew); other reserved letters a few a frame, each again after 0.16 s. */
  function checkCover() {
    if (!world || !board || !doc.elementFromPoint) return;
    const B = world.bugs, n = B.count;
    for (let j = 0; j < n; j++) if (B.chewing[j]) coverAt(j);
    for (let k = 0, checks = 0; k < n && checks < COVER_CHECKS; k++) {
      const j = (coverCursor + k) % n, g = world.food[j]!;
      if (B.chewing[j] || g < 0 || (checkedId[j] === B.id[j] && checkedGlyph[j] === g && state.elapsed - checkedAt[j]! < .16)) continue;
      coverAt(j);
      checks++;
    }
    if (n) coverCursor = (coverCursor + COVER_CHECKS) % n;
  }
  function coverAt(j: number) {
    const B = world!.bugs, G = board!.glyphs, g = world!.food[j]!;
    if (g < 0 || g >= G.count) return;
    checkedId[j] = B.id[j]!; checkedGlyph[j] = g; checkedAt[j] = state.elapsed;
    const parent = board!.parent(g);
    if (!parent || !(G.w[g]! > 0)) return;
    const hit = doc.elementFromPoint(G.x[g]! + G.w[g]! / 2, G.y[g]! + G.h[g]! / 2);
    const area = parent.closest(selectors.text);
    const own = !!hit && (hit === parent || parent.contains(hit) || (hit !== doc.body && !!area?.contains(hit) && hit.contains(parent)));
    world!.cover(g, !own);
  }

  // ---------- Render: the world's events, then the page and the canvas ----------
  /** Views of the world's bugs for drawing, cues and the drawBug option (stable per bug). */
  function syncViews() {
    if (!world) return;
    const B = world.bugs, n = B.count, stamp = ++viewStamp;
    bugs.length = 0;
    for (let j = 0; j < n; j++) {
      const id = B.id[j]!;
      let v = views.get(id);
      if (!v) views.set(id, (v = {} as Bug));
      const t = B.target[j]!, tier = B.tier[j]!;
      v.id = id; v.x = B.x[j]!; v.y = B.y[j]!; v.angle = B.angle[j]!; v.size = B.size[j]!; v.tier = tier; v.hp = B.hp[j]!;
      v.color = tierColors[tier - 1]!; v.age = B.age[j]!; v.phase = B.phase[j]!; v.lettersEaten = v.feeds = B.eaten[j]!;
      v.hitFlash = B.flash[j]!; v.target = t >= 0 ? targets[t] ?? null : null; v.siphonUntil = B.siphon[j]!;
      v.chewing = B.chewing[j] === 1; v.chewX = B.chewX[j]!; v.chewY = B.chewY[j]!; v.attached = B.attached[j] === 1;
      v.pursuit = pursuitNames[B.pursuit[j]!] ?? null; v.scatterUntil = B.scatterUntil[j]!; v.stamp = stamp;
      bugs.push(v);
    }
    for (const [id, v] of views) if (v.stamp !== stamp) views.delete(id);
  }
  function syncState() {
    const s = world!.s;
    state.score = s[W.SCORE]!; state.wave = s[W.WAVE]!; state.kills = s[W.KILLS]!; state.combo = s[W.COMBO]!; state.elapsed = s[W.TIME]!;
    jumps = s[W.JUMPS]!; zaps = s[W.ZAPS]!; remaining = s[W.REMAINING]!; nextWaveIn = s[W.NEXT_WAVE_IN]!;
    const T = world!.targets;
    targets.forEach((target, t) => {
      target.health = T.health[t]!; target.bites = T.bites[t]!; target.hitUntil = T.hitUntil[t]!;
      target.liquidUntil = T.liquidUntil[t]!; target.liquidBite = T.liquidBite[t]!;
    });
  }
  function nickSurface(i: number, damage: number) {
    const surface = surfaces[i];
    if (!surface) return;
    surface.damage = damage;
    const n = Math.min(16, damage * 2);
    setStyle(surface.element, 'clip-path', `polygon(0 0, 100% 0, 100% 34%, calc(100% - ${n}px) 34%, calc(100% - ${n}px) 44%, 100% 44%, 100% 100%, 0 100%, 0 76%, ${Math.round(n * .7)}px 76%, ${Math.round(n * .7)}px 65%, 0 65%)`);
    setStyle(surface.element, 'filter', `saturate(${1 - damage * .025})`);
  }
  function gameover() {
    updateBest();
    status('gameover');
    emit('gameover', getSnapshot());
    if (state.status === 'gameover') gameoverTimeout = win.setTimeout(() => {
      gameoverTimeout = 0;
      if (state.status !== 'gameover' || destroyed) return;
      restorePage();
      particles = [];
      if (ctx) ctx.clearRect(0, 0, width, height);
      if (canvas) canvas.style.display = 'none';
      emit('restored');
      notify(true);
    }, 900);
  }
  /** What the steps did (the engine's event ring), as Swarm events, particles and paint. */
  function drainEvents() {
    const e = engine!, w = world!, pay = w.pay, waveReasons = ['start', 'timer', 'clear'] as const;
    for (let i = 0; i < e.events.size; i++) {
      const ev = e.events.at(i)!, k = ev.a * 8;
      switch (ev.type) {
        case 'wave-start':
          status('running');
          emit('wave-start', { wave: ev.a, count: ev.b, reason: waveReasons[ev.v] });
          break;
        case 'wave-clear':
          for (const target of targets) if (target.health > 0 && target.rendered) paintTarget(target);
          updateBest();
          status('intermission');
          emit('wave-clear', { wave: ev.a, bonus: ev.b });
          break;
        case 'bite': {
          const binary = ev.b ? '1' : '0', tier = pay[k + 3]!, bx = pay[k + 5]!, by = pay[k + 6]!;
          if (!reducedMotion && particles.length < MAX_PARTICLES) particles.push({ x: ev.x, y: ev.y, vx: (bx - ev.x) / .25, vy: (by - ev.y) / .25, life: .25, total: .25, color: '#74dfa1', text: binary });
          emit('bite', { id: pay[k], x: ev.x, y: ev.y, letter: board!.char(pay[k + 4]!), binary, lettersEaten: pay[k + 2], tier, full: tier === 3 });
          break;
        }
        case 'evolve':
          emit('evolve', { id: pay[k], tier: pay[k + 1], hp: pay[k + 2], x: ev.x, y: ev.y });
          break;
        case 'nick':
          nickSurface(ev.a, ev.b);
          break;
        case 'damage': {
          const target = targets[ev.a];
          if (!target) break;
          target.health = ev.b;
          target.paintDirty = true;
          if (target.health <= 0) paintTarget(target);
          if (!reducedMotion && particles.length < MAX_PARTICLES - 2) {
            particles.push({ x: ev.x, y: ev.y, vx: rand(-12, 12), vy: -rand(18, 30), life: .8, total: .8, color: tierColors[ev.v - 1]!, bubble: true, radius: rand(2.4, 4.2) });
          }
          emit('damage', { targetId: target.id, health: target.health });
          break;
        }
        case 'gameover':
          gameover();
          break;
        case 'scatter': {
          const anchor = targets[ev.b];
          emit('scatter', { count: ev.a, x: ev.x, y: ev.y, ...(anchor ? { targetId: anchor.id } : {}) });
          break;
        }
        case 'kill': {
          const points = pay[k]!, tier = pay[k + 4]!, color = tierColors[tier - 1]!;
          state.score = w.s[W.SCORE]!;
          updateBest();
          const shards = reducedMotion ? 0 : 7;
          for (let i = 0; i < shards && particles.length < MAX_PARTICLES - 1; i++) {
            const angle = i / shards * Math.PI * 2;
            particles.push({ x: ev.x, y: ev.y, vx: Math.cos(angle) * rand(25, 65), vy: Math.sin(angle) * rand(25, 65), life: .42, total: .42, color, tier });
          }
          if (particles.length < MAX_PARTICLES) particles.push({ x: ev.x, y: ev.y - 12, vx: 0, vy: reducedMotion ? 0 : -18, life: 1.1, total: 1.1, text: `+${points}`, color, score: true });
          emit('kill', { points, x: ev.x, y: ev.y, combo: pay[k + 1], speedBonus: pay[k + 2], tierBonus: pay[k + 3], tier, age: pay[k + 5] });
          notify(true);
          break;
        }
        case 'hit':
          emit('hit', { id: pay[k], hp: pay[k + 2], tier: pay[k + 1], x: ev.x, y: ev.y });
          break;
        case 'rescue': {
          const zap = pay[k] === 2, target = targets[pay[k + 1]!], radius = pay[k + 4]!;
          if (zap) {
            addAimEffect(ev.x, ev.y, 'zap');
            aimEffects[aimEffects.length - 1]!.radius = radius;
          }
          emit('rescue', { action: zap ? 'zap' : 'jump', targetId: target?.id, cost: pay[k + 2], killed: pay[k + 3], points: pay[k + 3], x: ev.x, y: ev.y, radius });
          break;
        }
      }
      // A host callback may have stopped, restarted or destroyed the round.
      if (state.status === 'gameover' || engine !== e) break;
    }
  }
  function render() {
    if (!world || !engine) return;
    const e = engine, dt = e.timing[0]!;
    syncState();
    syncViews();
    drainEvents();
    if (engine !== e) return;
    syncState();
    if (cursorDirty) { cursorDirty = false; syncCursor(); }
    // Coalesce health paints; pulse drawing shares the existing canvas loop.
    const calm = coarsePointer();
    for (const target of targets) {
      if (target.health > 0 && target.calm !== calm) target.paintDirty = true;
      const bubbling = !reducedMotion && !calm && target.health > 0 && target.visible;
      if (bubbling) {
        target.bubbleHeat += ((target.hovered ? 1 : 0) - target.bubbleHeat) * Math.min(1, dt * 8);
        target.bubbleTime += dt * (1 + target.bubbleHeat * 3);
      }
      if (target.rendered && (target.paintDirty || bubbling || target.liquidActive || target.colorActive) && state.elapsed - target.lastPaint >= 1 / 12) paintTarget(target);
      if (target.health > 0 && !reducedMotion) target.pulsePhase = (target.pulsePhase + dt / (targetSignal(target.health, target.palette?.power).period * (calm ? 1.5 : 1))) % 1;
      animateTargetHit(target);
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
    updateAttackIndicators();
    draw();
    notify();
  }

  let bugPaths: {body:Path2D;shell:Path2D;legs:[number,number,Path2D][]} | undefined;
  function drawBug(bug: Bug, time:number, context = ctx) {
    const ctx = context;
    if (options.drawBug) { options.drawBug(ctx, bug, time); return; }
    // Offscreen missions keep simulating, without issuing invisible canvas work.
    const margin = 32 * bug.size;
    if (bug.x < -margin || bug.x > width + margin || bug.y < -margin || bug.y > height + margin) return;
    ctx.save();
    ctx.translate(bug.x, bug.y);
    ctx.rotate(bug.angle + Math.PI / 2);
    const feeding = !reducedMotion && bug.attached && bug.target?.health! > 0 && bug.siphonUntil > state.elapsed;
    const bitePulse = feeding ? Math.sin((1 - (bug.siphonUntil - state.elapsed) / .16) * Math.PI) * .04 : 0;
    ctx.scale(bug.size * (1 + bitePulse), bug.size * (1 - bitePulse));
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
      ctx.arc(bug.chewX!, bug.chewY!, 2 + (reducedMotion ? 0 : Math.sin(time * 35) * .8), 0, Math.PI * 2);
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
    attachedPresentation.update(targets, bugs, reducedMotion || coarsePointer());
    for (const bug of bugs) {
      if (!attachedPresentation.drawBug(bug, ratio, context => drawBug(bug, state.elapsed, context))) drawBug(bug, state.elapsed);
    }
    for (const p of particles) {
      if (p.x < -80 || p.x > width + 80 || p.y < -30 || p.y > height + 30) continue;
      ctx.globalAlpha = clamp(p.life / (p.score ? .4 : p.total), 0, 1);
      if (p.bubble) {
        const progress = 1 - p.life / p.total;
        ctx.globalAlpha *= .9;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(progress * 7) * 2, p.y, p.radius! * (1 + progress * .4), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else if (p.text) {
        ctx.font = p.score ? '700 16px ui-monospace, monospace' : '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = p.color;
        if (p.score) {
          ctx.save();
          ctx.strokeStyle = colors.outline;
          ctx.lineWidth = 6;
          ctx.lineJoin = 'round';
          ctx.strokeText(p.text, p.x, p.y);
          ctx.strokeStyle = '#101010';
          ctx.lineWidth = 3;
          ctx.strokeText(p.text, p.x, p.y);
          ctx.restore();
        }
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.strokeStyle = '#151020'; ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 1.5, p.y - 1.5, 3, 3);
        ctx.fillStyle = p.tier ? colors.shards[p.tier - 1] : p.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
    for (const effect of aimEffects) {
      const progress = 1 - effect.life / effect.total;
      const radius = effect.kind === 'zap' ? (reducedMotion ? effect.radius! : 12 + progress * (effect.radius! - 12)) : reducedMotion ? 10 : 6 + progress * (effect.kind === 'kill' ? 14 : effect.kind === 'hit' ? 10 : 6);
      ctx.save();
      ctx.globalAlpha = (1 - progress) * (effect.kind === 'miss' ? .45 : .85);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = colors.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = effect.kind === 'zap' ? colors.kill : colors[effect.kind];
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

  // ---------- The frame: Swarm's own window drives the engine (it may be another document's) ----------
  function frame(now:number) {
    raf = 0;
    if (!active() || destroyed || !engine) return;
    const sec = Math.min(.05, (now - lastNow) / 1000 || 0);
    lastNow = now;
    engine.advance(sec);
    if (active()) raf = win.requestAnimationFrame(frame);
  }
  function schedule() {
    if (!raf && active()) {
      lastNow = win.performance.now();
      raf = win.requestAnimationFrame(frame);
    }
  }
  function updateAttackIndicators() {
    attackIndicators.update(state.status === 'running' && !doc.hidden ? getAttackEdges(bugs, width, height) : 0, getRescueOffer());
  }
  /** A rescue cue: scroll the nearest attacked button into view now; the world pays (and zaps) in
   *  its next step. */
  function rescue(edge:number) {
    if (destroyed || !world || state.status !== 'running' || doc.hidden || state.elapsed < world.s[W.RESCUE_UNTIL]! || pendingRescue) return;
    syncScroll();
    refreshGeometry(true);
    syncViews();
    const offer = getRescueOffer();
    if (offer.mode === 'locked') return;
    let target: Target | null = null, distance = Infinity;
    // Resolve the nearest still-attacked base now, not the one shown last frame.
    for (const bug of bugs) if (attackEdge(bug, width, height) & edge) {
      const r = bug.target!.rect, d = Math.hypot((r.left + r.right) / 2 - width / 2, (r.top + r.bottom) / 2 - height / 2);
      if (d < distance) { target = bug.target; distance = d; }
    }
    if (!target?.element.scrollIntoView) { updateAttackIndicators(); return; }
    // One native instant scroll handles both page and nested containers, even on
    // sites with CSS smooth scrolling. No extra animation loop or scroll lock.
    target.element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    syncScroll();
    invalidateFoodGeometry();
    refreshGeometry(true);
    if (!target.visible) { updateAttackIndicators(); return; }
    const zap = offer.mode === 'zap';
    const r = target.rect, x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
    const radius = Math.min(220, Math.max(140, Math.min(width, height) * .36));
    world.rescue(targets.indexOf(target), zap ? 2 : 1, x, y, radius);
    pendingRescue = true;
    // Move keyboard focus away from a cue that is about to disappear. No clicks.
    target.element.focus?.({ preventScroll: true });
    attackIndicators.update(0);
    notify(true);
  }
  function protectedPointer(path: PointerNode[]) {
    return path.some(element => {
      if (element.closest?.(protectedPointerSelector)) return true;
      const button = element.closest?.('button');
      return button && !button.closest?.(selectors.target);
    });
  }
  function pointerPath(event: Event) {
    return (event.composedPath?.() || [event.target]) as PointerNode[];
  }
  function restoreCursor() {
    if (!cursorElement) return;
    const element = cursorElement;
    cursorElement = null;
    engine?.ledger.unstyle(element, 'cursor');
    if (element.getAttribute('style') === '') element.removeAttribute('style');
  }
  function setCursor(element: HTMLElement | null, path: PointerNode[] = [element!]) {
    if (state.status !== 'running' || !engine || doc.hidden || lastPointer?.type !== 'mouse' || !element?.style || !element.isConnected || protectedPointer(path)) {
      restoreCursor();
      return;
    }
    if (cursorElement === element) return;
    restoreCursor();
    if (engine.ledger.style(element, 'cursor', reticleCursor, 'important')) cursorElement = element;
  }
  function syncCursor() {
    if (!lastPointer || state.status !== 'running' || doc.hidden || lastPointer.type !== 'mouse') { restoreCursor(); return; }
    const element = doc.elementFromPoint?.(lastPointer.x, lastPointer.y) || lastPointer.element;
    setCursor(element as HTMLElement);
  }
  function trackPointer(event: PointerEvent) {
    lastPointer = { x: event.clientX, y: event.clientY, type: event.pointerType || 'mouse', element: event.target as HTMLElement };
    setCursor(event.target as HTMLElement, pointerPath(event));
  }
  function leavePointer() {
    lastPointer = null;
    restoreCursor();
  }
  function addAimEffect(x:number, y:number, kind: AimEffect["kind"]) {
    const total = reducedMotion ? .16 : kind === 'zap' ? .5 : kind === 'kill' ? .36 : kind === 'hit' ? .28 : .24;
    if (aimEffects.length >= MAX_AIM_EFFECTS) aimEffects.shift();
    aimEffects.push({ x, y, kind, life: total, total });
  }
  function pointerDown(event: PointerEvent) {
    // A new physical press replaces any missing compatibility click from the
    // previous press. A genuine miss must never inherit hit suppression.
    suppressedClick = null;
    trackPointer(event);
    if (state.status !== 'running' || !world || event.button > 0 || protectedPointer(pointerPath(event))) return;
    syncScroll();
    refreshGeometry(true);
    const radius = event.pointerType === 'touch' || coarsePointer() ? 31 : 23;
    // The bugs where they are now (the world's arrays), so a press hits what it sees.
    const B = world.bugs;
    let hit = -1, nearest = radius;
    for (let j = 0; j < B.count; j++) {
      if (B.hp[j]! - (pendingSquash.get(B.id[j]!) ?? 0) <= 0) continue;
      const distance = Math.hypot(B.x[j]! - event.clientX, B.y[j]! - event.clientY);
      if (distance <= nearest) { nearest = distance; hit = j; }
    }
    const left = hit >= 0 ? B.hp[hit]! - (pendingSquash.get(B.id[hit]!) ?? 0) : 0;
    addAimEffect(event.clientX, event.clientY, hit >= 0 ? left <= 1 ? 'kill' : 'hit' : 'miss');
    if (hit < 0) return;
    pendingSquash.set(B.id[hit]!, B.hp[hit]! - left + 1);
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressedClick = { x: event.clientX, y: event.clientY, until: win.performance.now() + 700 };
    // The world applies it in its next step (kill, scatter and points, or a hit and a knock back).
    world.squash(B.id[hit]!);
  }
  function clickCapture(event: MouseEvent) {
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
    particles = []; suppressedClick = null; pendingRescue = false; pendingSquash.clear(); invalidated = false;
    checkedId.fill(0); coverCursor = 0; jumps = zaps = remaining = nextWaveIn = 0;
    Object.assign(state, { score: 0, wave: 0, kills: 0, combo: 1, elapsed: 0 });
    scrollX = win.scrollX || 0; scrollY = win.scrollY || 0;
    pausedForVisibility = false;
    ensureCanvas();
    canvas.style.display = 'block';
    // The round: its own engine (seeded per round), the page's letters, the rules.
    engine = createEngine({ step: 1 / 60, maxSteps: 3, seed: 1 + Math.floor(Math.random() * 0x7ffffffe), events: 256, pause: { hidden: false, offscreen: false, editable: false } });
    // Letters need Intl.Segmenter (graphemes); without it, the round is buttons only.
    board = typeof Intl.Segmenter === 'function' ? boardPage(engine, {
      root: doc.body, text: selectors.text, targets: selectors.target, maxTargets: 0, letters: true, reads: READS, color: '#d984ff',
      exclude: '[data-swarm-ui],[data-swarm-ignore],[data-swarm-target],[data-swarm-overlay]',
    }) : noLetters;
    world = W.createWorld(engine, board, ctl);
    engine.add({ read, render, step: () => { pendingRescue = false; if (pendingSquash.size) pendingSquash.clear(); } });
    ctl.fill(0);
    discoverPage();
    refreshGeometry(true);
    board.refresh();
    if (targets.length) releaseHover = guardTargetHover(doc);
    for (const target of targets) {
      target.interactive = target.element.matches?.(':hover, :focus-within') || false;
      target.hovered = !coarsePointer() && (target.element.matches?.(':hover') || false);
      if (target.rendered) paintTarget(target);
    }
    ctl[W.PON] = lastPointer ? 1 : 0;
    if (lastPointer) { ctl[W.PX] = lastPointer.x; ctl[W.PY] = lastPointer.y; }
    ctl[W.COARSE] = coarsePointer() ? 1 : 0;
    ctl[W.CALM] = reducedMotion ? 1 : 0;
    world.reset(targets.length);
    syncState();
    status('running');
    emit('wave-start', { wave: world.s[W.WAVE], count: world.s[W.REMAINING], reason: 'start' });
    schedule();
    return getSnapshot();
  }
  function pause() {
    if (!active()) return getSnapshot();
    pausedFrom = state.status;
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    world?.pause();
    syncViews();
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
    particles = []; suppressedClick = null; pendingRescue = false; remaining = nextWaveIn = 0;
    restorePage();
    targets = []; surfaces = [];
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
    canvasHost = null!; canvas = null!; ctx = null!;
    attackIndicators.destroy();
  }
  on(win, 'pointerdown', pointerDown, { capture: true, passive: false });
  on(win, 'pointermove', trackPointer, { capture: true, passive: true });
  on(win, 'pointerover', trackPointer, { capture: true, passive: true });
  for (const name of ['pointerover', 'pointerout', 'focusin', 'focusout'] as const) on(win, name, targetInteraction, { capture: true, passive: true });
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
