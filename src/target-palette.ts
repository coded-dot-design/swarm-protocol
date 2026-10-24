import type { CSSRuleView, Palette } from './runtime-types.js';
export function cssLayers(value:string) {
  const layers = [];
  let depth = 0, start = 0, quote = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) { if (c === quote && value[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && !depth) { layers.push(value.slice(start, i).trim()); start = i + 1; }
  }
  layers.push(value.slice(start).trim());
  return layers;
}
// Resolve a button's native hover surface once per round, not on pointer moves.
// Only background/custom-property declarations are replayed; no events are fired
// and original stylesheets are never changed. Unreadable sheets are skipped.
export function readTargetPalette(element: HTMLElement, doc: Document): Palette {
  const win = doc.defaultView!;
  const computed = () => win.getComputedStyle?.(element) || element.style;
  const initial = computed();
  const base = initial.getPropertyValue('background-color') || 'transparent';
  const explicit = initial.getPropertyValue('--swarm-power-color').trim();
  const fallback = initial.getPropertyValue('border-top-color') || initial.getPropertyValue('color') || '#00e5ff';
  const marker = 'data-swarm-color-probe';
  const previous = element.getAttribute(marker), originalStyle = element.getAttribute('style'), normalizedStyle = element.style.cssText;
  const temporary = ['transition', 'background-color'].map(name => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)] as const);
  let probe: HTMLStyleElement | null = null, color = base;
  const solid = (value:string) => value && value !== 'transparent' && !/^rgba?\([^,]+,[^,]+,[^,]+,\s*0(?:\.0+)?\s*\)$|\/\s*0(?:\.0+)?%?\s*\)$/.test(value);
  try {
    element.setAttribute(marker, '');
    const rules = (list: CSSRuleList, parent = ''): string => {
      let output = '';
      for (const rule of (list || []) as unknown as CSSRuleView[]) {
        if (rule.selectorText) {
          const selector = parent ? (rule.selectorText.includes('&') ? rule.selectorText.replaceAll('&', `:is(${parent})`) : `${parent} ${rule.selectorText}`) : rule.selectorText;
          const hover = selector.replace(/:hover\b/g, `:is(:hover,[${marker}])`);
          const matches = cssLayers(hover).filter(part => { try { return !part.includes('::') && element.matches?.(part); } catch { return false; } });
          if (matches.length) {
            const declarations = Array.from(rule.style).filter(name => name === 'background' || name === 'background-color' || name.startsWith('--'))
              .map(name => {
                // A var() shorthand leaves its expanded color pending in CSSOM.
                const pending = name === 'background-color' && !rule.style.getPropertyValue(name);
                const property = pending ? 'background' : name;
                return `${property}:${rule.style.getPropertyValue(property)}${rule.style.getPropertyPriority(name) ? '!important' : ''}`;
              }).join(';');
            if (declarations) output += `${matches.map(part => `${part}:where([${marker}])`).join(',')}{${declarations}}`;
          }
          if (rule.cssRules) output += rules(rule.cssRules, selector);
        } else if (rule.styleSheet) {
          try {
            const content = rules(rule.styleSheet.cssRules);
            output += rule.media?.mediaText ? `@media ${rule.media.mediaText}{${content}}` : content;
          } catch {}
        } else if (rule.cssRules && !rule.name?.includes('keyframes')) {
          const content = rules(rule.cssRules, parent);
          if (content) output += `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${content}}`;
        }
      }
      return output;
    };
    if (!explicit) {
      let css = '';
      for (const sheet of [...doc.styleSheets || [], ...doc.adoptedStyleSheets || []]) {
        if (sheet.disabled) continue;
        try {
          const content = rules(sheet.cssRules);
          css += sheet.media?.mediaText ? `@media ${sheet.media.mediaText}{${content}}` : content;
        } catch { /* Cross-origin CSS can use --swarm-power-color instead. */ }
      }
      if (css) {
        probe = doc.createElement('style');
        const nonce = doc.querySelector?.<HTMLElement>('style[nonce],script[nonce]')?.nonce;
        if (nonce) probe.nonce = nonce;
        probe.textContent = css;
        (doc.head || doc.body).appendChild(probe);
      }
    }
    // Suppress background transitions while sampling the resolved endpoint.
    element.style.setProperty('transition', 'none', 'important');
    if (explicit) element.style.setProperty('background-color', explicit, 'important');
    color = computed().getPropertyValue('background-color');
  } finally {
    probe?.remove();
    if (previous === null) element.removeAttribute(marker);
    else element.setAttribute(marker, previous);
    for (const [name, value, priority] of temporary) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
    const currentStyle = element.getAttribute('style');
    if (element.style.cssText === normalizedStyle) {
      if (originalStyle === null) element.removeAttribute('style');
      else if (currentStyle !== originalStyle) element.setAttribute('style', originalStyle);
    }
  }
  return { base, power: solid(color) ? color : solid(base) ? base : fallback };
}
