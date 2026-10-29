// Swarm Protocol, the rules: the bugs, their food (the page's letters), the buttons they drain,
// the waves, squashing, scoring and the rescue offers, as one Fizlet system. DOM-free: the page
// comes in through `Board` (fizlet/board-page in the game, a fake in tests) for letters, and through
// arrays the game measures in the read phase for the buttons, the host's own UI and the surfaces.
// The pointer (squash) and the rescue keys are queued by the game and applied in the next step.
// Every running number lives in a typed array, so a step never allocates; what happens goes on the
// engine's event ring (rich payloads in `pay`). The numbers are 1.3.1's (`dom-defender.ts`).
import type { Engine, System } from "../vendor/fizlet/kernel/engine";

/** The page's letters (fizlet/board-page satisfies it). */
export interface Board {
  readonly glyphs: { readonly count: number; readonly x: ArrayLike<number>; readonly y: ArrayLike<number>; readonly w: ArrayLike<number>; readonly h: ArrayLike<number>; readonly spent: ArrayLike<number> };
  /** Unspent on-screen glyphs touching the circle p[i], p[i + 1], radius p[i + 2], into `out`. */
  nearAt(p: Float64Array, i: number, out: Int32Array): number;
  consume(i: number, as?: "binary" | "erase" | "0" | "1"): boolean;
  /** Rescans so far (glyph indices renumber on a rescan). */
  readonly scans: number;
}

export const MAX_BUGS = 48, MAX_TARGETS = 32, MAX_UI = 16, MAX_SURFACES = 16;
const WAVE_SECONDS = 18, CHEW_SECONDS = 0.24, LETTERS_PER_TIER = 6;
/** Controls and view (the game writes them in the read phase). */
export const VW = 0, VH = 1, PX = 2, PY = 3, PON = 4, COARSE = 5, CALM = 6;
/** World state slots. */
export const TIME = 0, STATUS = 1, SCORE = 2, WAVE = 3, KILLS = 4, COMBO = 5, COMBO_AT = 6, REMAINING = 7, SPAWN_IN = 8, NEXT_WAVE_IN = 9;
export const ZAP_CLEARED = 10, JUMPS = 11, ZAPS = 12, RESCUE_UNTIL = 13, OVER = 14, SEQ = 15, LOCAL_FOOD = 16, SCANS = 17, FOOD_SCAN_IN = 18, PAY_AT = 19;
/** This step's length (helpers read it here: a number passed to a call V8 doesn't inline boxes). */
const DT = 20, SLOTS = 21;
/** STATUS: running, or the 3 s intermission after a wave is cleared. */
export const RUNNING = 0, INTERMISSION = 1;
/** Bug pursuit of a button that scrolled off screen: none, attack (latched on it), dash, exit, transit. */
export const NONE = 0, ATTACK = 1, DASH = 2, EXIT = 3, TRANSIT = 4;
/** Event payloads: `pay[a * 8 …]` for ring events whose `a` is a payload slot. */
export const PAY_SLOTS = 256;

/** Rescue prices (1.3.1's: separate prices; low funds fall back to navigation, zaps never discounted). */
export function rescueOffer(score: number, jumps: number, zaps: number, out: Float64Array) {
  const jump = 50 + jumps * 25, zap = 200 + zaps * 150 + jumps * 25;
  out[0] = jump;
  out[1] = zap;
  out[2] = score >= zap ? 2 : score >= jump ? 1 : 0; // 2 zap, 1 jump, 0 locked
}


export function createWorld(e: Engine, board: Board, ctl: Float64Array = new Float64Array(8), glyphCap = 8000) {
  const s = new Float64Array(SLOTS), G = board.glyphs;
  // Buttons (the game measures them in the read phase; the order is the page's, fixed for a round):
  // viewport rect, rendered (has a box), visible (rendered and on screen), connected, enrolled.
  const T = MAX_TARGETS;
  const tx = new Float64Array(T), ty = new Float64Array(T), tw = new Float64Array(T), th = new Float64Array(T);
  const trend = new Uint8Array(T), tvis = new Uint8Array(T), tconn = new Uint8Array(T), tenr = new Uint8Array(T);
  // … and their state in the round: health, bites, hit and liquid timers, where the last bite landed.
  const health = new Float64Array(T), bites = new Int32Array(T), hitUntil = new Float64Array(T), liquidUntil = new Float64Array(T), liquidBite = new Float64Array(T);
  // The host page's own UI (bugs keep clear of it) and the surfaces bugs nick (rects l, t, r, b).
  const ui = new Float64Array(MAX_UI * 4), surf = new Float64Array(MAX_SURFACES * 4), svis = new Uint8Array(MAX_SURFACES), sdmg = new Uint8Array(MAX_SURFACES);
  // Bugs, in arrival order.
  const B = MAX_BUGS;
  const id = new Int32Array(B), bx = new Float64Array(B), by = new Float64Array(B), ang = new Float64Array(B), phase = new Float64Array(B), size = new Float64Array(B);
  const tier = new Uint8Array(B), hp = new Uint8Array(B), eaten = new Int32Array(B), flash = new Float64Array(B), speed = new Float64Array(B), age = new Float64Array(B), biteIn = new Float64Array(B);
  const target = new Int16Array(B), siphon = new Float64Array(B), food = new Int32Array(B), lastX = new Float64Array(B), lastY = new Float64Array(B), hasLast = new Uint8Array(B);
  const searchIn = new Float64Array(B), waitUntil = new Float64Array(B), chewing = new Uint8Array(B), chewLeft = new Float64Array(B), chewX = new Float64Array(B), chewY = new Float64Array(B);
  const scatterUntil = new Float64Array(B), scatterX = new Float64Array(B), scatterY = new Float64Array(B), pursuit = new Uint8Array(B), pursuitUntil = new Float64Array(B);
  const dashIn = new Float64Array(B), dashX = new Float64Array(B), dashY = new Float64Array(B), orbit = new Float64Array(B), attached = new Uint8Array(B);
  // Glyph reservations (bug id) and glyphs the game found covered (read phase): reset on a rescan.
  const reserved = new Int32Array(glyphCap), covered = new Uint8Array(glyphCap);
  // Counts: bugs, targets, ui rects, surfaces, visible live targets, available live targets.
  const n = new Int32Array(6), BN = 0, TN = 1, UN = 2, SN = 3, VIS = 4, AVAIL = 5;
  // Queued input: squash (bug id, kind 1 hit / 2 kill was decided at the press), rescue.
  const squash = new Int32Array(MAX_BUGS), sq = new Int32Array(1), rescueQ = new Float64Array(6);
  // Scratch: a query circle, query results, a rescue offer, payloads for rich ring events.
  const qc = new Float64Array(3), out = new Int32Array(256), offer = new Float64Array(3), pay = new Float64Array(PAY_SLOTS * 8);
  const ev = (type: string, a = 0, b = 0, x = 0, y = 0, v = 0) => e.events.emit(type, a, b, x, y, v);
  /** A payload slot for a ring event (8 numbers). */
  function slot() {
    const k = s[PAY_AT]! % PAY_SLOTS;
    s[PAY_AT]!++;
    return k;
  }

  // ---------- Geometry ----------
  // Hot helpers take indices and read points from `pt`: a number passed to a call V8 doesn't inline
  // boxes (one allocation each), and the bug step is too big for V8 to inline them all.
  const pt = new Float64Array(2);
  /** Is pt inside the host's UI (padded m)? */
  const inUI = (m: number) => {
    const x = pt[0]!, y = pt[1]!;
    for (let i = 0, k = n[UN]! * 4; i < k; i += 4) if (x >= ui[i]! - m && x <= ui[i + 2]! + m && y >= ui[i + 1]! - m && y <= ui[i + 3]! + m) return true;
    return false;
  };
  /** Is bug j on button t (padded m)? */
  const onTarget = (t: number, j: number, m: number) => bx[j]! >= tx[t]! - m && bx[j]! <= tx[t]! + tw[t]! + m && by[j]! >= ty[t]! - m && by[j]! <= ty[t]! + th[t]! + m;
  /** Edible now: indexed, unspent, on screen, not covered, not under the host's UI. */
  function edible(g: number) {
    const G = board.glyphs;
    if (g < 0 || g >= G.count || G.spent[g] || !(G.w[g]! > 0) || covered[g]) return false;
    const x = (pt[0] = G.x[g]! + G.w[g]! / 2), y = (pt[1] = G.y[g]! + G.h[g]! / 2);
    return x >= 1 && x <= ctl[VW]! - 1 && y >= 1 && y <= ctl[VH]! - 1 && !inUI(4);
  }

  // ---------- Targets ----------
  function cacheTargets() {
    n[VIS] = n[AVAIL] = 0;
    for (let t = 0; t < n[TN]!; t++)
      if (trend[t] && tconn[t] && health[t]! > 0) {
        n[AVAIL]!++;
        if (tvis[t]) n[VIS]!++;
      }
  }
  const live = (t: number) => trend[t] === 1 && tconn[t] === 1 && health[t]! > 0;
  /** The nearest live button (cost: distance + 0.35 × health), or one at random 35 % of the time.
   *  Tiers 1–2 pick among visible buttons while any is visible. */
  function chooseTarget(j: number) {
    const visOnly = tier[j]! < 3 && n[VIS]! > 0, count = visOnly ? n[VIS]! : n[AVAIL]!;
    if (!count) return -1;
    let nearest = -1, best = Infinity;
    for (let t = 0; t < n[TN]!; t++) {
      if (!live(t) || (visOnly && !tvis[t])) continue;
      const dx = tx[t]! + tw[t]! / 2 - bx[j]!, dy = ty[t]! + th[t]! / 2 - by[j]!, cost = Math.sqrt(dx * dx + dy * dy) + health[t]! * 0.35;
      if (cost < best) (best = cost), (nearest = t);
    }
    let pick = Math.floor(e.random() * count), random = -1;
    for (let t = 0; t < n[TN]! && random < 0; t++) if (live(t) && (!visOnly || tvis[t]) && pick-- === 0) random = t;
    return random >= 0 && e.random() >= 0.65 ? random : nearest;
  }

  // ---------- Food ----------
  function release(j: number) {
    const g = food[j]!;
    if (g >= 0 && g < glyphCap && reserved[g] === id[j]) reserved[g] = 0;
    food[j] = -1;
    chewing[j] = 0;
    chewLeft[j] = 0;
  }
  /** The nearest edible, unreserved glyph to (x, y) within r, preferring ones within `reach` of the bug. */
  function nearest(x: number, y: number, r: number, j: number, reach: number) {
    qc[0] = x;
    qc[1] = y;
    qc[2] = r;
    let best = -1, bd = Infinity;
    for (let k = 0, m = board.nearAt(qc, 0, out); k < m; k++) {
      const g = out[k]!;
      if (g >= glyphCap || reserved[g] || !edible(g)) continue;
      const dx = (G.x[g]! + G.w[g]! / 2) - x, dy = (G.y[g]! + G.h[g]! / 2) - y, d = dx * dx + dy * dy;
      if (d >= bd) continue;
      const ex = (G.x[g]! + G.w[g]! / 2) - bx[j]!, ey = (G.y[g]! + G.h[g]! / 2) - by[j]!;
      if (ex * ex + ey * ey > reach * reach) continue;
      (bd = d), (best = g);
    }
    return best;
  }
  /** Tiers 1–2 keep eating along the same word; otherwise the nearest letter (tier 3: only within
   *  contact, and never while latched on or chasing an off-screen button). */
  function chooseFood(j: number) {
    const t = target[j]!;
    if (tier[j]! >= 3 && (attached[j] || (t >= 0 && !tvis[t]))) return -1;
    if (tier[j]! < 3 && hasLast[j]) {
      const g = nearest(lastX[j]!, lastY[j]!, 30, j, 105);
      if (g >= 0) return g;
    }
    const contact = 8 * size[j]! + 4;
    if (tier[j]! >= 3) return nearest(bx[j]!, by[j]!, contact, j, contact);
    const far = Math.max(ctl[VW]!, ctl[VH]!);
    for (let r = 120; ; r = Math.min(far, r * 2.5)) {
      const g = nearest(bx[j]!, by[j]!, r, j, Infinity);
      if (g >= 0 || r >= far) return g;
    }
  }
  /** Any edible letter left on screen (the swarm stays local while there is). */
  function surveyFood() {
    const G = board.glyphs;
    for (let g = 0; g < G.count && g < glyphCap; g++) if (edible(g)) return 1;
    return 0;
  }
  function eat(j: number, g: number) {
    const digit = e.random() < 0.5 ? 0 : 1;
    if (!board.consume(g, digit ? "1" : "0")) return release(j);
    const x = (G.x[g]! + G.w[g]! / 2), y = (G.y[g]! + G.h[g]! / 2);
    hasLast[j] = 1;
    lastX[j] = x;
    lastY[j] = y;
    release(j);
    searchIn[j] = 0;
    waitUntil[j] = s[TIME]! + 0.35;
    eaten[j]!++;
    const next = Math.min(3, 1 + Math.floor(eaten[j]! / LETTERS_PER_TIER));
    if (next > tier[j]!) {
      hp[j]! += next - tier[j]!;
      size[j]! += 0.18 * (next - tier[j]!);
      tier[j] = next;
      const k = slot();
      pay[k * 8] = id[j]!; pay[k * 8 + 1] = next; pay[k * 8 + 2] = hp[j]!;
      ev("evolve", k, 0, bx[j]!, by[j]!);
    }
    nick(j);
    const k = slot();
    pay[k * 8] = id[j]!; pay[k * 8 + 1] = digit; pay[k * 8 + 2] = eaten[j]!; pay[k * 8 + 3] = tier[j]!; pay[k * 8 + 4] = g;
    ev("bite", k, digit, x, y, bx[j]! - x);
  }
  /** A bug on a [data-swarm-surface] nicks it (at most 12 times). */
  function nick(j: number) {
    for (let i = 0; i < n[SN]!; i++) {
      if (!svis[i] || bx[j]! < surf[i * 4]! - 4 || bx[j]! > surf[i * 4 + 2]! + 4 || by[j]! < surf[i * 4 + 1]! - 4 || by[j]! > surf[i * 4 + 3]! + 4) continue;
      if (sdmg[i]! < 12) sdmg[i]!++, ev("nick", i, sdmg[i]!);
      return;
    }
  }
  /** Chew the reserved letter: true while the bug is busy with it this step. */
  function chew(j: number) {
    const dt = s[DT]!;
    const g = food[j]!;
    if (!chewing[j]) return false;
    if (!edible(g) || reserved[g] !== id[j]) return release(j), false;
    const mouth = 8 * size[j]!, x = (G.x[g]! + G.w[g]! / 2), y = (G.y[g]! + G.h[g]! / 2), mx = bx[j]! + Math.cos(ang[j]!) * mouth, my = by[j]! + Math.sin(ang[j]!) * mouth;
    if ((x - mx) * (x - mx) + (y - my) * (y - my) > 25) return (chewing[j] = 0), (chewLeft[j] = 0), false;
    chewX[j] = x;
    chewY[j] = y;
    if (chewLeft[j]! <= dt) return eat(j, g), true;
    chewLeft[j]! -= dt;
    return true;
  }

  // ---------- Bugs ----------
  function spawn() {
    if (n[BN]! >= MAX_BUGS) return false;
    const W = ctl[VW]!, H = ctl[VH]!, px = ctl[PON] ? ctl[PX]! : W / 2, py = ctl[PON] ? ctl[PY]! : H / 2;
    let x = 0, y = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      // On screen, near the player, never right under the pointer or behind the host's UI.
      const a = (0 + e.random() * (Math.PI * 2 - 0)), r = (90 + e.random() * (Math.min(W, H) * 0.45 + 90 - 90));
      x = Math.max(22, Math.min(Math.max(22, W - 22), px + Math.cos(a) * r));
      y = Math.max(26, Math.min(Math.max(26, H - 26), py + Math.sin(a) * r));
      pt[0] = x;
      pt[1] = y;
      if (!inUI(24) && Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) >= 60) break;
      if (attempt === 11) return false;
    }
    const j = n[BN]!++;
    id[j] = ++s[SEQ]!;
    bx[j] = x; by[j] = y; ang[j] = 0; phase[j] = (0 + e.random() * (Math.PI * 2 - 0)); size[j] = (1.05 + e.random() * (1.18 - 1.05)); tier[j] = 1; hp[j] = 1; eaten[j] = 0; flash[j] = 0;
    speed[j] = ((110 + e.random() * (155 - 110)) + Math.min(80, s[WAVE]! * 8)) * (ctl[COARSE] ? 0.72 : 1);
    age[j] = 0; biteIn[j] = (0.2 + e.random() * (0.8 - 0.2)); siphon[j] = 0; food[j] = -1; hasLast[j] = 0; searchIn[j] = 0; waitUntil[j] = s[TIME]! + 0.45; chewing[j] = 0; chewLeft[j] = 0;
    scatterUntil[j] = 0; scatterX[j] = 0; scatterY[j] = 0; pursuit[j] = NONE; pursuitUntil[j] = 0; dashIn[j] = 0; dashX[j] = 0; dashY[j] = 0; orbit[j] = (0 + e.random() * (Math.PI * 2 - 0)); attached[j] = 0;
    target[j] = -1;
    target[j] = chooseTarget(j);
    return true;
  }
  /** Remove bug j, keeping the others in order (1.3.1 spliced). */
  function remove(j: number) {
    release(j);
    const last = --n[BN]!;
    for (let k = j; k < last; k++) {
      const m = k + 1;
      id[k] = id[m]!; bx[k] = bx[m]!; by[k] = by[m]!; ang[k] = ang[m]!; phase[k] = phase[m]!; size[k] = size[m]!; tier[k] = tier[m]!; hp[k] = hp[m]!; eaten[k] = eaten[m]!; flash[k] = flash[m]!;
      speed[k] = speed[m]!; age[k] = age[m]!; biteIn[k] = biteIn[m]!; target[k] = target[m]!; siphon[k] = siphon[m]!; food[k] = food[m]!; lastX[k] = lastX[m]!; lastY[k] = lastY[m]!; hasLast[k] = hasLast[m]!;
      searchIn[k] = searchIn[m]!; waitUntil[k] = waitUntil[m]!; chewing[k] = chewing[m]!; chewLeft[k] = chewLeft[m]!; chewX[k] = chewX[m]!; chewY[k] = chewY[m]!;
      scatterUntil[k] = scatterUntil[m]!; scatterX[k] = scatterX[m]!; scatterY[k] = scatterY[m]!; pursuit[k] = pursuit[m]!; pursuitUntil[k] = pursuitUntil[m]!;
      dashIn[k] = dashIn[m]!; dashX[k] = dashX[m]!; dashY[k] = dashY[m]!; orbit[k] = orbit[m]!; attached[k] = attached[m]!;
    }
  }
  function damage(t: number, j: number) {
    bites[t]!++;
    siphon[j] = s[TIME]! + 0.16;
    health[t] = Math.max(0, health[t]! - (1.15 + Math.min(s[WAVE]! - 1, 9) * 0.12));
    hitUntil[t] = s[TIME]! + 0.22;
    liquidUntil[t] = s[TIME]! + 0.65;
    liquidBite[t] = Math.max(0, Math.min(1, (bx[j]! - tx[t]!) / Math.max(1, tw[t]!)));
    ev("damage", t, health[t]!, Math.max(tx[t]!, Math.min(tx[t]! + tw[t]!, bx[j]! + Math.cos(ang[j]!) * 8 * size[j]!)), Math.max(ty[t]!, Math.min(ty[t]! + th[t]!, by[j]! + Math.sin(ang[j]!) * 8 * size[j]!)), tier[j]!);
    let playable = 0, down = 0;
    for (let k = 0; k < n[TN]!; k++)
      if (tenr[k] && trend[k] && tconn[k]) (playable++, health[k]! <= 0 && down++);
    if (playable && playable === down) (s[OVER] = 1), ev("gameover");
  }
  /** Where a bug circling button t goes next (the orbit advances). */
  function orbitPoint(j: number, t: number) {
    const dt = s[DT]!;
    orbit[j]! += dt * 1.45;
    qc[0] = tx[t]! + tw[t]! / 2 + Math.cos(orbit[j]!) * Math.max(5, tw[t]! / 2 - 12);
    qc[1] = ty[t]! + th[t]! / 2 + Math.sin(orbit[j]!) * Math.max(5, th[t]! / 2 - 8);
  }
  /** A wild dash point (renewed every 0.16–0.32 s). */
  function wildPoint(j: number) {
    const dt = s[DT]!;
    dashIn[j]! -= dt;
    if (dashIn[j]! <= 0) {
      dashX[j] = (24 + e.random() * (Math.max(25, ctl[VW]! - 24) - 24));
      dashY[j] = (40 + e.random() * (Math.max(41, ctl[VH]! - 40) - 40));
      dashIn[j] = (0.16 + e.random() * (0.32 - 0.16));
    }
    qc[0] = dashX[j]!;
    qc[1] = dashY[j]!;
  }
  function stepBug(j: number) {
    const dt = s[DT]!;
    const W = ctl[VW]!, H = ctl[VH]!, now = s[TIME]!;
    age[j]! += dt;
    flash[j] = Math.max(0, flash[j]! - dt);
    const visibleLive = n[VIS]! > 0, stayLocal = tier[j]! < 3 && (visibleLive || s[LOCAL_FOOD] === 1);
    let t = target[j]!;
    if (t < 0 || !trend[t] || !tconn[t] || health[t]! <= 0 || (tier[j]! < 3 && visibleLive && !tvis[t])) {
      target[j] = chooseTarget(j);
      if (target[j] !== t) (attached[j] = 0), (pursuit[j] = NONE);
      t = target[j]!;
    }
    const scattering = now < scatterUntil[j]!;
    if (!scattering) {
      if (food[j]! >= 0 && (!edible(food[j]!) || reserved[food[j]!] !== id[j])) release(j);
      searchIn[j]! -= dt;
      if (food[j]! < 0 && searchIn[j]! <= 0) {
        const g = chooseFood(j);
        if (g >= 0) (food[j] = g), (reserved[g] = id[j]!);
        searchIn[j] = tier[j]! >= 3 ? 0.22 : 0.14;
      }
      if (food[j]! >= 0) {
        pursuit[j] = NONE;
        attached[j] = 0;
        if (chew(j)) return;
      }
    }
    const hasFood = food[j]! >= 0, tv = t >= 0 && tvis[t] === 1;
    // Latch onto a visible button for the instant a bite takes power; the bite timer runs on.
    if (!scattering && !hasFood && attached[j] && tv && health[t]! > 0 && siphon[j]! > now && onTarget(t, j, 6)) {
      biteIn[j]! -= dt;
      return;
    }
    let pinned = false, gxp = 0, gyp = 0;
    if ((tv || stayLocal) && pursuit[j]) {
      // An attacker stays on its own button when scrolling brings it back.
      if (pursuit[j] === ATTACK && tv) orbitPoint(j, t), (bx[j] = qc[0]!), (by[j] = qc[1]!);
      pursuit[j] = NONE;
    }
    if (scattering) (gxp = scatterX[j]!), (gyp = scatterY[j]!), (attached[j] = 0);
    else if (hasFood) (gxp = (G.x[food[j]!]! + G.w[food[j]!]! / 2)), (gyp = (G.y[food[j]!]! + G.h[food[j]!]! / 2)), (attached[j] = 0);
    else if (tier[j]! < 3 && now < waitUntil[j]!) (attached[j] = 0), wildPoint(j), (gxp = qc[0]!), (gyp = qc[1]!);
    else if (stayLocal && !tv) (pursuit[j] = NONE), (attached[j] = 0), wildPoint(j), (gxp = qc[0]!), (gyp = qc[1]!);
    else if (t >= 0 && !tv) {
      // Scrolling away does not suspend attacks: dash around, leave toward the button, then finish
      // the short journey off canvas and latch on.
      if (!pursuit[j]) (pursuit[j] = attached[j] ? ATTACK : DASH), (pursuitUntil[j] = now + (0.65 + e.random() * (1.1 - 0.65))), (dashIn[j] = 0);
      if (pursuit[j] === DASH && now >= pursuitUntil[j]!) pursuit[j] = EXIT;
      if (pursuit[j] === EXIT && (bx[j]! < -36 || bx[j]! > W + 36 || by[j]! < -36 || by[j]! > H + 36)) (pursuit[j] = TRANSIT), (pursuitUntil[j] = now + (0.45 + e.random() * (0.8 - 0.45)));
      if (pursuit[j] === TRANSIT && now >= pursuitUntil[j]!) pursuit[j] = ATTACK;
      attached[j] = 0;
      if (pursuit[j] === ATTACK) {
        orbitPoint(j, t);
        const dx = qc[0]! - bx[j]!, dy = qc[1]! - by[j]!;
        if (dx * dx + dy * dy > 0.01) ang[j] = Math.atan2(dy, dx);
        bx[j] = gxp = qc[0]!;
        by[j] = gyp = qc[1]!;
        attached[j] = 1;
        pinned = true;
      } else if (pursuit[j] === DASH) wildPoint(j), (gxp = qc[0]!), (gyp = qc[1]!);
      else {
        gxp = Math.max(24, Math.min(W - 24, tx[t]! + tw[t]! / 2));
        gyp = Math.max(24, Math.min(H - 24, ty[t]! + th[t]! / 2));
        if (ty[t]! + th[t]! <= 0) gyp = -80;
        else if (ty[t]! >= H) gyp = H + 80;
        if (tx[t]! + tw[t]! <= 0) gxp = -80;
        else if (tx[t]! >= W) gxp = W + 80;
      }
    } else if (t < 0) (pursuit[j] = NONE), (attached[j] = 0), wildPoint(j), (gxp = qc[0]!), (gyp = qc[1]!);
    else orbitPoint(j, t), (gxp = qc[0]!), (gyp = qc[1]!), (attached[j] = onTarget(t, j, 6) ? 1 : 0);
    // Keep clear of the host's UI (exiting crawlers may pass behind it to reach an off-screen button).
    if (!(pinned || pursuit[j] === EXIT || pursuit[j] === TRANSIT))
      for (let i = 0, k = n[UN]! * 4; i < k; i += 4) {
        const l = ui[i]!, tp = ui[i + 1]!, r = ui[i + 2]!, b = ui[i + 3]!;
        if (!(gxp >= l - 18 && gxp <= r + 18 && gyp >= tp - 18 && gyp <= b + 18) && !(bx[j]! >= l - 22 && bx[j]! <= r + 22 && by[j]! >= tp - 22 && by[j]! <= b + 22)) continue;
        const d0 = Math.abs(bx[j]! - l), d1 = Math.abs(bx[j]! - r), d2 = Math.abs(by[j]! - tp), d3 = Math.abs(by[j]! - b), m = Math.min(d0, d1, d2, d3);
        if (m === d0) gxp = l - 30;
        else if (m === d1) gxp = r + 30;
        else if (m === d2) gyp = tp - 30;
        else gyp = b + 30;
        attached[j] = 0;
      }
    if (!pinned) {
      const dx = gxp - bx[j]!, dy = gyp - by[j]!, dist = Math.sqrt(dx * dx + dy * dy);
      let delta = Math.atan2(dy, dx) - ang[j]!;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const fast = scattering || (!stayLocal && !tv);
      ang[j]! += delta * Math.min(1, dt * (fast ? 16 : 11));
      const travel = Math.min(dist, speed[j]! * (scattering ? 1.8 : !stayLocal && !tv ? 1.3 : attached[j] ? 0.7 : 1) * dt);
      const sway = ctl[CALM] || hasFood ? 0 : Math.sin(age[j]! * 8 + phase[j]!) * 9 * dt;
      bx[j]! += Math.cos(ang[j]!) * travel + Math.sin(ang[j]!) * sway;
      by[j]! += Math.sin(ang[j]!) * travel - Math.cos(ang[j]!) * sway;
    }
    if (!scattering && food[j]! >= 0 && !chewing[j]) {
      // Only an edible letter under the mouth can begin a bite (it is checked again as it ends).
      const g = food[j]!, x = (G.x[g]! + G.w[g]! / 2), y = (G.y[g]! + G.h[g]! / 2), reach = 8 * size[j]! + 4;
      if ((x - bx[j]!) * (x - bx[j]!) + (y - by[j]!) * (y - by[j]!) <= reach * reach) {
        if (edible(g)) {
          ang[j] = Math.atan2(y - by[j]!, x - bx[j]!);
          bx[j] = x - Math.cos(ang[j]!) * 8 * size[j]!;
          by[j] = y - Math.sin(ang[j]!) * 8 * size[j]!;
          chewing[j] = 1;
          chewLeft[j] = CHEW_SECONDS;
          chewX[j] = x;
          chewY[j] = y;
        } else release(j);
      }
    }
    if (attached[j] && t >= 0 && health[t]! > 0 && (biteIn[j]! -= dt) <= 0) damage(t, j), (biteIn[j] = (0.72 + e.random() * (1.1 - 0.72)));
  }

  // ---------- Squash, scatter, rescue ----------
  function scatter(k: number) {
    let count = 0;
    const kx = bx[k]!, ky = by[k]!, W = ctl[VW]!, H = ctl[VH]!;
    for (let j = 0; j < n[BN]!; j++) {
      if (j === k) continue;
      const dx = bx[j]! - kx, dy = by[j]! - ky;
      if (Math.sqrt(dx * dx + dy * dy) > 210) continue;
      const away = Math.atan2(dy, dx) + (-0.4 + e.random() * (0.4 - -0.4)), a = Number.isFinite(away) ? away : (0 + e.random() * (Math.PI * 2 - 0));
      scatterX[j] = Math.max(22, Math.min(W - 22, bx[j]! + Math.cos(a) * (115 + e.random() * (175 - 115))));
      scatterY[j] = Math.max(32, Math.min(H - 30, by[j]! + Math.sin(a) * (100 + e.random() * (160 - 100))));
      const sx = scatterX[j]! - bx[j]!, sy = scatterY[j]! - by[j]!;
      if (Math.sqrt(sx * sx + sy * sy) < 55) {
        const inward = Math.atan2(H / 2 - by[j]!, W / 2 - bx[j]!) + (-0.8 + e.random() * (0.8 - -0.8));
        scatterX[j] = Math.max(22, Math.min(W - 22, bx[j]! + Math.cos(inward) * 125));
        scatterY[j] = Math.max(32, Math.min(H - 30, by[j]! + Math.sin(inward) * 125));
      }
      scatterUntil[j] = s[TIME]! + (1 + e.random() * (1.3 - 1));
      ang[j] = Math.atan2(scatterY[j]! - by[j]!, scatterX[j]! - bx[j]!);
      attached[j] = 0;
      pursuit[j] = NONE;
      release(j);
      searchIn[j] = 0;
      orbit[j] = a + (-1.2 + e.random() * (1.2 - -1.2));
      biteIn[j] = Math.max(biteIn[j]!, 0.5);
      count++;
    }
    if (count) ev("scatter", count, target[k]!, kx, ky);
  }
  function kill(j: number) {
    s[ZAP_CLEARED] = 0;
    scatter(j);
    const now = s[TIME]!;
    s[COMBO] = now - s[COMBO_AT]! <= 1.5 ? Math.min(4, s[COMBO]! + 1) : 1;
    s[COMBO_AT] = now;
    const speedBonus = age[j]! < 3 ? 20 : age[j]! < 6 ? 10 : 0, tierBonus = 10 * (tier[j]! - 1), points = (10 + speedBonus + tierBonus) * s[COMBO]!;
    s[SCORE]! += points;
    s[KILLS]!++;
    const k = slot();
    pay[k * 8] = points; pay[k * 8 + 1] = s[COMBO]!; pay[k * 8 + 2] = speedBonus; pay[k * 8 + 3] = tierBonus; pay[k * 8 + 4] = tier[j]!; pay[k * 8 + 5] = age[j]!;
    ev("kill", k, tier[j]!, bx[j]!, by[j]!);
    remove(j);
  }
  /** Squashes queued by the game's pointer handler (it decided hit or kill at the press). */
  function applySquash() {
    for (let q = 0; q < sq[0]!; q++) {
      let j = -1;
      for (let k = 0; k < n[BN]!; k++) if (id[k] === squash[q]) j = k;
      if (j < 0) continue;
      if (--hp[j]! <= 0) kill(j);
      else {
        release(j);
        searchIn[j] = 0.15;
        flash[j] = 0.15;
        bx[j] = Math.max(8, Math.min(ctl[VW]! - 8, bx[j]! - Math.cos(ang[j]!) * 12));
        by[j] = Math.max(8, Math.min(ctl[VH]! - 8, by[j]! - Math.sin(ang[j]!) * 12));
        biteIn[j] = Math.max(biteIn[j]!, 0.45);
        const k = slot();
        pay[k * 8] = id[j]!; pay[k * 8 + 1] = tier[j]!; pay[k * 8 + 2] = hp[j]!;
        ev("hit", k, 0, bx[j]!, by[j]!);
      }
    }
    sq[0] = 0;
  }
  /** A rescue the game started (it scrolled the button into view): pay, and for a zap, clear around it. */
  function applyRescue() {
    if (!rescueQ[0]) return;
    rescueQ[0] = 0;
    const zap = rescueQ[1] === 2, t = rescueQ[2]!, x = rescueQ[3]!, y = rescueQ[4]!, radius = rescueQ[5]!;
    rescueOffer(s[SCORE]!, s[JUMPS]!, s[ZAPS]!, offer);
    if (!offer[2] || (zap && offer[2] !== 2)) return;
    const cost = zap ? offer[1]! : offer[0]!;
    s[SCORE]! -= cost;
    s[JUMPS]!++;
    if (zap) s[ZAPS]!++;
    s[RESCUE_UNTIL] = s[TIME]! + 0.75;
    let killed = 0;
    if (zap) {
      for (let j = n[BN]! - 1; j >= 0; j--) {
        const dx = bx[j]! - x, dy = by[j]! - y;
        if (Math.sqrt(dx * dx + dy * dy) <= radius) remove(j), killed++;
      }
      s[KILLS]! += killed;
      s[SCORE]! += killed; // one point each: no combos, speed or tier multiplier
      s[COMBO] = 1;
      s[COMBO_AT] = -Infinity;
      s[ZAP_CLEARED] = n[BN]! ? 0 : 1; // no wave-clear payout for a zap finishing the wave
    }
    const k = slot();
    pay[k * 8] = zap ? 2 : 1; pay[k * 8 + 1] = t; pay[k * 8 + 2] = cost; pay[k * 8 + 3] = killed; pay[k * 8 + 4] = zap ? radius : 0;
    ev("rescue", k, 0, x, y);
  }

  // ---------- Waves ----------
  function startWave(reason: 0 | 1 | 2) {
    s[WAVE]!++;
    s[ZAP_CLEARED] = 0;
    const arrivals = Math.max(0, Math.min(MAX_BUGS - n[BN]! - s[REMAINING]!, 12 + (s[WAVE]! - 1) * 6));
    s[REMAINING]! += arrivals;
    s[SPAWN_IN] = 0.1;
    s[NEXT_WAVE_IN] = WAVE_SECONDS;
    s[STATUS] = RUNNING;
    ev("wave-start", s[WAVE]!, arrivals, 0, 0, reason);
  }
  function clearWave() {
    const bonus = s[ZAP_CLEARED] ? 0 : s[WAVE]! * 50;
    s[SCORE]! += bonus;
    s[COMBO] = 1;
    for (let t = 0; t < n[TN]!; t++) if (health[t]! > 0 && health[t]! < 100) health[t] = Math.min(100, health[t]! + 9);
    s[NEXT_WAVE_IN] = 3;
    s[STATUS] = INTERMISSION;
    ev("wave-clear", s[WAVE]!, bonus);
  }

  function step(dt: number) {
    if (s[OVER]) return;
    s[DT] = dt;
    s[TIME]! += dt;
    // A rescan renumbers the letters: reservations and covered marks start over.
    if (board.scans !== s[SCANS]) {
      s[SCANS] = board.scans;
      reserved.fill(0);
      covered.fill(0);
      for (let j = 0; j < n[BN]!; j++) (food[j] = -1), (chewing[j] = 0);
    }
    cacheTargets();
    if ((s[FOOD_SCAN_IN]! -= dt) <= 0) (s[FOOD_SCAN_IN] = 0.1), (s[LOCAL_FOOD] = surveyFood());
    applySquash();
    applyRescue();
    if (s[TIME]! - s[COMBO_AT]! > 1.5) s[COMBO] = 1;
    if (s[STATUS] === INTERMISSION) {
      if ((s[NEXT_WAVE_IN]! -= dt) <= 0) startWave(2);
      return;
    }
    if ((s[NEXT_WAVE_IN]! -= dt) <= 0) startWave(1);
    s[SPAWN_IN]! -= dt;
    if (s[REMAINING]! > 0 && s[SPAWN_IN]! <= 0) {
      if (spawn()) s[REMAINING]!--;
      s[SPAWN_IN] = Math.max(0.1, 0.27 - s[WAVE]! * 0.014);
    }
    for (let j = 0; j < n[BN]! && !s[OVER]; j++) stepBug(j);
    if (!n[BN] && !s[REMAINING] && s[STATUS] === RUNNING && !s[OVER]) clearWave();
  }
  const system: System = { step: (_e, dt) => step(dt) };
  e.add(system);

  /** A fresh round: the targets (count) and their first measurements are already written. */
  function reset(targets: number) {
    s.fill(0);
    s[COMBO] = 1;
    s[COMBO_AT] = -Infinity;
    s[SCANS] = board.scans;
    n.fill(0);
    n[TN] = Math.min(MAX_TARGETS, targets);
    health.fill(100);
    bites.fill(0);
    hitUntil.fill(0);
    liquidUntil.fill(0);
    liquidBite.fill(0.5);
    sdmg.fill(0);
    reserved.fill(0);
    covered.fill(0);
    sq[0] = 0;
    rescueQ[0] = 0;
    cacheTargets();
    startWave(0);
  }
  /** The page scrolled by (dx, dy): free bugs stay in document space (attached ones follow their button). */
  function scroll(dx: number, dy: number) {
    for (let j = 0; j < n[BN]!; j++) {
      if (!attached[j]) (bx[j]! -= dx), (by[j]! -= dy);
      scatterX[j]! -= dx;
      scatterY[j]! -= dy;
    }
  }
  /** Button t moved by (dx, dy) between measurements: bugs latched on it move with it. */
  function follow(t: number, dx: number, dy: number) {
    for (let j = 0; j < n[BN]!; j++) if (attached[j] && target[j] === t) (bx[j]! += dx), (by[j]! += dy);
  }
  /** Scroll or resize: every bug lets go of its letter and looks again shortly (1.3.1's rule). */
  function invalidate() {
    for (let j = 0; j < n[BN]!; j++) release(j), (searchIn[j] = 0), (waitUntil[j] = s[TIME]! + 0.25);
  }
  /** Pause: no half-finished chews. */
  function pause() {
    for (let j = 0; j < n[BN]!; j++) (chewing[j] = 0), (chewLeft[j] = 0);
  }

  return {
    s,
    ctl,
    pay,
    targets: { tx, ty, tw, th, rendered: trend, visible: tvis, connected: tconn, enrolled: tenr, health, bites, hitUntil, liquidUntil, liquidBite, get count() { return n[TN]!; } },
    bugs: { id, x: bx, y: by, angle: ang, phase, size, tier, hp, flash, age, target, siphon, attached, chewing, chewX, chewY, eaten, get count() { return n[BN]!; } },
    ui: { rects: ui, set(count: number) { n[UN] = Math.min(MAX_UI, count); } },
    surfaces: { rects: surf, visible: svis, damage: sdmg, set(count: number) { n[SN] = Math.min(MAX_SURFACES, count); } },
    /** Glyphs a bug reserved this frame (the game checks what covers them in the read phase). */
    food,
    /** Mark glyph g covered by something else (read phase): bugs leave it. */
    cover(g: number) {
      if (g >= 0 && g < glyphCap) covered[g] = 1;
    },
    /** The pointer squashed bug `bugId` (the game's handler decided it was hit). */
    squash(bugId: number) {
      if (sq[0]! < squash.length) squash[sq[0]!++] = bugId;
    },
    /** A rescue the game started at button t (centre x, y): mode 1 jump, 2 zap. */
    rescue(t: number, mode: 1 | 2, x: number, y: number, radius: number) {
      rescueQ[0] = 1; rescueQ[1] = mode; rescueQ[2] = t; rescueQ[3] = x; rescueQ[4] = y; rescueQ[5] = radius;
    },
    offer(outOffer: Float64Array) {
      rescueOffer(s[SCORE]!, s[JUMPS]!, s[ZAPS]!, outOffer);
    },
    reset,
    scroll,
    follow,
    invalidate,
    pause,
    step,
    system,
  };
}
export type World = ReturnType<typeof createWorld>;
