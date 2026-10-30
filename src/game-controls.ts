/** Shared, accessible controls. Copied to Swarm by sync:games. */
const svg = (path: string) =>
  `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
export const controlIcons = {
  pause: svg('<path d="M7 5v10M13 5v10"/>'),
  play: svg('<path d="m7 4 9 6-9 6Z"/>'),
  minimize: svg('<path d="M4 10h12"/>'),
  expand: svg('<path d="M4 10h12M10 4v12"/>'),
  close: svg('<path d="m5 5 10 10M15 5 5 15"/>'),
  sound: svg('<path d="M3 8h3l4-4v12l-4-4H3ZM14 6q4 4 0 8"/>'),
  mute: svg('<path d="M3 8h3l4-4v12l-4-4H3ZM14 8l4 4m0-4-4 4"/>'),
  up: svg('<path d="m4 12 6-6 6 6"/>'),
  left: svg('<path d="m12 4-6 6 6 6"/>'),
  right: svg('<path d="m8 4 6 6-6 6"/>'),
  down: svg('<path d="m4 8 6 6 6-6"/>'),
};
export const controlStyles = `
.game-header{display:grid!important;grid-template-columns:1fr auto;align-items:center;gap:4px!important;padding:9px 12px!important}
.game-header .game-title{grid-column:1/-1;font:500 10px/1.4 ui-monospace,monospace;letter-spacing:1.4px;color:inherit;text-shadow:none}
.game-actions{grid-column:2;display:flex;gap:3px}
.game-actions button{width:44px;min-width:44px;height:44px;min-height:44px;padding:8px!important;border:0;background:transparent;color:inherit;border-radius:7px;display:grid;place-items:center;cursor:pointer}
.game-actions button:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
.game-actions svg,.touch svg{display:block;width:20px;height:20px;margin:auto}
.game-actions button:focus-visible{outline:2px solid currentColor;outline-offset:1px}
@media(pointer:coarse),(max-width:600px){.game-actions button{width:44px;min-width:44px;height:44px;min-height:44px}.game-header{padding:5px 10px!important}}
`;
export function gameHeader(title: string) {
  return `<header class="game-header"><strong class="game-title">${title}</strong><div class="game-actions"><button data-action="sound" aria-label="Mute game sound" aria-pressed="true">${controlIcons.sound}</button><button data-action="pause" aria-label="Pause game">${controlIcons.pause}</button><button data-action="fold" aria-label="Minimize scoreboard" aria-expanded="true">${controlIcons.minimize}</button><button data-action="exit" aria-label="Close game and restore page">${controlIcons.close}</button></div></header>`;
}
