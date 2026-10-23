import { games } from './games/index.js';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['game-select', 'play', 'pause', 'reset', 'state', 'state-dot', 'bugs', 'score', 'theme', 'scenario', 'scenario-help', 'motion', 'events', 'notice'].map(id => [id, $(id)]));
const theme = matchMedia('(prefers-color-scheme: dark)');
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new AbortController();
const scenarioHelp = {
  page: 'Play across the whole page, including a nested scroll area.',
  remote: 'Only the last base is food. Bugs still spawn near you, then travel to Contact. Earn points by squashing bugs to fund Jump / Zap.',
  'no-targets': 'Only marked letters are food. Check viewport attraction and letter restoration without any button targets.',
};
let controller = null;
let generation = 0;
let starting = false;
let snapshot = null;
let history = [];

function on(target, type, handler) {
  target.addEventListener(type, handler, { signal: listeners.signal });
}
function text(element, value) {
  const next = String(value);
  if (element.textContent !== next) element.textContent = next;
}
function notice(message) { text(ui.notice, message); }
function render(state = null) {
  snapshot = state;
  const status = state?.status || 'idle';
  const active = ['running', 'intermission', 'paused'].includes(status);
  text(ui.state, starting ? 'Starting' : status === 'idle' ? 'Ready' : status === 'gameover' ? 'Game over' : status[0].toUpperCase() + status.slice(1));
  ui['state-dot'].toggleAttribute('data-active', active && status !== 'paused');
  text(ui.bugs, state?.alive || 0);
  text(ui.score, state?.score || 0);
  text(ui.play, starting ? 'Starting…' : active ? 'Restart game ↗' : 'Start game ↗');
  text(ui.pause, status === 'paused' ? 'Resume' : 'Pause');
  ui.play.disabled = !controller || starting;
  ui.pause.disabled = !controller || !active || starting;
  ui.reset.disabled = !controller && !starting;
}
function log(event) {
  let label;
  if (event.type === 'wave-start') label = `Wave ${event.wave} · ${event.count} bugs`;
  else if (event.type === 'rescue') label = `${event.action === 'zap' ? 'Jump + Zap' : 'Jump'} · −${event.cost} points · ${event.killed} squashed`;
  else if (event.type === 'gameover') label = 'Round ended';
  else if (event.type === 'status' && event.status === 'paused') label = 'Paused';
  if (!label) return;
  history.unshift(label);
  history.length = Math.min(history.length, 6);
  ui.events.replaceChildren(...history.map(message => {
    const item = document.createElement('li');
    item.textContent = message;
    return item;
  }));
}
function report(error) {
  notice(`Could not start the game: ${error?.message || error}. Reset to try again.`);
  console.error('[Playground]', error);
}
function unmount() {
  generation++;
  const previous = controller;
  controller = null;
  starting = false;
  previous?.destroy();
}
async function reset(message = 'Page restored. Start a fresh round whenever you like.') {
  unmount();
  const current = generation;
  render();
  history = [];
  const item = document.createElement('li');
  item.textContent = 'No events yet. Start a round.';
  ui.events.replaceChildren(item);
  text(ui['scenario-help'], scenarioHelp[ui.scenario.value]);
  notice(message);
  try {
    const adapter = await games.find(game => game.id === ui['game-select'].value).load();
    if (current !== generation) return;
    controller = adapter.mount({
      document,
      board: $('game-board'),
      scenario: ui.scenario.value,
      reducedMotion: ui.motion.value === 'reduce' ? true : undefined,
      onState: state => { if (current === generation) render(state); },
      onEvent: event => { if (current === generation) log(event); },
      onError: error => { if (current === generation) report(error); },
    });
    render(controller.getSnapshot());
  } catch (error) {
    if (current === generation) {
      report(error);
      text(ui.state, 'Unavailable');
      ui.reset.disabled = false;
    }
  }
}
async function start() {
  if (!controller || starting) return;
  const current = generation;
  starting = true;
  render(snapshot);
  try {
    await controller.start();
    if (current === generation) notice('Squash bugs to earn points. Offscreen alerts offer Jump / Zap when you can afford them. Esc exits.');
  } catch (error) {
    if (current === generation) report(error);
  } finally {
    if (current === generation) {
      starting = false;
      render(controller.getSnapshot());
    }
  }
}

for (const game of games) ui['game-select'].add(new Option(game.name, game.id));
on(ui.play, 'click', start);
on(ui.reset, 'click', () => reset());
on(ui.pause, 'click', () => snapshot?.status === 'paused' ? controller?.resume() : controller?.pause());
for (const input of [ui['game-select'], ui.scenario, ui.motion]) on(input, 'change', () => reset('Settings applied and page restored. Start a new round to test them.'));
function showTheme() { text(ui.theme, `System · ${theme.matches ? 'Dark' : 'Light'}`); }
on(theme, 'change', showTheme);
on(systemMotion, 'change', () => {
  if (ui.motion.value === 'system') void reset('System motion preference changed. Start a new round with the updated setting.');
});
for (const button of document.querySelectorAll('[data-demo-action]')) {
  on(button, 'click', () => notice(`${button.dataset.demoAction}. The original button click still works.`));
}
on($('demo-form'), 'submit', event => {
  event.preventDefault();
  text($('form-result'), 'Your demo note worked. Nothing was sent or saved.');
});
on(document, 'keydown', event => {
  if (event.key === 'Escape' && !event.repeat && !event.isComposing) {
    queueMicrotask(() => {
      render(controller?.getSnapshot());
      notice('Game exited and page restored. Start game or use the secret code to play again.');
    });
  }
});
on(window, 'pagehide', unmount);
on(window, 'pageshow', event => { if (event.persisted) void reset(); });

// A small console surface for local smoke tests; this is never in the package.
window.playground = { start, reset, getSnapshot: () => controller?.getSnapshot() || null };
if (import.meta.hot) import.meta.hot.dispose(() => {
  unmount();
  listeners.abort();
  delete window.playground;
});
showTheme();
void reset('Choose Start game, then squash the swarm. Esc exits and restores the page.');
