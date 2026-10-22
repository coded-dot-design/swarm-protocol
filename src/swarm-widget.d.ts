import type { SwarmController, SwarmGameOptions } from '../integration/swarm-types.js';

export function mountSwarmGame(
  host: HTMLElement,
  options?: SwarmGameOptions,
): SwarmController;
