import { defineConfig } from "astro/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const kit = dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const { id } = JSON.parse(
  readFileSync(resolve(root, "site/config.json"), "utf8"),
);
export default defineConfig({
  root: root + "/",
  srcDir: resolve(root, "site/src") + "/",
  outDir: resolve(root, "artifacts/site") + "/",
  publicDir: resolve(root, "site/generated/public") + "/",
  devToolbar: { enabled: false },
  site: "https://coded-dot-design.github.io",
  base: process.env.SITE_BASE ?? `/${id}`,
  trailingSlash: "always",
  output: "static",
  server: { host: "0.0.0.0", port: 5173 },
  vite: {
    resolve: {
      alias: {
        "@site-kit": kit,
        "@character-art": resolve(root, "site/generated/character-art.json"),
        "@site-data": resolve(root, "site/generated/data.json"),
        "@game-registry": resolve(root, "site/generated/registry.ts"),
      },
    },
    server: { fs: { allow: [resolve(root, "..")] } },
  },
});
