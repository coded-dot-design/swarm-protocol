// Import the real source directly: no copied game, package refresh, or stale
// optimized dependency between an engine edit and a playground reload.
import { installSwarm } from '../../src/swarm-loader.js';

export function mount({ document, scenario, reducedMotion, onState, onEvent, onError }) {
  return installSwarm({
    document,
    targetSelector: scenario === 'no-targets' ? '[data-no-targets]' : scenario === 'remote' ? '#base-contact' : '[data-swarm-target]',
    textSelector: scenario === 'remote' ? '[data-no-text]' : '[data-swarm-text]',
    surfaceSelector: '[data-swarm-surface]',
    storageKey: 'swarm-playground-best-v1',
    reducedMotion,
    onState,
    onEvent,
    onError,
  });
}
