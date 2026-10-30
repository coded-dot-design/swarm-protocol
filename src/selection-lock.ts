/** One reversible mobile selection policy, shared even by separately bundled games. */
const key = Symbol.for("dom-virus.selection-lock");
interface Lease {
  owners: Set<symbol>;
  style: HTMLStyleElement;
}
type SelectionDocument = Document & { [key]?: Lease };
export function createMobileSelectionLock(document: Document) {
  const doc = document as SelectionDocument;
  const owner = Symbol();
  return {
    setActive(active: boolean) {
      let lease = doc[key];
      if (!active) {
        if (lease?.owners.delete(owner) && !lease.owners.size) {
          lease.style.remove();
          delete doc[key];
        }
        return;
      }
      if (!lease) {
        const style = doc.createElement("style");
        style.dataset.domVirusSelection = "";
        style.textContent = `@media(pointer:coarse),(max-width:600px){
body,body *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
body :is(input,textarea,[contenteditable]:not([contenteditable=false])),body [contenteditable]:not([contenteditable=false]) *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}
}`;
        lease = doc[key] = { owners: new Set(), style };
        (doc.head || doc.documentElement).append(style);
      }
      lease.owners.add(owner);
      // A selection made before launch must not leave mobile handles on the board.
      const selection = doc.getSelection?.();
      const anchor = selection?.anchorNode;
      const element =
        anchor?.nodeType === 1 ? (anchor as Element) : anchor?.parentElement;
      if (
        doc.defaultView?.matchMedia?.("(pointer:coarse),(max-width:600px)")
          .matches &&
        !element?.closest("input,textarea,[contenteditable]")
      )
        selection?.removeAllRanges();
    },
  };
}
