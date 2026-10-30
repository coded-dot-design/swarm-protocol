// The test page for the world: a Fizlet engine stepped by hand, a fake board of letters (a grid
// of 8 × 14 px glyphs, like fizlet/board-page: nearAt on circles, consume, scans) and buttons.
import { createEngine } from "../vendor/fizlet/index.ts";
import * as W from "../src/world.ts";

/** Letters in rows: `rows` × `cols` glyphs from (x0, y0), 10 px apart, 24 px between rows. */
export function letters({ rows = 6, cols = 40, x0 = 100, y0 = 120 } = {}) {
  const n = rows * cols, x = new Float64Array(n), y = new Float64Array(n), w = new Float64Array(n).fill(8), h = new Float64Array(n).fill(14), spent = new Uint8Array(n), wrote = new Uint8Array(n).fill(9);
  for (let i = 0; i < n; i++) (x[i] = x0 + (i % cols) * 10), (y[i] = y0 + Math.floor(i / cols) * 24);
  const s = new Int32Array(1);
  return {
    glyphs: { get count() { return n; }, x, y, w, h, spent },
    wrote,
    get scans() { return s[0]; },
    rescan() { s[0]++; },
    nearAt(p, at, out) {
      const px = p[at], py = p[at + 1], r = p[at + 2];
      let m = 0;
      for (let i = 0; i < n && m < out.length; i++) {
        if (spent[i] || !(w[i] > 0)) continue;
        const dx = px - Math.max(x[i], Math.min(px, x[i] + w[i])), dy = py - Math.max(y[i], Math.min(py, y[i] + h[i]));
        if (dx * dx + dy * dy <= r * r) out[m++] = i;
      }
      return m;
    },
    consume(i, as) {
      if (spent[i]) return false;
      spent[i] = 1;
      wrote[i] = as === "1" ? 1 : as === "0" ? 0 : 2;
      w[i] = 0;
      return true;
    },
  };
}
/** A round: viewport 1000 × 800, buttons as [x, y, w, h] (all rendered, visible when on screen). */
export function round({ buttons = [[450, 500, 120, 40]], board = letters(), seed = 7, step = 1 / 60 } = {}) {
  const e = createEngine({ seed, step, events: 1024 });
  const w = W.createWorld(e, board);
  w.ctl[W.VW] = 1000;
  w.ctl[W.VH] = 800;
  const T = w.targets;
  const place = () => {
    buttons.forEach(([x, y, bw, bh], t) => {
      T.tx[t] = x; T.ty[t] = y; T.tw[t] = bw; T.th[t] = bh;
      T.rendered[t] = T.connected[t] = T.enrolled[t] = 1;
      T.visible[t] = x + bw > 0 && y + bh > 0 && x < 1000 && y < 800 ? 1 : 0;
    });
  };
  place();
  w.reset(buttons.length);
  const events = [];
  const run = (sec, each) => {
    for (let k = 0, m = Math.round(sec / step); k < m; k++) {
      each?.(k);
      e.advance(step);
      for (let i = 0; i < e.events.size; i++) {
        const ev = e.events.at(i);
        events.push({ type: ev.type, a: ev.a, b: ev.b, x: ev.x, y: ev.y, v: ev.v });
      }
    }
  };
  return { e, w, board, events, run, place, buttons };
}
export const count = (events, type) => events.filter((x) => x.type === type).length;
