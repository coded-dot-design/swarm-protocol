import type { CSSRuleView } from './runtime-types.js';
import { cssLayers } from './target-palette.js';

export const hoverLock = 'data-swarm-hover-locked';

// Disable native hover selectors only inside powered targets. This also covers
// labels, SVG icons, pseudo-elements and ancestor/group hover rules without
// copying computed styles onto every child. No pointer/click events are blocked.
export function guardTargetHover(doc: Document) {
  const edits: [CSSRuleView,string,string][] = [], visited = new Set<CSSStyleSheet>();
  const exclusion = `:not(:where([${hoverLock}="active"],[${hoverLock}="active"] *))`;
  function walk(rules: CSSRuleList, inheritedHover = false) {
    for (const rule of (rules || []) as unknown as CSSRuleView[]) {
      const original = rule.selectorText;
      const hover = inheritedHover || /:hover\b/.test(original || '');
      if (original && hover) {
        const selector = cssLayers(original).map(part => {
          if (!inheritedHover && !/:hover\b/.test(part)) return part;
          // Negative hover rules describe the normal appearance; keep them
          // matched while the pointer is over an active button.
          const positiveHover = /:hover\b/.test(part.replace(/:not\(\s*:hover\s*\)/g, ''));
          part = part.replace(/:hover\b/g, `:hover${exclusion}`);
          if (!inheritedHover && !positiveHover) return part;
          // Pseudo-elements must remain at the end of their compound selector.
          const at = part.search(/::[\w-]+(?:\([^)]*\))?(?:::[\w-]+)*\s*$/);
          return at < 0 ? part + exclusion : part.slice(0, at) + exclusion + part.slice(at);
        }).join(',');
        try {
          rule.selectorText = selector;
          if (rule.selectorText !== original) edits.push([rule, original, rule.selectorText]);
        } catch { /* Some host stylesheets are read-only. */ }
      }
      if (rule.styleSheet) visit(rule.styleSheet);
      else if (rule.cssRules) walk(rule.cssRules, hover);
    }
  }
  function visit(sheet: CSSStyleSheet) {
    if (visited.has(sheet)) return;
    visited.add(sheet);
    try { walk(sheet.cssRules); } catch { /* Cross-origin CSS is not readable. */ }
  }
  for (const sheet of [...doc.styleSheets || [], ...doc.adoptedStyleSheets || []]) visit(sheet);
  return () => {
    for (const [rule, original, latest] of edits) {
      // A newer CSSOM update belongs to the host.
      try { if (rule.selectorText === latest) rule.selectorText = original; } catch {}
    }
  };
}
