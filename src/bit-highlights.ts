/** Native paint for real mutated text. No wrappers, geometry reads or frame loop. */
import type { TextRecord } from './runtime-types.js';
let sequence = 0;
export function createBitHighlights(doc: Document) {
  const win = doc.defaultView!;
  const name = `swarm-bits-${++sequence}`;
  let highlight: Highlight | null = null, style: HTMLStyleElement | null = null;
  const ranges = new Map<TextRecord, Map<number, Range>>();
  let count = 0;
  return {
    update(record: TextRecord) {
      if (!win.CSS?.highlights || !win.Highlight) return;
      if (!highlight) {
        highlight = new win.Highlight();
        style = doc.createElement('style');
        style.textContent = `::highlight(${name}){color:rgb(0 110 150 / .72)}@media(prefers-color-scheme:dark){::highlight(${name}){color:rgb(88 219 224 / .72)}}`;
        doc.head.append(style);
        win.CSS.highlights.set(name, highlight);
      }
      let owned = ranges.get(record);
      if (!owned) { owned = new Map(); ranges.set(record, owned); }
      // nodeValue writes collapse live Ranges; repair offsets only on mutation.
      for (const glyph of record.glyphs) if (glyph.eaten) {
        let range = owned.get(glyph.index);
        if (!range) {
          if (count >= 8000) continue;
          range = doc.createRange(); owned.set(glyph.index, range);
          highlight.add(range); count++;
        }
        const start = record.offsets[glyph.index];
        range.setStart(record.node, start); range.setEnd(record.node, start + 1);
      }
    },
    destroy() {
      if (win.CSS?.highlights?.get(name) === highlight) win.CSS.highlights.delete(name);
      style?.remove(); style = null; highlight = null; ranges.clear(); count = 0;
    },
  };
}
