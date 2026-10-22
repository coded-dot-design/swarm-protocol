import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const metadata = JSON.parse(await readFile('package.json', 'utf8'));
await rm('dist', { recursive: true, force: true });
await mkdir('artifacts', { recursive: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: {
    index: 'src/index.ts',
    deferred: 'src/deferred.ts',
    react: 'integration/react.ts',
    core: 'src/core.ts',
    widget: 'src/widget.ts',
  },
  outdir: 'dist',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  charset: 'utf8',
  external: ['react', 'react/*'],
  legalComments: 'eof',
  metafile: true,
  banner: {
    js: `/*! Swarm Protocol ${metadata.version} | Copyright 2026 Chris Cooley | MIT; Lucide bug geometry ISC. See LICENSE and THIRD_PARTY_NOTICES.md. */`,
  },
});

// Keep the React boundary recognizable to hosts that use server components.
const reactPath = join(root, 'dist/react.js');
const reactSource = await readFile(reactPath, 'utf8');
if (!/^['"]use client['"];/.test(reactSource)) {
  await writeFile(reactPath, `'use client';\n${reactSource}`);
}

execFileSync(process.execPath, [
  join(root, 'node_modules/typescript/bin/tsc'),
  '--project', 'tsconfig.types.json',
], { stdio: 'inherit' });

// TypeScript emits the TS/TSX declarations; copy the JS modules' authored types.
for (const entry of await readdir('src')) {
  if (entry.endsWith('.d.ts')) {
    await mkdir('dist/types/src', { recursive: true });
    await copyFile(join('src', entry), join('dist/types/src', entry));
  }
}
for (const [name, target] of Object.entries({
  index: 'src/index',
  deferred: 'src/deferred',
  react: 'integration/react',
  core: 'src/core',
  widget: 'src/widget',
})) {
  const defaultExport = name === 'react' ? `export { default } from './types/${target}.js';\n` : '';
  await writeFile(`dist/${name}.d.ts`, `export * from './types/${target}.js';\n${defaultExport}`);
}
await writeFile('artifacts/build-meta.json', JSON.stringify(result.metafile, null, 2) + '\n');
console.log('Built minified ESM entries, lazy chunks, and declarations.');
