declare module "@game-registry" {
  interface Snapshot {
    status?: string;
    score?: number;
  }
  interface Controller {
    start(): unknown;
    pause(): void;
    resume(): void;
    destroy(): void;
    getSnapshot(): Snapshot;
  }
  export const registry: Record<
    string,
    () => Promise<(options: Record<string, unknown>) => Controller>
  >;
}
