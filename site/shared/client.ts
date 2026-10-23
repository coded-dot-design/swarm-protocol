import { registry } from "@game-registry";
type Snapshot = { status?: string; score?: number };
type Controller = {
  start(): unknown;
  pause(): void;
  resume(): void;
  destroy(): void;
  getSnapshot(): Snapshot;
};
const html = document.documentElement;
const media = matchMedia("(prefers-color-scheme: dark)");
const themeButtons = document.querySelectorAll<HTMLButtonElement>(
  "[data-theme-choice]",
);
function applyTheme(preference: string) {
  html.dataset.preference = preference;
  html.dataset.theme =
    preference === "system" ? (media.matches ? "dark" : "light") : preference;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      html.dataset.theme === "dark" ? "#101212" : "#f5f6f2",
    );
  themeButtons.forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.themeChoice === preference),
    ),
  );
}
applyTheme(html.dataset.preference || "system");
media.addEventListener("change", () =>
  applyTheme(html.dataset.preference || "system"),
);
themeButtons.forEach((button) =>
  button.addEventListener("click", () => {
    const choice = button.dataset.themeChoice!;
    try {
      localStorage.setItem("dom-virus:theme", choice);
    } catch {}
    applyTheme(choice);
  }),
);
const status = document.querySelector<HTMLElement>("#site-status")!;
const bar = document.querySelector<HTMLElement>(".session-bar")!;
const stateLabel = document.querySelector<HTMLElement>("#session-state")!;
const nameLabel = document.querySelector<HTMLElement>("#session-name")!;
const pause = document.querySelector<HTMLButtonElement>("#session-pause")!;
let current: Controller | null = null;
let epoch = 0;
let focused: HTMLElement | null = null;
let statusTimer: ReturnType<typeof setTimeout>;
function announce(message: string) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => {
    status.textContent = "";
  }, 7000);
}
function recall(focus = true) {
  epoch++;
  const previous = current;
  current = null;
  previous?.destroy();
  bar.hidden = true;
  document
    .querySelectorAll("[data-launch]")
    .forEach((b) => b.removeAttribute("aria-busy"));
  if (focus) focused?.focus({ preventScroll: true });
}
function update(snapshot: Snapshot) {
  const state = snapshot.status || "running";
  stateLabel.textContent = state;
  pause.textContent = state === "paused" ? "Resume" : "Pause";
  pause.disabled = !["running", "paused", "intermission"].includes(state);
  if (state === "destroyed") {
    bar.hidden = true;
  }
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-launch]",
))
  button.addEventListener("click", async () => {
    recall(false);
    focused = button;
    const request = epoch;
    const id = button.dataset.launch!;
    const load = registry[id as keyof typeof registry];
    if (!load) return;
    nameLabel.textContent =
      button.textContent
        ?.replace("▶", "")
        .replace(/^\s*Play /, "")
        .trim() || id;
    stateLabel.textContent = "loading";
    pause.disabled = true;
    bar.hidden = false;
    button.setAttribute("aria-busy", "true");
    try {
      const factory = await load();
      if (request !== epoch) return;
      const onState = (snapshot: Snapshot) => {
        if (request === epoch) update(snapshot);
      };
      current =
        id === "swarm-protocol"
          ? factory({
              textSelector: "#board :is(h1,h2,h3,p,li)",
              targetSelector: "[data-arcade-target]",
              keyboard: false,
              triggerSelector: false,
              storageKey: "dom-virus:swarm",
              onState,
            })
          : factory({
              root: "#board",
              textSelector: "h1,h2,h3,p,li",
              targetSelector: "[data-arcade-target]",
              theme: html.dataset.theme,
              excludeSelector:
                "[data-virus-ignore], pre, code, input, textarea, select, [contenteditable]",
              onState,
            });
      const controller = current!;
      await controller.start();
      if (request !== epoch) return;
      update(controller.getSnapshot());
      button.removeAttribute("aria-busy");
      announce(
        `${nameLabel.textContent} is live. Press Escape or Recall to restore the page.`,
      );
    } catch (error) {
      if (request !== epoch) return;
      recall();
      console.error(error);
      announce("The game could not load. Please reload and try again.");
    }
  });
pause.addEventListener("click", () => {
  if (!current) return;
  if (current.getSnapshot().status === "paused") current.resume();
  else current.pause();
  update(current.getSnapshot());
});
document.querySelector("#session-recall")!.addEventListener("click", () => {
  recall();
  announce("Session ended. Game-owned page changes recalled.");
});
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && !bar.hidden) {
      recall();
      announce("Session ended. Game-owned page changes recalled.");
    }
  },
  true,
);
window.addEventListener("pagehide", () => recall(false));
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy]",
))
  button.addEventListener("click", async () => {
    const code =
      button.closest(".code-example")?.querySelector("code")?.textContent || "";
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy code"), 2000);
    } catch {
      announce("Clipboard unavailable. Select the code to copy it.");
    }
  });
