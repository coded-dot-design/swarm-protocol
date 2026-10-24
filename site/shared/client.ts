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
      html.dataset.theme === "dark" ? "#100a1b" : "#f6f7f8",
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
  // Lazy games may emit idle before start resolves; reveal the bar again
  // when that same session becomes active.
  bar.hidden = state === "destroyed" || state === "idle";
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-launch]",
))
  button.addEventListener("click", async () => {
    recall(false);
    focused = button;
    const request = epoch;
    const id = button.dataset.launch!;
    const select = document.querySelector<HTMLSelectElement>(
      `[data-release="${id}"]`,
    );
    const key = select?.value || id;
    const version = select?.selectedOptions[0]?.dataset.version;
    const load = registry[key as keyof typeof registry];
    if (!load) return;
    nameLabel.textContent =
      button.textContent?.replace(/^\s*Play /, "").trim() || id;
    if (version) nameLabel.textContent += ` ${version}`;
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
      // Protected launcher controls must release focus so Space drives the game
      // instead of activating Play again. Recall restores focus to this button.
      button.blur();
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
  pause.blur();
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
      const label = button.querySelector("[data-copy-label]");
      if (label) label.textContent = "Copied";
      button.classList.add("is-copied");
      setTimeout(() => {
        if (label) label.textContent = "Copy code";
        button.classList.remove("is-copied");
      }, 2000);
    } catch {
      announce("Clipboard unavailable. Select the code to copy it.");
    }
  });

// Expand navigation without squeezing the brand or hiding links on small screens.
const header = document.querySelector<HTMLElement>(".site-header")!;
const menu = document.querySelector<HTMLButtonElement>(".menu-toggle")!;
const mobile = matchMedia("(max-width: 760px)");
function closeMenu(restoreFocus = false) {
  header.dataset.menuOpen = "false";
  menu.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-label", "Open menu");
  if (restoreFocus) menu.focus();
}
header.dataset.navReady = "true";
closeMenu();
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  header.dataset.menuOpen = String(open);
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
header
  .querySelectorAll("nav a")
  .forEach((link) => link.addEventListener("click", () => closeMenu()));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && header.dataset.menuOpen === "true")
    closeMenu(true);
});
document.addEventListener("pointerdown", (event) => {
  if (mobile.matches && !header.contains(event.target as Node)) closeMenu();
});
mobile.addEventListener("change", () => closeMenu());

// CSS owns the motion. Observe visibility once per illustration to avoid offscreen work.
const diagrams = document.querySelectorAll<HTMLElement>(
  ".system-map,.tick-map,.ownership-map,.hero-crossover",
);
const visibleDiagrams = new Set<Element>();
function syncDiagramMotion() {
  diagrams.forEach(
    (diagram) =>
      (diagram.dataset.motion = String(
        !document.hidden &&
          diagram.dataset.paused !== "true" &&
          visibleDiagrams.has(diagram),
      )),
  );
}
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) =>
        entry.isIntersecting
          ? visibleDiagrams.add(entry.target)
          : visibleDiagrams.delete(entry.target),
      );
      syncDiagramMotion();
    },
    { threshold: 0.1 },
  );
  diagrams.forEach((diagram) => observer.observe(diagram));
  document.addEventListener("visibilitychange", syncDiagramMotion);
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    visibleDiagrams.clear();
    syncDiagramMotion();
  });
  window.addEventListener("pageshow", () =>
    diagrams.forEach((diagram) => observer.observe(diagram)),
  );
  diagrams.forEach((diagram) =>
    diagram
      .querySelector<HTMLButtonElement>("[data-motion-toggle]")
      ?.addEventListener("click", (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const paused = diagram.dataset.paused !== "true";
        diagram.dataset.paused = String(paused);
        button.setAttribute("aria-pressed", String(paused));
        button.setAttribute(
          "aria-label",
          `${paused ? "Resume" : "Pause"} ${button.dataset.motionLabel || "diagram"} animation`,
        );
        button.title = paused ? "Resume animation" : "Pause animation";
        syncDiagramMotion();
      }),
  );
}
