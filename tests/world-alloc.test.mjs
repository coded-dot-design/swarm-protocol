// Zero allocation, in its own process (node --test runs each file alone): a busy round steps
// without a minor GC.
import test from "node:test";
import assert from "node:assert/strict";
import * as W from "../src/world.ts";
import { letters, round } from "./world-fixture.mjs";
import { minorGCs } from "./gc.mjs";

test("a busy round steps without allocating (no minor GC in 20 000 steps)", async () => {
  const t = round({ board: letters({ rows: 30, cols: 80, x0: 20, y0: 20 }), buttons: [[450, 500, 120, 40], [100, 700, 90, 30], [800, -300, 90, 30]] });
  const { w } = t;
  const frames = (n) => {
    for (let k = 0; k < n; k++) {
      if (k % 40 === 0 && w.bugs.count) w.squash(w.bugs.id[k % w.bugs.count]);
      if (w.s[W.OVER]) (w.s[W.OVER] = 0), w.targets.health.fill(100);
      if (k % 900 === 0) t.board.glyphs.spent.fill(0), t.board.glyphs.w.fill(8);
      t.e.advance(1 / 60);
    }
  };
  frames(20000);
  const gcs = await minorGCs(() => frames(20000));
  assert.ok(w.s[W.KILLS] > 0, "bugs were squashed");
  assert.equal(gcs, 0);
});
