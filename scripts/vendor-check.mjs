// vendor/fizlet must be exactly the snapshot ORIGIN.json describes (never edited by hand).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const origin = JSON.parse(readFileSync("vendor/fizlet/ORIGIN.json", "utf8"));
const files = [];
const walk = (d) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : files.push(relative("vendor/fizlet", join(d, n)))));
walk("vendor/fizlet");
const listed = new Map(origin.files.map((f) => [f.path, f.sha256]));
const bad = files.filter((f) => f !== "ORIGIN.json" && listed.get(f) !== createHash("sha256").update(readFileSync(join("vendor/fizlet", f))).digest("hex"));
const missing = [...listed.keys()].filter((f) => !files.includes(f));
if (bad.length || missing.length) throw new Error(`vendor/fizlet differs from its ORIGIN.json: ${[...bad, ...missing].join(", ")} (run npm run sync)`);
console.log(`vendor/fizlet: Fizlet ${origin.version} (${origin.commit.slice(0, 7)}), ${files.length - 1} files verified`);
