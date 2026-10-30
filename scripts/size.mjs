import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const meta = JSON.parse(await readFile('artifacts/build-meta.json', 'utf8'));
const files = Object.keys(meta.outputs).filter(name => name.endsWith('.js'));
let raw = 0, gzip = 0;
const sizes = new Map();
for (const file of files) {
  const source = await readFile(file);
  const compressed = gzipSync(source).length;
  sizes.set(file, { raw: source.length, gzip: compressed });
  raw += source.length;
  gzip += compressed;
  console.log(`${file.padEnd(44)} ${String(source.length).padStart(7)} bytes  ${String(compressed).padStart(6)} gzip`);
}
console.log(`All JavaScript entries/chunks: ${raw} bytes; ${gzip} gzip (separate files).`);
console.log('The deferred entry initially loads only its scheduler. Bootstrap waits for load/delay/idle; game chunks wait for open/start. React is external.');

function graph(entry, includeDynamic) {
  const found = new Set();
  function visit(file) {
    if (found.has(file)) return;
    found.add(file);
    for (const imported of meta.outputs[file].imports) {
      if (!imported.external && (includeDynamic || imported.kind !== 'dynamic-import')) visit(imported.path);
    }
  }
  visit(entry);
  return found;
}
function total(files) {
  return [...files].reduce((sum, file) => ({ raw: sum.raw + sizes.get(file).raw, gzip: sum.gzip + sizes.get(file).gzip }), { raw: 0, gzip: 0 });
}
const bootstrap = graph('dist/index.js', false);
const complete = graph('dist/index.js', true);
const game = new Set([...complete].filter(file => !bootstrap.has(file)));
const scheduler = graph('dist/deferred.js', false);
const loaderEntry = Object.keys(meta.outputs).find(file => meta.outputs[file].entryPoint === 'src/swarm-loader.ts');
if (!loaderEntry) throw new Error('Missing deferred bootstrap entry');
const delayedBootstrap = new Set([...graph(loaderEntry, false)].filter(file => !scheduler.has(file)));
const deferredComplete = graph('dist/deferred.js', true);
const deferredGame = new Set([...deferredComplete].filter(file => !scheduler.has(file) && !delayedBootstrap.has(file)));
const reports = [
  ['Initial deferred scheduler', scheduler],
  ['Additional bootstrap after load/delay/idle', delayedBootstrap],
  ['Additional game on first open/start', deferredGame],
  ['Complete deferred path', deferredComplete],
  ['Immediate root bootstrap (alternative)', bootstrap],
  ['Immediate root plus game (alternative)', complete],
];
// Hard gzip ceilings per loading stage (bytes). 1.3.1 measured 1,400 / 4,071 / 30,304 / 35,775 /
// 4,342 / 34,646; the game on Fizlet (kernel, board-page and its grid: ~7.9 KB of it) measured
// 1,400 / 4,071 / 39,132 / 44,603 / 4,342 / 43,474 at the port.
const ceilings = {
  'Initial deferred scheduler': 1450,
  'Additional bootstrap after load/delay/idle': 4150,
  'Additional game on first open/start': 39700,
  'Complete deferred path': 45200,
  'Immediate root bootstrap (alternative)': 4420,
  'Immediate root plus game (alternative)': 44100,
};
for (const [label, files] of reports) {
  const bytes = total(files), cap = ceilings[label];
  const over = cap !== undefined && bytes.gzip > cap;
  console.log(`${label}: ${bytes.raw} bytes; ${bytes.gzip} gzip (separate files).${cap ? ` Ceiling ${cap}${over ? ': OVER' : ''}.` : ''}`);
  if (over) process.exitCode = 1;
}
