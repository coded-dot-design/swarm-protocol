import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export function latestReleasePins(root, names) {
  const fallback = JSON.parse(
    readFileSync(resolve(root, "games.json"), "utf8"),
  );
  const pins = {},
    commits = {};
  for (const name of names) {
    const major = fallback[name].split(".")[0];
    const refs = execFileSync(
      "git",
      [
        "ls-remote",
        "--tags",
        `https://github.com/coded-dot-design/${name}.git`,
      ],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");
    const candidates = [];
    const peeled = new Map();
    for (const line of refs) {
      const [sha, ref] = line.split(/\s+/);
      const match = ref?.match(/^refs\/tags\/(v\d+\.\d+\.\d+)(\^\{\})?$/);
      if (!match) continue;
      if (match[2]) peeled.set(match[1], sha);
      else if (match[1].split(".")[0] === major)
        candidates.push({ version: match[1], sha });
    }
    candidates.sort((a, b) => {
      const av = a.version.slice(1).split(".").map(Number),
        bv = b.version.slice(1).split(".").map(Number);
      return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
    });
    const latest = candidates[0];
    if (!latest) throw Error(`No stable release for ${name}`);
    pins[name] = latest.version;
    commits[name] = peeled.get(latest.version) || latest.sha;
  }
  return { pins, commits };
}
