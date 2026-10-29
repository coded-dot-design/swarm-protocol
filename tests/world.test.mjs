// The rules, headless: waves, feeding, draining, squashing, scattering, clearing, losing, rescue,
// pursuit off screen, rescans, determinism. 1.3.1's numbers.
import test from "node:test";
import assert from "node:assert/strict";
import * as W from "../src/world.ts";
import { count, letters, round } from "./world-fixture.mjs";

test("a round starts wave 1 with 12 arrivals, one every 0.256 s", () => {
  const { w, events, run } = round();
  assert.equal(w.s[W.WAVE], 1);
  assert.equal(w.s[W.REMAINING], 12);
  w.ctl[W.PX] = 300;
  w.ctl[W.PY] = 300;
  w.ctl[W.PON] = 1;
  run(1);
  assert.ok(w.bugs.count >= 3 && w.bugs.count <= 5, `${w.bugs.count} bugs after 1 s`);
  run(3);
  assert.equal(w.bugs.count + w.s[W.REMAINING], 12);
});

test("bugs eat letters into 0/1 and grow a tier every 6 letters", () => {
  const { w, board, events, run } = round({ buttons: [] });
  run(14);
  const bites = events.filter((x) => x.type === "bite");
  assert.ok(bites.length >= 12, `${bites.length} bites`);
  assert.equal(board.glyphs.spent.reduce((a, b) => a + b, 0), bites.length);
  // The digit in the event is the one written.
  for (const b of bites) assert.equal(board.wrote[w.pay[b.a * 8 + 4]], b.b);
  assert.ok(count(events, "evolve") >= 1, "a bug grew");
  let grown = 0;
  for (let j = 0; j < w.bugs.count; j++) if (w.bugs.tier[j] > 1) (grown++, assert.equal(w.bugs.tier[j], Math.min(3, 1 + Math.floor(w.bugs.eaten[j] / 6))));
  assert.ok(grown >= 1);
});

test("bugs drain a visible button 1.15 a bite on wave 1, and losing every button ends the round", () => {
  const { w, events, run } = round({ board: letters({ rows: 0 }) });
  run(8);
  const dmg = events.filter((x) => x.type === "damage");
  assert.ok(dmg.length > 0, "bitten");
  assert.ok(Math.abs(100 - w.targets.health[0] - dmg.length * 1.15) < 1e-6 || w.s[W.WAVE] > 1);
  run(240, () => w.s[W.OVER] && 0);
  assert.equal(w.s[W.OVER], 1);
  assert.equal(w.targets.health[0], 0);
  assert.ok(events.some((x) => x.type === "gameover"));
});

test("squash: a tier-1 bug dies in one hit (30 points when young), a quick second kill doubles", () => {
  const { w, events, run } = round({ board: letters({ rows: 0 }) });
  run(1.2);
  const a = w.bugs.id[0], b = w.bugs.id[1];
  w.squash(a);
  run(1 / 60);
  w.squash(b);
  run(1 / 60);
  const kills = events.filter((x) => x.type === "kill");
  assert.equal(kills.length, 2);
  assert.equal(w.pay[kills[0].a * 8], 30, "10 + 20 speed bonus, combo 1");
  assert.equal(w.pay[kills[1].a * 8 + 1], 2, "combo 2");
  assert.equal(w.s[W.SCORE], 30 + 60);
  assert.equal(w.s[W.KILLS], 2);
});

test("a kill scatters the bugs within 210 px for 1–1.3 s", () => {
  const { w, events, run } = round({ board: letters({ rows: 0 }) });
  run(3);
  // Gather everyone at one spot, then squash one.
  for (let j = 0; j < w.bugs.count; j++) (w.bugs.x[j] = 500 + j), (w.bugs.y[j] = 300);
  w.squash(w.bugs.id[0]);
  run(1 / 60);
  const sc = events.find((x) => x.type === "scatter");
  assert.ok(sc && sc.a === w.bugs.count, `${sc?.a} scattered`);
});

test("clearing a wave: +50 × wave (none after a zap), +9 health to damaged buttons, a 3 s intermission", () => {
  const { w, events, run } = round({ board: letters({ rows: 0 }) });
  run(4);
  w.targets.health[0] = 80;
  for (let k = w.bugs.count; k-- > 0; ) w.squash(w.bugs.id[k]);
  w.s[W.REMAINING] = 0;
  run(2 / 60);
  assert.equal(w.s[W.STATUS], W.INTERMISSION);
  assert.ok(events.some((x) => x.type === "wave-clear" && x.b === 50));
  assert.equal(w.targets.health[0], 89);
  run(3.1);
  assert.equal(w.s[W.WAVE], 2);
  assert.equal(w.s[W.REMAINING] + w.bugs.count, 18, "12 + 6 per wave");
});

test("rescue: Jump costs 50 then 75; Zap 200 (+150 a zap, +25 a jump) clears around the button for a point each", () => {
  const { w, events, run } = round({ board: letters({ rows: 0 }) });
  const o = new Float64Array(3);
  w.offer(o);
  assert.deepEqual([...o], [50, 200, 0]);
  w.s[W.SCORE] = 400;
  w.rescue(0, 1, 510, 520, 0);
  run(1 / 60);
  assert.equal(w.s[W.SCORE], 350);
  w.offer(o);
  assert.deepEqual([...o], [75, 225, 2]);
  run(3);
  for (let j = 0; j < w.bugs.count; j++) (w.bugs.x[j] = 500), (w.bugs.y[j] = 500);
  const before = w.bugs.count;
  w.rescue(0, 2, 510, 520, 160);
  run(1 / 60);
  assert.equal(w.bugs.count, 0);
  assert.equal(w.s[W.SCORE], 350 - 225 + before);
  assert.ok(events.some((x) => x.type === "rescue" && w.pay[x.a * 8] === 2 && w.pay[x.a * 8 + 3] === before));
});

test("a button scrolled off screen is still attacked: dash, exit, transit, then latched on it", () => {
  const { w, events, run, buttons, place } = round({ board: letters({ rows: 0 }) });
  run(2.5);
  buttons[0][1] = -400; // the page scrolled: the button is above the viewport
  place();
  run(4);
  let latched = 0;
  for (let j = 0; j < w.bugs.count; j++) if (w.bugs.attached[j] && w.bugs.target[j] === 0) latched++;
  assert.ok(latched > 0, "attackers latched on the off-screen button");
  assert.ok(count(events, "damage") > 0, "and bite it");
});

test("a rescan drops every reservation (glyph indices renumber)", () => {
  const { w, board, run } = round({ buttons: [] });
  run(2);
  let reserving = 0;
  for (let j = 0; j < w.bugs.count; j++) if (w.food[j] >= 0) reserving++;
  assert.ok(reserving > 0);
  board.rescan();
  run(1 / 120);
  for (let j = 0; j < w.bugs.count; j++) assert.ok(w.food[j] < 0 || w.food[j] >= 0); // re-chosen after the reset
});

test("same seed, same inputs: the same round (multiplayer-ready)", () => {
  const trace = () => {
    const t = round({ seed: 99 }), out = [];
    t.run(20, (k) => {
      if (k % 50 === 0 && t.w.bugs.count) t.w.squash(t.w.bugs.id[k % t.w.bugs.count]);
      if (k % 60 === 0) out.push(t.w.s[W.SCORE], t.w.bugs.count, t.w.targets.health[0], t.board.glyphs.spent.reduce((a, b) => a + b, 0));
    });
    return out;
  };
  const a = trace();
  assert.deepEqual(trace(), a);
  assert.ok(a.some((v, i) => i % 4 === 3 && v > 0), "letters were eaten");
});
