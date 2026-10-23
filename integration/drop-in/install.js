/*! Swarm Protocol 1.0.10 | Copyright 2026 Chris Cooley | MIT */
import { installSwarmDeferred } from './deferred.js';

// Edit these selectors to opt in the exact elements on your site.
const options = {
  triggerSelector: '[data-swarm-trigger]',
  targetSelector: '[data-swarm-target]',
  textSelector: '[data-swarm-text]',
  surfaceSelector: '[data-swarm-surface]',
  storageKey: 'my-site-swarm-best-v1',
  onError: error => console.error('Swarm Protocol could not open.', error),
};
const scheduling = { delayMs: 1000, idleTimeoutMs: 2000 };
let pending = null;

function boot() {
  if (pending) return;
  const current = installSwarmDeferred(options, scheduling);
  pending = current;
  void current.ready.catch(error => {
    if (pending === current) pending = null;
    console.error('Swarm Protocol could not initialize.', error);
  });
}

function cleanup() {
  pending?.destroy();
  pending = null;
}

// Full-page loads and Astro ClientRouter share the same installation lifecycle.
document.addEventListener('astro:before-swap', cleanup);
document.addEventListener('astro:page-load', boot);
boot();
