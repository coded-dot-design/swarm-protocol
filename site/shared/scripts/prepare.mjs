import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { latestReleasePins } from "./latest.mjs";
import { prepareArchives } from "./releases.mjs";
const root = process.cwd();
const config = JSON.parse(
  readFileSync(resolve(root, "site/config.json"), "utf8"),
);
const names =
  config.id === "dom-virus"
    ? Object.keys(JSON.parse(readFileSync(resolve(root, "games.json"), "utf8")))
    : [config.id];
let roots = {};
const latest =
  config.id === "dom-virus" && process.env.DOM_VIRUS_LATEST_RELEASES === "1"
    ? latestReleasePins(root, names)
    : null;
if (latest) process.env.DOM_VIRUS_GAME_PINS_JSON = JSON.stringify(latest.pins);
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
const archives = prepareArchives(root, names);
const games = [];
for (const name of names) {
  const gameRoot = roots[name];
  const pkg = read(resolve(gameRoot, "package.json"));
  if (latest) {
    const actual = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: gameRoot,
      encoding: "utf8",
    }).trim();
    if (
      actual !== latest.commits[name] ||
      `v${pkg.version}` !== latest.pins[name]
    )
      throw new Error(`Resolved release changed during build: ${name}`);
  }
  if (!existsSync(resolve(gameRoot, "dist/index.js"))) {
    // Swarm's compiled output is intentionally untracked. Build its existing source.
    execFileSync("npm", ["ci", "--no-audit", "--no-fund"], {
      cwd: gameRoot,
      stdio: "inherit",
    });
    execFileSync("npm", ["run", "build"], { cwd: gameRoot, stdio: "inherit" });
  }
  const contentPath = resolve(gameRoot, "site/game.json");
  let content;
  if (existsSync(contentPath)) content = read(contentPath);
  else {
    // Website content can advance independently of an unchanged game release.
    // Fetch only a pinned commit; do not switch the game's checked-out version.
    const ref = config.contentRefs?.[name];
    if (!ref || !/^[a-f0-9]{40}$/.test(ref))
      throw new Error(`Missing pinned site content for ${name}`);
    execFileSync("git", ["fetch", "--depth", "1", "origin", ref], {
      cwd: gameRoot,
      stdio: "inherit",
    });
    content = JSON.parse(
      execFileSync("git", ["show", `${ref}:site/game.json`], {
        cwd: gameRoot,
        encoding: "utf8",
      }),
    );
  }
  if (content.id !== name) throw new Error(`Wrong game content for ${name}`);
  const metrics =
    name === "swarm-protocol"
      ? swarmSize(gameRoot)
      : {
          ...size(resolve(gameRoot, "dist/index.js")),
          files: ["dist/index.js"],
        };
  games.push({
    ...content,
    version: pkg.version,
    package: pkg.name,
    metrics,
    archives: archives[name] || [],
  });
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
  "sherman-bytes": "createShermanBytes",
  "swarm-protocol": "installSwarm",
};
writeFileSync(
  resolve(out, "registry.ts"),
  `export const registry = {\n${names.map((name) => `${JSON.stringify(name)}: async () => (await import(${JSON.stringify(resolve(roots[name], "dist/index.js"))})).${factories[name]}`).join(",\n")}\n};\n`,
);
const archiveEntries = names.flatMap((name) =>
  (archives[name] || []).map(
    (entry) =>
      `${JSON.stringify(entry.key)}: async () => (await import(/* @vite-ignore */ import.meta.env.BASE_URL + ${JSON.stringify(entry.path)})).${factories[name]}`,
  ),
);
if (archiveEntries.length) {
  const registryPath = resolve(out, "registry.ts");
  const registrySource = readFileSync(registryPath, "utf8");
  writeFileSync(
    registryPath,
    registrySource.replace("\n};", ",\n" + archiveEntries.join(",\n") + "\n};"),
  );
}
console.log(
  `Site ready: ${config.id}; ${games.length} game(s). Metrics measured from built distribution files.`,
);
