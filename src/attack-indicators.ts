import type { Bug } from './runtime-types.js';
// Internal presentation only: reuse the engine's cached target rectangles.
const EDGES = [
  { bit: 1, name: 'top', arrow: '↑', direction: 'above' },
  { bit: 2, name: 'bottom', arrow: '↓', direction: 'below' },
  { bit: 4, name: 'left', arrow: '←', direction: 'to the left' },
  { bit: 8, name: 'right', arrow: '→', direction: 'to the right' },
];

/*! @license Bug icon derived from Lucide, ISC License. See THIRD_PARTY_NOTICES.md. */
const bugIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`;

export function attackEdge(bug: Pick<Bug,"target"|"attached">, width:number, height:number) {
  const target = bug.target;
  if (!bug.attached || !target?.rendered || !target.element.isConnected || target.health <= 0) return 0;
  const r = target.rect;
  if (!r || r.width <= 0 || r.height <= 0 || (r.right > 0 && r.bottom > 0 && r.left < width && r.top < height)) return 0;
  return (r.bottom <= 0 ? 1 : 0) | (r.top >= height ? 2 : 0) | (r.right <= 0 ? 4 : 0) | (r.left >= width ? 8 : 0);
}

export function getAttackEdges(bugs: Pick<Bug,"target"|"attached">[], width:number, height:number) {
  let edges = 0;
  for (const bug of bugs) edges |= attackEdge(bug, width, height);
  return edges;
}

// Separate prices: low funds fall back to navigation, without discounting zaps.
export function rescueOffer(score:number, jumps:number, zaps:number) {
  const jumpCost = 50 + jumps * 25, zapCost = 200 + zaps * 150 + jumps * 25;
  return { jumpCost, zapCost, mode: (score >= zapCost ? 'zap' : score >= jumpCost ? 'jump' : 'locked') as 'zap'|'jump'|'locked' };
}

const styles = `
:host{all:initial!important;position:fixed!important;inset:0!important;display:block!important;pointer-events:none!important;z-index:2147483050!important;direction:ltr!important;unicode-bidi:isolate!important;writing-mode:horizontal-tb!important;color-scheme:dark!important;contain:layout style!important}
:host([hidden]),[hidden]{display:none!important}
*{box-sizing:border-box;pointer-events:none!important}
.edge{position:absolute;color:#ffd0c4;font:500 11px/1.4 system-ui,sans-serif;letter-spacing:.01em}
.edge::before{content:'';position:absolute;background:#ff806d;animation:swarm-edge-pulse 2.2s ease-in-out infinite}
.top,.bottom{left:0;right:0;height:3px;text-align:center}
.top{top:0}.bottom{bottom:0}
.top::before,.bottom::before{inset:0}
.left,.right{top:0;bottom:0;width:3px}
.left{left:0}.right{right:0}
.left::before,.right::before{inset:0}
.message{all:unset;box-sizing:border-box;pointer-events:auto!important;cursor:pointer;min-height:44px;color:inherit;font:inherit;position:absolute;display:flex;align-items:center;justify-content:center;gap:9px;width:max-content;max-width:calc(100vw - 32px);padding:8px 12px;border:1px solid #ff806d55;border-radius:7px;background:#16171bf5;text-align:left}
.message:hover{background:#28262b}.message:focus-visible{outline:2px solid #06c4ff;outline-offset:3px}.message[aria-disabled="true"]{cursor:default}.message[data-mode="zap"] .action{color:#74dfa1}
.top .message{left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%)}
.bottom .message{left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%)}
.left .message{left:max(12px,env(safe-area-inset-left));top:50%;transform:translateY(-50%);max-width:195px}
.right .message{right:max(12px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);max-width:195px}
.arrow{font:18px/1 system-ui,sans-serif;color:#ff9d8d;flex-shrink:0}
.bug-signal{position:relative;display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border:1px solid #ff806d55;border-radius:8px;background:#ff806d0d;color:#ff9d8d}
.bug-signal::before{content:'';position:absolute;inset:-3px;border-radius:inherit;background:#ff806d18;animation:swarm-bug-glow 2.2s ease-in-out infinite}
.bug-signal svg{display:block;width:19px;height:19px;animation:swarm-bug-pulse 2.2s ease-in-out infinite}
.copy{display:flex;flex-direction:column;gap:1px;min-width:0}.action{font-size:10px;font-weight:400;color:#b8bdc8}
.announcement{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@keyframes swarm-edge-pulse{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes swarm-bug-pulse{0%,100%{opacity:.5;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}
@keyframes swarm-bug-glow{0%,100%{opacity:.15}50%{opacity:1}}
:host([data-reduced-motion]) .edge::before{animation:none;opacity:1}
:host([data-reduced-motion]) .bug-signal svg,:host([data-reduced-motion]) .bug-signal::before{animation:none;opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.edge::before,.bug-signal svg,.bug-signal::before{animation:none;opacity:1;transform:none}}
@media(min-width:641px) and (max-width:1000px){.bottom .message{left:12px;transform:none}}
@media(max-width:640px){.edge{font-size:10px}.message{padding:6px 9px;gap:7px}.bug-signal{width:24px;height:24px;flex-basis:24px}.bug-signal svg{width:17px;height:17px}.left .message,.right .message{max-width:min(165px,calc(50vw - 20px))}.bottom .message{bottom:max(220px,calc(env(safe-area-inset-bottom) + 208px))}}
`;

/** Lazy controls. Only the four buttons intercept input; no timers or layout reads. */
export function createAttackIndicators(doc: Document, reducedMotion = false, onAction: (edge:number)=>void = () => {}) {
  let host: HTMLDivElement | null = null, announcement: HTMLDivElement | null = null, current = 0, destroyed = false;
  const nodes: {node:HTMLDivElement;message:HTMLButtonElement;action:HTMLSpanElement;activate:()=>void}[] = [];
  let previousOffer: ReturnType<typeof rescueOffer> | null = null;
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
      node.hidden = true;
      const message = doc.createElement('button');
      message.setAttribute('type', 'button');
      message.setAttribute('data-swarm-ui', '');
      const activate = () => { if ((current & edge.bit) && message.getAttribute('aria-disabled') !== 'true') onAction(edge.bit); };
      message.addEventListener('click', activate);
      message.setAttribute('class', 'message');
      const arrow = doc.createElement('span');
      arrow.setAttribute('class', 'arrow');
      arrow.textContent = edge.arrow;
      arrow.setAttribute('aria-hidden', 'true');
      const bug = doc.createElement('span');
      bug.setAttribute('class', 'bug-signal');
      bug.innerHTML = bugIcon;
      const copy = doc.createElement('span');
      copy.setAttribute('class', 'copy');
      const title = doc.createElement('span');
      title.textContent = 'Other sections under attack';
      const action = doc.createElement('span');
      action.setAttribute('class', 'action');
      action.textContent = 'Scroll to squash';
      copy.append(title, action);
      message.append(arrow, bug, copy);
      node.append(message);
      root.append(node);
      nodes.push({ node, message, action, activate });
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
    update(edges:number, offer = rescueOffer(0, 0, 0)) {
      if (destroyed || (edges === current && offer.mode === previousOffer?.mode && offer.jumpCost === previousOffer.jumpCost && offer.zapCost === previousOffer.zapCost)) return;
      const directionChanged = edges !== current;
      current = edges;
      previousOffer = offer;
      if (!host && edges) mount();
      if (!host) return;
      host.hidden = !edges;
      const directions: string[] = [];
      EDGES.forEach((edge, index) => {
        const visible = !!(edges & edge.bit);
        const { node, message, action } = nodes[index];
        if (node.hidden === visible) node.hidden = !visible;
        message.setAttribute('aria-disabled', String(offer.mode === 'locked'));
        message.setAttribute('data-mode', offer.mode);
        const label = offer.mode === 'zap' ? `Jump + Zap · ${offer.zapCost} pts` : offer.mode === 'jump' ? `Jump · ${offer.jumpCost} pts` : `Need ${offer.jumpCost} pts to jump · or scroll`;
        action.textContent = label;
        message.setAttribute('aria-label', `Under attack ${edge.direction}. ${label}.`);
        if (visible) directions.push(edge.direction);
      });
      host.setAttribute('data-swarm-directions', EDGES.filter(edge => edges & edge.bit).map(edge => edge.name).join(' '));
      if (directionChanged) announcement!.textContent = edges ? `Other sections under attack ${directions.join(' and ')}. Use the alert to jump when you have enough points, or scroll to squash.` : '';
    },
    destroy() {
      destroyed = true;
      for (const { message, activate } of nodes) message.removeEventListener('click', activate);
      host?.remove();
      host = announcement = null;
      nodes.length = 0;
    },
  };
}
