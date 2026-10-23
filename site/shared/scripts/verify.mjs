import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = process.cwd();
const { id } = JSON.parse(readFileSync("site/config.json", "utf8"));
const base = (process.env.SITE_BASE ?? `/${id}`).replace(/\/$/, "");
const output = resolve(root, "artifacts/site");
const html = readFileSync(resolve(output, "index.html"), "utf8");
const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
  .map((m) => m[1])
  .filter((url) => url.startsWith("/") && !url.startsWith("//"));
assert(
  assets.some((url) => url.endsWith(".js")),
  "Production HTML must include the interactive launcher script.",
);
assert(
  assets.some((url) => url.endsWith(".css")),
  "Production HTML must include its styles.",
);
for (const url of assets) {
  assert(url.startsWith(`${base}/`), `Wrong Pages base: ${url}`);
  assert(
    existsSync(resolve(output, url.slice(base.length + 1))),
    `Missing production asset: ${url}`,
  );
}
assert(html.includes("Chris Cooley"), "Creator credit missing.");
console.log(
  `Verified ${id}: rendered page, launcher script, CSS and ${assets.length} asset paths.`,
);
