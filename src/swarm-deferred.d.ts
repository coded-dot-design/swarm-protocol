import type { SwarmInstallation, SwarmInstallOptions } from '../integration/swarm-types.js';

export type { SwarmInstallation, SwarmInstallOptions } from '../integration/swarm-types.js';

export interface SwarmDeferredScheduling {
  /** Delay after page load or visibility restoration; defaults to 1000 ms. */
  delayMs?: number;
  /** requestIdleCallback timeout; defaults to 2000 ms. */
  idleTimeoutMs?: number;
}

export interface SwarmDeferredInstallation {
  /** The hidden installation, or null if cancelled before installation. */
  ready: Promise<SwarmInstallation | null>;
  /** Cancel pending setup or destroy the completed installation. Idempotent. */
  destroy(): void;
}

/**
 * Wait for page load, a 1000 ms delay, and an idle opportunity before importing
 * the hidden bootstrap. A timer substitutes for unsupported idle callbacks.
 * Hidden tabs wait until visible. Call destroy() on route changes or unmount.
 * Bootstrap failures reject ready; handle them with ready.catch().
 */
export function installSwarmDeferred(
  options?: SwarmInstallOptions,
  scheduling?: SwarmDeferredScheduling,
): SwarmDeferredInstallation;
