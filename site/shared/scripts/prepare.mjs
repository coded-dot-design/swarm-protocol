import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
const root = process.cwd();
const config = JSON.parse(
  readFileSync(resolve(root, "site/config.json"), "utf8"),
);
const names =
  config.id === "dom-virus"
    ? ["null-invaders", "byte-runner", "swarm-protocol"]
    : [config.id];
let roots = {};
if (config.id === "dom-virus") {
  await import(
    pathToFileURL(resolve(root, "scripts/prepare-playground.mjs")).href
  );
  const { gameRoot } = await import(
    pathToFileURL(resolve(root, "scripts/game-paths.mjs")).href
  );
  roots = Object.fromEntries(names.map((name) => [name, gameRoot(name)]));
} else roots[config.id] = root;
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
function size(file) {
  const bytes = readFileSync(file);
  return { raw: bytes.length, gzip: gzipSync(bytes).length };
}
function swarmSize(gameRoot) {
  // Walk the emitted module graph; each file is counted once per activation path.
  const seen = new Set();
  function walk(file, dynamic) {
    if (seen.has(file)) return;
    seen.add(file);
    const js = readFileSync(file, "utf8");
    const patterns = dynamic
      ? [
          /\b(?:from|import)\s*["']([^"']+)["']/g,
          /\bimport\(["']([^"']+)["']\)/g,
        ]
      : [/\b(?:from|import)\s*["']([^"']+)["']/g];
    for (const pattern of patterns)
      for (const match of js.matchAll(pattern))
        if (match[1].startsWith("."))
          walk(resolve(file, "..", match[1]), dynamic);
  }
  walk(resolve(gameRoot, "dist/index.js"), false);
  const initial = [...seen].reduce((n, file) => n + size(file).gzip, 0);
  seen.clear();
  walk(resolve(gameRoot, "dist/index.js"), true);
  const files = [...seen];
  return {
    initial,
    raw: files.reduce((n, f) => n + size(f).raw, 0),
    gzip: files.reduce((n, f) => n + size(f).gzip, 0),
    files: files.map((f) => f.slice(gameRoot.length + 1)),
  };
}
const games = [];
for (const name of names) {
  const gameRoot = roots[name];
  const pkg = read(resolve(gameRoot, "package.json"));
  if (!existsSync(resolve(gameRoot, "dist/index.js"))) {
    // Swarm's compiled output is intentionally untracked. Build its existing source.
    execFileSync("npm", ["ci", "--no-audit", "--no-fund"], {
      cwd: gameRoot,
      stdio: "inherit",
    });
    execFileSync("npm", ["run", "build"], { cwd: gameRoot, stdio: "inherit" });
  }
  const content = read(resolve(gameRoot, "site/game.json"));
  const metrics =
    name === "swarm-protocol"
      ? swarmSize(gameRoot)
      : {
          ...size(resolve(gameRoot, "dist/index.js")),
          files: ["dist/index.js"],
        };
  games.push({ ...content, version: pkg.version, package: pkg.name, metrics });
}
const out = resolve(root, "site/generated");
mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "data.json"),
  JSON.stringify({ ...config, games }, null, 2) + "\n",
);
const factories = {
  "null-invaders": "createNullInvaders",
  "byte-runner": "createByteRunner",
  "swarm-protocol": "installSwarm",
};
writeFileSync(
  resolve(out, "registry.ts"),
  `export const registry = {\n${names.map((name) => `${JSON.stringify(name)}: async () => (await import(${JSON.stringify(resolve(roots[name], "dist/index.js"))})).${factories[name]}`).join(",\n")}\n};\n`,
);
console.log(
  `Site ready: ${config.id}; ${games.length} game(s). Metrics measured from built distribution files.`,
);
