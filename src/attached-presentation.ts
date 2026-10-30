import { ElementAttachments } from "./attachments.js";
import type { Target, Bug } from "./runtime-types.js";
import { targetSignal } from "./target-health.js";

/** Button-owned presentation. Scrolling never waits for the simulation frame. */
export class AttachedPresentation {
  private readonly attachments: ElementAttachments;
  private readonly signals = new Map<Target, HTMLElement>();
  private readonly bugs = new Map<
    Bug,
    { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
  >();
  private active = true;
  private readonly doc: Document;
  constructor(
    doc: Document,
    writeStyle: (
      el: HTMLElement,
      key: string,
      value: string,
      priority?: string,
    ) => void,
  ) {
    this.doc = doc;
    this.attachments = new ElementAttachments(doc, writeStyle);
  }
  setActive(active: boolean) {
    this.active = active;
    for (const signal of this.signals.values())
      signal.style.setProperty("--play", active ? "running" : "paused");
  }
  update(targets: readonly Target[], bugs: readonly Bug[], quiet: boolean) {
    for (const [target, signal] of this.signals)
      if (!targets.includes(target) || !target.element.isConnected) {
        signal.remove();
        this.attachments.remove(target.element);
        this.signals.delete(target);
      }
    for (const [bug, sprite] of this.bugs)
      if (
        !bugs.includes(bug) ||
        !bug.attached ||
        !bug.target?.element.isConnected
      ) {
        sprite.canvas.remove();
        this.bugs.delete(bug);
      }
    for (const target of targets) {
      if (!target.rendered || !target.element.isConnected) continue;
      let signal = this.signals.get(target);
      if (!signal) {
        const root = this.attachments.attach(target.element);
        if (!root) continue;
        const style = this.doc.createElement("style");
        style.textContent =
          ":host{pointer-events:none} .signal{position:absolute;inset:-3px;border-radius:inherit;pointer-events:none}.ring{position:absolute;inset:0;border:1.5px solid currentColor;border-radius:inherit;box-sizing:border-box;animation:pulse var(--period,1s) infinite;animation-play-state:var(--play,running)}.ring+ .ring{animation-delay:calc(var(--period,1s)*-.5)}.signal[data-quiet=true] .ring{animation:none;opacity:.35}.signal[data-quiet=true] .ring+ .ring{display:none}@keyframes pulse{from{transform:scale(1);opacity:.65}to{transform:scale(1.16);opacity:0}}";
        root.append(style);
        signal = this.doc.createElement("span");
        signal.className = "signal";
        for (let i = 0; i < 2; i++) {
          const ring = this.doc.createElement("i");
          ring.className = "ring";
          signal.append(ring);
        }
        root.append(signal);
        this.signals.set(target, signal);
      }
      const state = targetSignal(target.health, target.palette?.power);
      const key = `${state.color}|${target.health > 0}|${Math.round(state.period * 5)}|${this.active}|${quiet}`;
      if (signal.dataset.state !== key) {
        signal.style.color = state.color;
        signal.style.visibility = target.health > 0 ? "visible" : "hidden";
        signal.style.setProperty(
          "--period",
          `${Math.round(state.period * 5) / 5}s`,
        );
        signal.style.setProperty("--play", this.active ? "running" : "paused");
        signal.dataset.quiet = String(quiet);
        signal.dataset.state = key;
      }
    }
  }
  drawBug(
    bug: Bug,
    ratio: number,
    draw: (context: CanvasRenderingContext2D) => void,
  ): boolean {
    if (!bug.attached || !bug.target?.rendered) return false;
    const root = this.attachments.attach(bug.target.element);
    if (!root) return false;
    let sprite = this.bugs.get(bug);
    if (!sprite) {
      const canvas = this.doc.createElement("canvas");
      canvas.setAttribute("data-swarm-attached-bug", String(bug.id));
      canvas.style.cssText =
        "position:absolute;width:96px;height:96px;pointer-events:none;transform:translate(-50%,-50%)";
      const context = canvas.getContext("2d");
      if (!context) return false;
      sprite = { canvas, context };
      this.bugs.set(bug, sprite);
    }
    if (sprite.canvas.parentNode !== root) root.append(sprite.canvas);
    const { canvas, context } = sprite,
      r = bug.target.rect;
    canvas.style.left = `${((bug.x - r.left) / Math.max(1, r.width)) * 100}%`;
    canvas.style.top = `${((bug.y - r.top) / Math.max(1, r.height)) * 100}%`;
    const pixels = Math.round(96 * ratio);
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixels, pixels);
    context.setTransform(
      ratio,
      0,
      0,
      ratio,
      (48 - bug.x) * ratio,
      (48 - bug.y) * ratio,
    );
    draw(context);
    return true;
  }
  clear() {
    this.attachments.clear();
    this.signals.clear();
    this.bugs.clear();
  }
}
