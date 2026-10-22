import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const metadata = JSON.parse(await readFile('package.json', 'utf8'));
const { version } = metadata;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('Release builds require a stable major.minor.patch package version.');
}
const meta = JSON.parse(await readFile('artifacts/build-meta.json', 'utf8'));
const releaseName = `swarm-protocol-drop-in-${version}`;
const kit = resolve('artifacts', releaseName);
const output = resolve(kit, 'public/swarm-protocol', version);
await rm(kit, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(resolve(kit, 'components'), { recursive: true });
await mkdir(resolve(kit, 'browser-test'), { recursive: true });
await mkdir(resolve(kit, 'verification'), { recursive: true });

const visited = new Set();
const manifest = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function copyRuntime(name) {
  if (visited.has(name)) return;
  visited.add(name);
  if (!name.startsWith('dist/') || name.includes('..')) throw new Error(`Unsafe output path: ${name}`);
  const info = meta.outputs[name];
  if (!info) throw new Error(`Missing build output: ${name}. Run npm run check first.`);
  const bytes = await readFile(name);
  if (!bytes.toString('utf8').startsWith(`/*! Swarm Protocol ${version} |`)) {
    throw new Error('Stale build version. Run npm run check before packaging a release.');
  }
  const path = relative('dist', name).split('\\').join('/');
  const destination = resolve(output, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  manifest.push({ path, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: digest(bytes) });
  for (const dependency of info.imports || []) {
    if (dependency.external) throw new Error(`Unexpected external runtime import: ${dependency.path}`);
    await copyRuntime(posix.normalize(dependency.path));
  }
}
await copyRuntime('dist/deferred.js');

for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(file, resolve(output, file));
  await copyFile(file, resolve(kit, file));
}
const installer = (await readFile('integration/drop-in/install.js', 'utf8'))
  .replace(/^\/\*! Swarm Protocol [^|]+\|/, `/*! Swarm Protocol ${version} |`);
await writeFile(resolve(output, 'install.js'), installer);
const component = await readFile('integration/drop-in/SwarmDropIn.astro', 'utf8');
const versionedPath = /swarm-protocol\/\d+\.\d+\.\d+\/install\.js/g;
if ([...component.matchAll(versionedPath)].length !== 1) throw new Error('Expected one versioned script path in the Astro component.');
await writeFile(resolve(kit, 'components/SwarmDropIn.astro'), component.replace(versionedPath, `swarm-protocol/${version}/install.js`));
const guide = await readFile('docs/DROP-IN.md', 'utf8');
const guideVersion = guide.match(/^# Swarm Protocol (\d+\.\d+\.\d+)/)?.[1];
if (!guideVersion) throw new Error('Expected the drop-in guide to declare its example version.');
await writeFile(resolve(kit, 'README.md'), guide.replaceAll(guideVersion, version));

const result = await build({
  entryPoints: ['scripts/browser-test-entry.mjs'],
  bundle: true, splitting: false, write: false,
  format: 'iife', globalName: 'swarmTestModule', platform: 'browser',
  target: 'es2020', minify: true, charset: 'utf8', legalComments: 'eof',
  define: { __SWARM_VERSION__: JSON.stringify(version) },
  metafile: true,
});
for (const item of Object.values(result.metafile.outputs)) {
  if (item.imports.length) throw new Error('The browser test must not import other game files.');
}
const header = [
  `/* Swarm Protocol ${version} — temporary browser test. MIT © 2026 Chris Cooley.`,
  ' * Paste this whole file into Chrome/Edge DevTools > Sources > Snippets.',
  ' * Edit the settings below to match your exact CTA and static text regions.',
  ' * Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac) runs the snippet.',
  ' * Escape hides/relocks. Refresh removes the injected game.',
  ' * This embeds the whole game; use the public/ folder for production loading.',
  ' * Retain LICENSE and THIRD_PARTY_NOTICES.md when redistributing.',
  ' */',
  '(() => {',
  '  const settings = {',
  "    targetSelector: '[data-swarm-target]',",
  "    textSelector: '[data-swarm-text]',",
  "    surfaceSelector: '[data-swarm-surface]',",
  "    triggerSelector: '[data-swarm-trigger]',",
  '    autoOpen: true, // Use false to test normal secret activation.',
  '  };',
].join('\n');
const browserScript = `${header}\n${result.outputFiles[0].text}\n  swarmTestModule.runBrowserTest(settings);\n})();\n`;
const browserFile = resolve(kit, 'browser-test/swarm-browser-test.js');
await writeFile(browserFile, browserScript);
execFileSync(process.execPath, ['--check', browserFile], { stdio: 'inherit' });

manifest.sort((a, b) => a.path.localeCompare(b.path, 'en'));
await writeFile(resolve(kit, 'verification/runtime-manifest.json'), JSON.stringify({
  version,
  note: 'Runtime files copied byte-for-byte from this build. All runtime imports are local relative paths.',
  files: manifest,
  installer: { bytes: Buffer.byteLength(installer), gzipBytes: gzipSync(installer).length, sha256: digest(installer) },
  browserTest: { bytes: Buffer.byteLength(browserScript), gzipBytes: gzipSync(browserScript).length, sha256: digest(browserScript) },
}, null, 2) + '\n');
await writeFile(resolve(kit, 'verification/verification.txt'), [
  `Swarm Protocol ${version} — release artifact`,
  '',
  'The release builder validates the complete local runtime import graph,',
  'copies emitted files without modifying them, checks the generated browser',
  'script syntax, and records SHA-256 hashes in runtime-manifest.json.',
  'The GitHub release workflow requires npm run check before this packaging',
  'step. That gate runs type checking, the build, and regression tests.',
  '',
  'Shadow DOM contains the game UI; participating page content is intentionally',
  'modified during play. Test the integration on your actual site and devices.',
  'The browser-test file bundles the entire game and is not a production',
  'lazy-loading benchmark. No GitHub or npm connection is needed at runtime.',
  '',
].join('\n'));

const archive = resolve('artifacts', `${releaseName}.zip`);
execFileSync('python3', ['scripts/zip-release.py', kit, archive], { stdio: 'inherit' });
const archiveBytes = await readFile(archive);
await writeFile('artifacts/SHA256SUMS.txt', `${digest(archiveBytes)}  ${releaseName}.zip\n`);
console.log(`Prepared ${relative(root, archive)} (${archiveBytes.length} bytes) and artifacts/SHA256SUMS.txt`);
