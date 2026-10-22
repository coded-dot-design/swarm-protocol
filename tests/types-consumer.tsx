import { useRef } from 'react';
import { installSwarm, type SwarmInstallation, type SwarmInstallOptions } from '@chriscooley/swarm-protocol';
import SwarmGame, { type SwarmGameHandle, type SwarmGameProps } from '@chriscooley/swarm-protocol/react';
import { createDomDefender } from '@chriscooley/swarm-protocol/core';
import { mountSwarmGame } from '@chriscooley/swarm-protocol/widget';
import { installSwarmDeferred, type SwarmDeferredInstallation, type SwarmDeferredScheduling } from '@chriscooley/swarm-protocol/deferred';

const options: SwarmInstallOptions = {
  keyboard: 'sequence',
  triggerSelector: false,
  onEvent(event) {
    if (event.type === 'bite') {
      const binary: '0' | '1' = event.binary;
      void binary;
    }
  },
};
const installation: SwarmInstallation = installSwarm(options);
const opening: Promise<void> = installation.open();
const starting: Promise<void> = installation.start();
void opening;
void starting;
installation.minimize();
installation.hide();
installation.destroy();

const scheduling: SwarmDeferredScheduling = { delayMs: 1000, idleTimeoutMs: 2000 };
const deferred: SwarmDeferredInstallation = installSwarmDeferred(options, scheduling);
const ready: Promise<SwarmInstallation | null> = deferred.ready;
void ready;
deferred.destroy();

const props: SwarmGameProps = { keyboard: 'sequence', routeKey: '/example', ...scheduling };
export function Example() {
  const ref = useRef<SwarmGameHandle>(null);
  const minimize: (() => void) | undefined = ref.current?.minimize;
  void minimize;
  return <SwarmGame ref={ref} {...props} />;
}

const core = createDomDefender({ drawBug(context, bug) { context.fillRect(bug.x, bug.y, 2, 2); } });
const snapshot = core.start();
const score: number = snapshot.score;
void score;
const widget = mountSwarmGame(document.createElement('div'), { initiallyClosed: false });
widget.open();
widget.minimize();
widget.destroy();

// Removed controls must not silently remain part of the public contract.
// @ts-expect-error Caps Lock toggling was removed in 1.0.1.
const removedCapsOption: SwarmInstallOptions = { capsLockToggle: true };
// @ts-expect-error Only the plain sequence (or disabled input) is supported.
const removedChordOption: SwarmInstallOptions = { keyboard: 'chorded' };
void removedCapsOption;
void removedChordOption;
