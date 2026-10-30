// A local stand-in for the coming `fizlet/announce` brick (same contract), so a later Fizlet sync
// only swaps this import. One polite live region per document, rate-limited and change-only.
export interface Announcer {
  /** Queue `text` under `key`; a newer text for the same key replaces the pending one. */
  say(key: string, text: string): void;
  /** Write everything pending now (for win / lose / game over). */
  flush(): void;
  /** Clear timers; remove the region only if this announcer created it. */
  destroy(): void;
}

/** At most one write per `gap` seconds; a write joins pending texts in first-queued order. */
export function announcer({ gap = 1, doc = document }: { gap?: number; doc?: Document } = {}): Announcer {
  const pending = new Map<string, string>(), now = () => Date.now();
  let region: HTMLElement | null = null, own = false, timer: ReturnType<typeof setTimeout> | 0 = 0, last = -Infinity;
  function flush() {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!pending.size || !doc.body) return;
    let text = [...pending.values()].join('. ');
    pending.clear();
    if (!region?.isConnected) {
      region = doc.querySelector<HTMLElement>('[data-fz-announce]');
      if (!region) {
        region = doc.createElement('div');
        region.setAttribute('data-fz-announce', '');
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.setAttribute('style', 'position:fixed;clip-path:inset(50%);white-space:nowrap');
        doc.body.append(region);
        own = true;
      }
    }
    // The same words again must still be read: toggle a trailing space.
    if (region.textContent === text) text += ' ';
    region.textContent = text;
    last = now();
  }
  return {
    say(key, text) {
      pending.set(key, text);
      if (!timer) timer = setTimeout(flush, Math.max(0, last + gap * 1000 - now()));
    },
    flush,
    destroy() {
      if (timer) clearTimeout(timer);
      timer = 0;
      pending.clear();
      if (own) region?.remove();
      region = null;
      own = false;
    },
  };
}
