// Internal presentation only: reuse the engine's cached target rectangles.
const EDGES = [
  { bit: 1, name: 'top', arrow: '↑', direction: 'above' },
  { bit: 2, name: 'bottom', arrow: '↓', direction: 'below' },
  { bit: 4, name: 'left', arrow: '←', direction: 'to the left' },
  { bit: 8, name: 'right', arrow: '→', direction: 'to the right' },
];

export function getAttackEdges(bugs, width, height) {
  let edges = 0;
  for (const bug of bugs) {
    const target = bug.target;
    if (!bug.attached || !target?.rendered || !target.element.isConnected || target.health <= 0) continue;
    const r = target.rect;
    if (!r || r.width <= 0 || r.height <= 0) continue;
    // A partially visible button remains reachable and needs no edge cue.
    if (r.right > 0 && r.bottom > 0 && r.left < width && r.top < height) continue;
    if (r.bottom <= 0) edges |= 1;
    if (r.top >= height) edges |= 2;
    if (r.right <= 0) edges |= 4;
    if (r.left >= width) edges |= 8;
  }
  return edges;
}

const styles = `
:host{all:initial!important;position:fixed!important;inset:0!important;display:block!important;pointer-events:none!important;z-index:2147483050!important;direction:ltr!important;unicode-bidi:isolate!important;writing-mode:horizontal-tb!important;color-scheme:dark!important;contain:layout style!important}
:host([hidden]),[hidden]{display:none!important}
*{box-sizing:border-box;pointer-events:none!important}
.edge{position:absolute;color:#ffd0c4;font:500 11px/1.4 system-ui,sans-serif;letter-spacing:.01em}
.edge::before{content:'';position:absolute;background:#ff806d;box-shadow:0 0 12px #ff6b6b88;animation:swarm-edge-pulse 2.2s ease-in-out infinite}
.top,.bottom{left:0;right:0;height:3px;text-align:center}
.top{top:0}.bottom{bottom:0}
.top::before,.bottom::before{inset:0}
.left,.right{top:0;bottom:0;width:3px}
.left{left:0}.right{right:0}
.left::before,.right::before{inset:0}
.message{position:absolute;display:flex;align-items:center;justify-content:center;gap:9px;width:max-content;max-width:calc(100vw - 32px);padding:8px 12px;border:1px solid #ff806d55;border-radius:7px;background:#16171bf5;box-shadow:0 4px 18px #0005;text-align:left}
.top .message{left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%)}
.bottom .message{left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%)}
.left .message{left:max(12px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);max-width:170px}
.right .message{right:max(12px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);max-width:170px}
.arrow{font:18px/1 system-ui,sans-serif;color:#ff9d8d;flex-shrink:0}
.copy{display:flex;flex-direction:column;gap:1px}.action{font-size:10px;font-weight:400;color:#b8bdc8}
.announcement{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@keyframes swarm-edge-pulse{0%,100%{opacity:.35}50%{opacity:1}}
:host([data-reduced-motion]) .edge::before{animation:none;opacity:1}
@media(prefers-reduced-motion:reduce){.edge::before{animation:none;opacity:1}}
@media(min-width:641px) and (max-width:1000px){.bottom .message{left:12px;transform:none}}
@media(max-width:640px){.edge{font-size:10px}.message{padding:6px 9px;gap:7px}.left .message,.right .message{max-width:135px}.bottom .message{bottom:max(220px,calc(env(safe-area-inset-bottom) + 208px))}}
`;

/** Lazy, pointer-transparent cues; no timers, listeners, layout reads, or RAF. */
export function createAttackIndicators(doc, reducedMotion = false) {
  let host = null, announcement = null, current = 0, destroyed = false;
  const nodes = [];
  function mount() {
    host = doc.createElement('div');
    host.setAttribute('data-swarm-attack-cues', '');
    if (reducedMotion) host.setAttribute('data-reduced-motion', '');
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = styles;
    root.append(style);
    for (const edge of EDGES) {
      const node = doc.createElement('div');
      node.setAttribute('class', `edge ${edge.name}`);
      node.setAttribute('aria-hidden', 'true');
      node.hidden = true;
      const message = doc.createElement('div');
      message.setAttribute('class', 'message');
      const arrow = doc.createElement('span');
      arrow.setAttribute('class', 'arrow');
      arrow.textContent = edge.arrow;
      const copy = doc.createElement('span');
      copy.setAttribute('class', 'copy');
      const title = doc.createElement('span');
      title.textContent = 'Other sections under attack';
      const action = doc.createElement('span');
      action.setAttribute('class', 'action');
      action.textContent = 'Scroll to squash';
      copy.append(title, action);
      message.append(arrow, copy);
      node.append(message);
      root.append(node);
      nodes.push(node);
    }
    announcement = doc.createElement('div');
    announcement.setAttribute('class', 'announcement');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    root.append(announcement);
    doc.body.appendChild(host);
  }
  return {
    update(edges) {
      if (destroyed || edges === current) return;
      current = edges;
      if (!host && edges) mount();
      if (!host) return;
      host.hidden = !edges;
      const directions = [];
      EDGES.forEach((edge, index) => {
        const visible = !!(edges & edge.bit);
        if (nodes[index].hidden === visible) nodes[index].hidden = !visible;
        if (visible) directions.push(edge.direction);
      });
      host.setAttribute('data-swarm-directions', EDGES.filter(edge => edges & edge.bit).map(edge => edge.name).join(' '));
      announcement.textContent = edges ? `Other sections under attack ${directions.join(' and ')}. Scroll to squash.` : '';
    },
    destroy() {
      destroyed = true;
      host?.remove();
      host = announcement = null;
      nodes.length = 0;
    },
  };
}
