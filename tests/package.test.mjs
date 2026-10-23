import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('public entries import without a browser and the React entry renders only its empty host', async () => {
  const main = await import('../dist/index.js');
  const deferred = await import('../dist/deferred.js');
  const core = await import('../dist/core.js');
  const widget = await import('../dist/widget.js');
  const react = await import('../dist/react.js');
  assert.equal(typeof main.installSwarm, 'function');
  assert.equal(typeof deferred.installSwarmDeferred, 'function');
  assert.equal(typeof core.createDomDefender, 'function');
  assert.equal(typeof widget.mountSwarmGame, 'function');
  assert.equal(renderToString(createElement(react.SwarmGame)), '<div data-swarm-ui=""></div>');
});

test('deferred and React entries keep the bootstrap behind a dynamic import', async () => {
  const meta = JSON.parse(await readFile(resolve(root, 'artifacts/build-meta.json'), 'utf8'));
  for (const entry of ['dist/deferred.js', 'dist/react.js']) {
    const seen = new Set();
    let dynamicImports = 0;
    function inspect(output) {
      if (seen.has(output)) return;
      seen.add(output);
      const record = meta.outputs[output];
      assert.ok(record, `Missing output ${output}`);
      for (const input of Object.keys(record.inputs)) {
        assert.ok(!/swarm-loader|dom-defender|swarm-widget/.test(input), `${entry}: ${input}`);
      }
      for (const imported of record.imports) {
        if (imported.kind === 'dynamic-import') { dynamicImports++; continue; }
        if (imported.external) {
          assert.ok(entry === 'dist/react.js' && /^react(?:\/|$)/.test(imported.path));
        } else inspect(imported.path);
      }
    }
    inspect(entry);
    assert.equal(dynamicImports, 1, `${entry} must dynamically load the bootstrap once`);
  }
});

test('default entry has no static engine, widget, or React dependency', async () => {
  const meta = JSON.parse(await readFile(resolve(root, 'artifacts/build-meta.json'), 'utf8'));
  const seen = new Set();
  function inspect(output) {
    if (seen.has(output)) return;
    seen.add(output);
    const record = meta.outputs[output];
    assert.ok(record, `Missing output ${output}`);
    for (const input of Object.keys(record.inputs)) {
      assert.ok(!/dom-defender|swarm-widget|SwarmGame|node_modules\/react/.test(input), input);
    }
    for (const imported of record.imports) {
      if (imported.kind === 'dynamic-import') continue;
      assert.ok(!imported.external, `Unexpected external dependency: ${imported.path}`);
      inspect(imported.path);
    }
  }
  inspect('dist/index.js');
  assert.ok(seen.size > 0);
  assert.ok(Object.values(meta.outputs).some(record => record.imports.some(item => item.kind === 'dynamic-import')));
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.equal(pkg.peerDependenciesMeta.react.optional, true);
});

test('all exported declarations resolve with strict NodeNext consumers', () => {
  execFileSync(process.execPath, [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'tests/tsconfig.json'),
  ], { cwd: root, stdio: 'pipe' });
});


test('package runtime contains exactly the current build outputs without stale hashed chunks', async () => {
  const meta = JSON.parse(await readFile(resolve(root, 'artifacts/build-meta.json'), 'utf8'));
  const actual = (await readdir(resolve(root, 'dist'), { recursive: true }))
    .filter(name => name.endsWith('.js')).map(name => 'dist/' + name.replaceAll('\\', '/')).sort();
  assert.deepEqual(actual, Object.keys(meta.outputs).filter(name => name.endsWith('.js')).sort());
});
