// Snapshot the engine Swarm Protocol is built on (a sibling checkout), with provenance:
//   ../fizlet/src → vendor/fizlet
// Never edit vendor/ by hand: change coded-dot-design/fizlet, then run node scripts/sync.mjs.
import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
rmSync("vendor/fizlet", { recursive: true, force: true });
cpSync("../fizlet/src", "vendor/fizlet", { recursive: true, filter: (p) => !p.endsWith(".md") });
const files = [];
const walk = (d) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : files.push(join(d, n))));
walk("vendor/fizlet");
const origin = {
  note: "Generated snapshot. Edit coded-dot-design/fizlet, then run node scripts/sync.mjs.",
  repository: "https://github.com/coded-dot-design/fizlet",
  version: JSON.parse(readFileSync("../fizlet/package.json", "utf8")).version,
  commit: execFileSync("git", ["-C", "../fizlet", "rev-parse", "HEAD"]).toString().trim(),
  files: files.sort().map((f) => ({ path: relative("vendor/fizlet", f), sha256: sha(f) })),
};
writeFileSync("vendor/fizlet/ORIGIN.json", JSON.stringify(origin, null, 2) + "\n");
console.log(`synced vendor/fizlet (Fizlet ${origin.version}, ${origin.commit.slice(0, 7)})`);
