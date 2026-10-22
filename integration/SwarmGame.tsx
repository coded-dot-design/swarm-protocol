'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { installSwarmDeferred } from '../src/swarm-deferred.js';
import type { SwarmDeferredScheduling } from '../src/swarm-deferred.js';
import type {
  SwarmGameHandle,
  SwarmInstallation,
  SwarmInstallOptions,
} from './swarm-types.js';

export type {
  SwarmEvent,
  SwarmGameHandle,
  SwarmInstallOptions,
  SwarmSnapshot,
} from './swarm-types.js';

export interface SwarmGameProps extends Omit<SwarmInstallOptions, 'host' | 'document'>, SwarmDeferredScheduling {
  /** Recreate the installation when a persistent app layout changes routes. */
  routeKey?: string | number;
}

type PendingAction = {
  method: 'open' | 'start';
  resolve: () => void;
  reject: (error: unknown) => void;
};

/** One hidden installation per page; browser work begins only in the effect. */
export const SwarmGame = forwardRef<SwarmGameHandle, SwarmGameProps>(
  function SwarmGame(
    {
      targetSelector = '[data-swarm-target]',
      textSelector = '[data-swarm-text]',
      surfaceSelector = '[data-swarm-surface]',
      storageKey = 'swarm-protocol-best-v1',
      reducedMotion,
      keyboard = 'sequence',
      triggerSelector = '[data-swarm-trigger]',
      delayMs = 1000,
      idleTimeoutMs = 2000,
      routeKey,
      onEvent,
      onState,
      onError,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const installationRef = useRef<SwarmInstallation | null>(null);
    const pendingRef = useRef<PendingAction[]>([]);
    const pendingUnlockRef = useRef(false);
    const actionEpochRef = useRef(0);
    const loadErrorRef = useRef<unknown>(undefined);
    const callbacksRef = useRef({ onEvent, onState, onError });

    useEffect(() => {
      callbacksRef.current = { onEvent, onState, onError };
    }, [onEvent, onState, onError]);

    const cancelPending = useCallback(() => {
      // Cancellation is a normal lifecycle action, not a load failure.
      actionEpochRef.current++;
      for (const action of pendingRef.current.splice(0)) action.resolve();
    }, []);

    useImperativeHandle(ref, () => {
      const request = (method: 'open' | 'start') => {
        if (installationRef.current) return installationRef.current[method]();
        if (loadErrorRef.current !== undefined) return Promise.reject(loadErrorRef.current);
        return new Promise<void>((resolve, reject) => {
          pendingRef.current.push({ method, resolve, reject });
        });
      };
      return {
        unlock() {
          if (installationRef.current) installationRef.current.unlock();
          else pendingUnlockRef.current = true;
        },
        open: () => request('open'),
        start: () => request('start'),
        minimize() {
          cancelPending();
          installationRef.current?.minimize();
        },
        pause() {
          cancelPending();
          installationRef.current?.pause();
        },
        resume() { installationRef.current?.resume(); },
        stop() {
          cancelPending();
          installationRef.current?.stop();
        },
        hide() {
          cancelPending();
          pendingUnlockRef.current = false;
          installationRef.current?.hide();
        },
        getSnapshot: () => installationRef.current?.getSnapshot() ?? null,
        isUnlocked: () => installationRef.current?.isUnlocked() ?? false,
      };
    }, [cancelPending]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      let disposed = false;
      let installation: SwarmInstallation | null = null;
      loadErrorRef.current = undefined;
      const reportError = (error: unknown) => {
        try {
          if (callbacksRef.current.onError) callbacksRef.current.onError(error);
          else console.error('Swarm Protocol could not initialize.', error);
        } catch (callbackError) {
          console.error('Swarm Protocol error handler failed.', callbackError);
        }
      };

      // Escape can arrive before the small bootstrap import finishes. Cancel
      // queued ref requests now; the installer takes over once it is mounted.
      const pendingEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.repeat || event.isComposing) return;
        cancelPending();
        pendingUnlockRef.current = false;
      };
      host.ownerDocument.addEventListener('keydown', pendingEscape, true);

      // The scheduler waits for page load and an idle period before downloading
      // even the activation listeners. The engine remains an on-demand import.
      const scheduled = installSwarmDeferred({
        host,
        document: host.ownerDocument,
        targetSelector,
        textSelector,
        surfaceSelector,
        storageKey,
        reducedMotion,
        keyboard,
        triggerSelector,
        onEvent: event => callbacksRef.current.onEvent?.(event),
        onState: snapshot => callbacksRef.current.onState?.(snapshot),
        onError: reportError,
      }, { delayMs, idleTimeoutMs });
      void scheduled.ready.then(ready => {
        if (disposed || !ready || !host.isConnected) {
          scheduled.destroy();
          return;
        }
        installation = ready;
        installationRef.current = installation;
        host.ownerDocument.removeEventListener('keydown', pendingEscape, true);
        if (pendingUnlockRef.current) {
          pendingUnlockRef.current = false;
          installation.unlock();
        }
        const epoch = actionEpochRef.current;
        for (const action of pendingRef.current.splice(0)) {
          if (disposed || epoch !== actionEpochRef.current) { action.resolve(); continue; }
          try {
            // Dispatch together so the installer coalesces concurrent intents.
            // Awaiting each here would turn queued starts into repeated rounds.
            void installation[action.method]().then(action.resolve, action.reject);
          } catch (error) {
            action.reject(error);
          }
        }
      }).catch(error => {
        host.ownerDocument.removeEventListener('keydown', pendingEscape, true);
        if (disposed) return;
        loadErrorRef.current = error;
        for (const action of pendingRef.current.splice(0)) action.reject(error);
        reportError(error);
      });

      const beforeSwap = () => {
        disposed = true;
        cancelPending();
        pendingUnlockRef.current = false;
        host.ownerDocument.removeEventListener('keydown', pendingEscape, true);
        scheduled.destroy();
        if (installationRef.current === installation) installationRef.current = null;
      };
      host.ownerDocument.addEventListener('astro:before-swap', beforeSwap);

      return () => {
        disposed = true;
        cancelPending();
        pendingUnlockRef.current = false;
        host.ownerDocument.removeEventListener('astro:before-swap', beforeSwap);
        host.ownerDocument.removeEventListener('keydown', pendingEscape, true);
        scheduled.destroy();
        if (installationRef.current === installation) installationRef.current = null;
      };
    }, [targetSelector, textSelector, surfaceSelector, storageKey, reducedMotion, keyboard, triggerSelector, delayMs, idleTimeoutMs, routeKey, cancelPending]);

    return <div ref={hostRef} data-swarm-ui="" />;
  },
);

export default SwarmGame;
