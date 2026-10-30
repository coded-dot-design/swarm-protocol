// The built package in a real browser (Chromium): a round on a real page, bugs eating its letters
// into bits and draining its buttons, shooting them, a layer over a paragraph keeping its letters
// safe, the page's own links and fields, pause, frame work, game over, a round in an iframe's
// document, and Recall giving every page back byte for byte.
// Run after `npm run build`: node tests/browser.mjs (CHROMIUM_PATH picks a browser binary).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
if (!existsSync("dist/core.js")) throw new Error("Build first: npm run build");
const types = { ".html": "text/html", ".js": "text/javascript" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(root, path === "/" ? "tests/fixtures/page.html" : path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const snapshot = (page) => page.evaluate(() => document.documentElement.outerHTML);
/** The page without Swarm's own hosts (its canvas overlay and edge cues stay until destroy). */
const pageOnly = (page) =>
  page.evaluate(() => {
    const own = [...document.querySelectorAll("[data-swarm-overlay],[data-swarm-attack-cues]")].map((el) => [el, el.parentNode, el.nextSibling]);
    own.forEach(([el]) => el.remove());
    const html = document.documentElement.outerHTML;
    own.forEach(([el, parent, next]) => parent.insertBefore(el, next));
    return html;
  });
const state = (page) => page.evaluate(() => window.game.getSnapshot());
/** Start a controller on the page: events and the frame work of every animation frame are recorded;
 *  with `track`, bug positions too (drawn as plain dots). */
const launch = (page, opts = {}) =>
  page.evaluate(async ({ track }) => {
    const { createDomDefender } = await import("/dist/core.js");
    window.events = [];
    window.work = [];
    window.bugs = new Map();
    if (!window.timed) {
      window.timed = true;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (f) => raf((t) => { const t0 = performance.now(); f(t); window.work.push(performance.now() - t0); });
    }
    const drawBug = track ? (ctx, b) => { window.bugs.set(b.id, { x: b.x, y: b.y, tier: b.tier, hp: b.hp }); ctx.fillRect(b.x - 4, b.y - 4, 8, 8); } : undefined;
    window.game = createDomDefender({ drawBug, onEvent: (e) => window.events.push(e) });
    window.game.start();
  }, opts);
let where = "start";
try {
  where = "play and recall";
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const before = await snapshot(page);
  // A layer over one paragraph (#lid: a menu, a dialog): its letters are not food.
  const covered = await page.locator("#cover").textContent();
  await launch(page);
  let s = await state(page);
  assert.equal(s.status, "running");
  assert.equal(s.wave, 1);
  assert.deepEqual(s.targets.map((t) => t.id), ["alpha", "beta"]);
  await page.waitForFunction(() => window.events.filter((e) => e.type === "bite").length >= 12 && window.events.some((e) => e.type === "damage"), null, { timeout: 30000 });
  const text = await page.locator("main").innerText();
  assert.match(text, /[01]/, "letters became bits");
  const bite = await page.evaluate(() => window.events.find((e) => e.type === "bite"));
  assert.match(bite.letter, /\p{L}/u);
  assert.match(bite.binary, /^[01]$/);
  assert.equal(await page.locator("#cover").textContent(), covered, "letters under a layer are not eaten");
  assert.equal(await page.locator("#alpha").getAttribute("data-swarm-infected"), "active", "a drained button is painted");
  // Typing in the page's own field stays the page's.
  await page.click("#field");
  await page.keyboard.type("hi there");
  assert.equal(await page.inputValue("#field"), "hi there");
  await page.locator("#field").blur();
  // Escape pauses (time stands still), Escape resumes.
  await page.mouse.move(640, 400);
  await page.keyboard.press("Escape");
  assert.equal((await state(page)).status, "paused");
  const t = (await state(page)).elapsed, text0 = await page.locator("main").innerText();
  await page.waitForTimeout(400);
  assert.equal((await state(page)).elapsed, t, "paused time stands still");
  assert.equal(await page.locator("main").innerText(), text0, "and nothing is eaten");
  await page.keyboard.press("Escape");
  assert.equal((await state(page)).status, "running");
  // Recall: stop gives every letter, style and attribute back (the overlay host stays until destroy).
  await page.evaluate(() => window.game.stop());
  await page.fill("#field", "");
  assert.equal(await pageOnly(page), before, "Recall restores the page exactly");
  await page.evaluate(() => window.game.destroy());
  assert.equal(await snapshot(page), before, "destroy removes the overlay too");

  where = "shooting";
  await launch(page, { track: true });
  await page.waitForFunction(() => window.bugs.size >= 3, null, { timeout: 10000 });
  for (let k = 0; k < 40 && !(await page.evaluate(() => window.events.some((e) => e.type === "kill"))); k++) {
    const b = await page.evaluate(() => [...window.bugs.values()].find((b) => b.x > 20 && b.y > 20 && b.x < 1000 && b.y < 640));
    if (b) await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(30);
  }
  s = await state(page);
  assert.ok(s.kills > 0 && s.score > 0, `a shot bug dies and scores (${s.score})`);
  const kill = await page.evaluate(() => window.events.find((e) => e.type === "kill"));
  assert.ok(kill.points >= 10);

  where = "frame time";
  await page.evaluate(() => (window.work.length = 0));
  await page.waitForTimeout(4000);
  const work = await page.evaluate(() => window.work.slice());
  const avg = work.reduce((a, b) => a + b, 0) / work.length;
  console.log(`frame work: ${work.length} frames, average ${avg.toFixed(2)} ms, max ${Math.max(...work).toFixed(2)} ms (${(await state(page)).alive} bugs)`);
  assert.ok(avg < 4, `average frame work ${avg.toFixed(2)} ms`);
  await page.evaluate(() => window.game.destroy());
  assert.equal(await snapshot(page), before, "destroy restores the page exactly");
  assert.deepEqual(errors, []);
  await page.close();

  where = "game over";
  // One small button, nothing to eat: the waves drain it and the round ends; the page comes back.
  const over = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await over.goto(url);
  await over.evaluate(() => {
    document.getElementById("beta").remove();
    for (const el of document.querySelectorAll("[data-swarm-text]")) el.removeAttribute("data-swarm-text");
  });
  const bare = await snapshot(over);
  await launch(over);
  await over.waitForFunction(() => window.game.getSnapshot().status === "gameover", null, { timeout: 240000 });
  assert.equal((await state(over)).integrity, 0);
  await over.waitForFunction(() => window.events.some((e) => e.type === "restored"), null, { timeout: 5000 });
  assert.equal(await pageOnly(over), bare, "the page is back after the round ends");
  await over.evaluate(() => window.game.destroy());
  assert.equal(await snapshot(over), bare);
  await over.close();

  where = "iframe document";
  // The controller runs in the document it is given: the letters, buttons and Recall of the frame.
  const host = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await host.goto(url);
  await host.evaluate(async () => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "width:900px;height:600px;border:0";
    document.body.prepend(frame);
    await new Promise((ok) => { frame.onload = ok; frame.src = "/"; });
  });
  const frameDoc = () => host.evaluate(() => document.querySelector("iframe").contentDocument.documentElement.outerHTML);
  const framed = await frameDoc(), outer = await snapshot(host);
  await host.evaluate(async () => {
    const { createDomDefender } = await import("/dist/core.js");
    window.events = [];
    window.game = createDomDefender({ document: document.querySelector("iframe").contentDocument, onEvent: (e) => window.events.push(e) });
    window.game.start();
  });
  await host.waitForFunction(() => window.events.filter((e) => e.type === "bite").length >= 4, null, { timeout: 30000 });
  assert.match(await host.evaluate(() => document.querySelector("iframe").contentDocument.querySelector("main").innerText), /[01]/, "the frame's letters became bits");
  assert.deepEqual((await state(host)).targets.map((t) => t.id), ["alpha", "beta"]);
  await host.evaluate(() => window.game.destroy());
  assert.equal(await frameDoc(), framed, "Recall restores the frame's page exactly");
  assert.equal(await snapshot(host), outer, "and the outer page was never touched");
  await host.close();
  console.log("Swarm Protocol browser: letters to bits, buttons drained, a covered paragraph kept, fields, pause, Recall exact, shooting, frame time, game over (page back), iframe document passed.");
} catch (err) {
  console.error(`browser test failed at: ${where}`);
  // On CI, also as an annotation (readable from the checks API without the log).
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=browser test failed at ${where}::${String(err?.message ?? err).replace(/\r?\n/g, " ").slice(0, 900)}`);
  throw err;
} finally {
  await browser.close();
  server.close();
}
