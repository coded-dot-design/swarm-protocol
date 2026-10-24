/** Reversible mobile gesture policy. Native scrolling remains browser-owned. */
export function createMobileZoomLock(doc: Document, enabled = true) {
  const win = doc.defaultView;
  const root = doc.documentElement;
  let restore: (() => void) | null = null;
  const prevent = (event: Event) => { if (event.cancelable) event.preventDefault(); };
  return {
    setActive(active: boolean) {
      if (!active) { restore?.(); restore = null; return; }
      if (restore || !enabled || !win?.matchMedia?.('(pointer: coarse), (max-width: 600px)').matches) return;
      const style = root.style, hadStyle = root.hasAttribute('style');
      const original = style.getPropertyValue('touch-action'), priority = style.getPropertyPriority('touch-action');
      const current = win.getComputedStyle(root).touchAction || 'auto';
      // Keep any host restrictions on panning. Only remove zoom permission.
      const locked = current === 'auto' || current === 'manipulation' ? 'pan-x pan-y' : current.replace(/\bpinch-zoom\b/g, '').trim() || 'pan-x pan-y';
      style.setProperty('touch-action', locked, 'important');
      const owned = style.getPropertyValue('touch-action');
      // Safari's legacy gesture events supplement the native CSS policy.
      doc.addEventListener('gesturestart', prevent, {passive:false});
      doc.addEventListener('gesturechange', prevent, {passive:false});
      restore = () => {
        doc.removeEventListener('gesturestart', prevent);
        doc.removeEventListener('gesturechange', prevent);
        if (style.getPropertyValue('touch-action') === owned && style.getPropertyPriority('touch-action') === 'important') {
          if (original) style.setProperty('touch-action', original, priority);
          else style.removeProperty('touch-action');
          if (!hadStyle && !root.getAttribute('style')?.trim()) root.removeAttribute('style');
        }
      };
    },
  };
}
