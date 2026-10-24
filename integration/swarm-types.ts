export type SwarmStatus =
  | 'idle'
  | 'running'
  | 'intermission'
  | 'paused'
  | 'gameover';

export interface SwarmTarget {
  id: string;
  label: string;
  health: number;
  /** True when this rendered target is currently inside the viewport. */
  visible: boolean;
}

export interface SwarmSnapshot {
  status: SwarmStatus;
  score: number;
  best: number;
  wave: number;
  kills: number;
  combo: number;
  elapsed: number;
  alive: number;
  remaining: number;
  integrity: number;
  /** Seconds until the next timed wave, or the next wave after an early clear. */
  nextWaveIn: number;
  offscreenBugs: number;
  frenzy: boolean;
  targets: SwarmTarget[];
  /** Spendable score funds the strongest affordable offscreen rescue. Resets each round. */
  rescue: { jumpCost: number; zapCost: number; mode: 'locked' | 'jump' | 'zap'; jumps: number; zaps: number };
}

export type SwarmEvent =
  | { type: 'status'; status: SwarmStatus }
  | {
      type: 'kill';
      points: number;
      x: number;
      y: number;
      combo: number;
      speedBonus: number;
      tierBonus: number;
      tier: number;
      age: number;
    }
  | { type: 'hit' | 'evolve'; id: number; hp: number; tier: number; x: number; y: number }
  | {
      type: 'bite';
      id: number;
      x: number;
      y: number;
      letter: string;
      binary: '0' | '1';
      lettersEaten: number;
      tier: number;
      full: boolean;
    }
  | { type: 'wave-start'; wave: number; count: number; reason: 'start' | 'timer' | 'clear' }
  | { type: 'wave-clear'; wave: number; bonus: number }
  | { type: 'damage'; targetId: string; health: number }
  | { type: 'scatter'; count: number; x: number; y: number; targetId?: string }
  | { type: 'rescue'; action: 'jump' | 'zap'; targetId: string; cost: number; killed: number; points: number; x: number; y: number; radius: number }
  | { type: 'restored' }
  | ({ type: 'gameover' } & SwarmSnapshot);

export interface SwarmCallbacks {
  onState?: (snapshot: SwarmSnapshot) => void;
  onEvent?: (event: SwarmEvent) => void;
}

/** Options understood by the browser engine, without a launcher or score panel. */
export interface SwarmCoreOptions extends SwarmCallbacks {
  targetSelector?: string;
  textSelector?: string;
  surfaceSelector?: string;
  bestKey?: string;
  reducedMotion?: boolean;
  /** Temporarily lock mobile pinch/double-tap zoom during a round; default true. */
  lockZoom?: boolean;
  document?: Document;
  drawBug?: (context: CanvasRenderingContext2D, bug: SwarmBug, time: number) => void;
}

/** Stable drawing fields; gameplay bookkeeping stays private to the engine. */
export interface SwarmBug {
  id: number;
  x: number;
  y: number;
  angle: number;
  size: number;
  tier: number;
  hp: number;
  color: string;
  age: number;
}

/** Low-level widget options. Most sites should use installSwarm instead. */
export interface SwarmGameOptions extends SwarmCoreOptions {
  initiallyClosed?: boolean;
  showLauncher?: boolean;
  onClose?: () => void;
}

export interface SwarmInstallOptions extends SwarmCallbacks {
  targetSelector?: string;
  textSelector?: string;
  surfaceSelector?: string;
  /** Local best score; mute preference uses this key plus ':sound'. */
  storageKey?: string;
  reducedMotion?: boolean;
  /** Temporarily lock mobile pinch/double-tap zoom during a round; default true. */
  lockZoom?: boolean;
  /** The plain key sequence is the portable default; false disables it. */
  keyboard?: 'sequence' | false;
  /** Hold marked footer text for 900ms, then tap it within the 5-second cue. */
  triggerSelector?: string | false;
  host?: HTMLElement;
  document?: Document;
  onError?: (error: unknown) => void;
}

/** A hidden installation. The heavy game module is loaded by open/start only. */
export interface SwarmInstallation {
  unlock(): void;
  open(): Promise<void>;
  start(): Promise<void>;
  /** Fold an active round to its target button while preserving its state. */
  minimize(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  hide(): void;
  destroy(): void;
  getSnapshot(): SwarmSnapshot | null;
  isUnlocked(): boolean;
}

/** The framework-free widget's controller, available after mounting. */
export interface SwarmController {
  open(): void;
  start(): void;
  /** Fold an active round to its target button while preserving its state. */
  minimize(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  destroy(): void;
  getSnapshot(): SwarmSnapshot;
}

export interface SwarmCoreController {
  start(): SwarmSnapshot;
  pause(): SwarmSnapshot;
  resume(): SwarmSnapshot;
  stop(): SwarmSnapshot;
  destroy(): void;
  getSnapshot(): SwarmSnapshot;
}

/** React owns destruction; open/start are safe to request while it is loading. */
export type SwarmGameHandle = Omit<SwarmInstallation, 'destroy'>;
