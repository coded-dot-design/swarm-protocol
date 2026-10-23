// Each game owns its adapter and cleanup. The fixture page stays independent.
export const games = [
  { id: 'swarm', name: 'Swarm Protocol', load: () => import('./swarm.js') },
];
