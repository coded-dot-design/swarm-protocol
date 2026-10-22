import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

// Exercise the adapter's asynchronous boundary without a browser or a second
// React runtime. The scheduler and loader have their own lifecycle suites.
const source = await readFile(new URL('../integration/SwarmGame.tsx', import.meta.url), 'utf8');
assert.ok(source.includes("from '../src/swarm-deferred.js'"));
const { code } = await transform(source, {
  loader: 'tsx', format: 'cjs', jsx: 'automatic', target: 'es2020',
});

function harness(props = {}) {
  const listeners = new Map();
  const doc = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, event) { for (const listener of [...(listeners.get(type) ?? [])]) listener(event); },
    count(type) { return listeners.get(type)?.size ?? 0; },
  };
  const host = { ownerDocument: doc, isConnected: true };
  const effects = [], cleanup = [], loggedErrors = [];
  const calls = { schedule: 0, install: 0, open: 0, start: 0, minimize: 0, unlock: 0, destroy: 0, exit: 0 };
  let scheduling;
  let resolveImport, rejectImport;
  const loading = new Promise((resolve, reject) => { resolveImport = resolve; rejectImport = reject; });
  const hooks = {
    forwardRef: fn => fn,
    useRef: initial => ({ current: initial }),
    useCallback: fn => fn,
    useEffect: fn => { effects.push(fn); },
    useImperativeHandle: (ref, create) => { ref.current = create(); },
  };
  const jsx = (tag, attrs) => {
    if (attrs.ref) attrs.ref.current = host;
    return { tag, attrs };
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    console: { error: (...arguments_) => loggedErrors.push(arguments_) },
    require: id => {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return { jsx };
      if (id === '../src/swarm-deferred.js') return {
        installSwarmDeferred(options, settings) {
          calls.schedule++;
          scheduling = settings;
          let disposed = false, instance = null;
          return {
            ready: loading.then(({ installSwarm }) => {
              if (disposed) return null;
              instance = installSwarm(options);
              return instance;
            }),
            destroy() {
              if (disposed) return;
              disposed = true;
              instance?.destroy();
            },
          };
        },
      };
      throw new Error(`Unexpected import ${id}`);
    },
  });
  const ref = { current: null };
  module.exports.SwarmGame(props, ref);
  for (const effect of effects) {
    const dispose = effect();
    if (typeof dispose === 'function') cleanup.push(dispose);
  }
  const installSwarm = options => {
    calls.install++;
    assert.equal(options.host, host);
    const escape = event => { if (event.key === 'Escape') calls.exit++; };
    doc.addEventListener('keydown', escape);
    return {
      unlock() { calls.unlock++; },
      async open() { calls.open++; },
      async start() { calls.start++; },
      minimize() { calls.minimize++; },
      pause() {}, resume() {}, stop() {}, hide() {},
      destroy() { calls.destroy++; doc.removeEventListener('keydown', escape); },
      getSnapshot: () => null,
      isUnlocked: () => false,
    };
  };
  return {
    ref, doc, calls, scheduling, loggedErrors,
    resolveImport: () => resolveImport({ installSwarm }),
    rejectImport,
    unmount() { for (const dispose of cleanup.splice(0)) dispose(); host.isConnected = false; },
    escape: () => doc.emit('keydown', { key: 'Escape', repeat: false, isComposing: false }),
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('React Escape cancels queued open, start, and unlock before the bootstrap resolves', async () => {
  const h = harness();
  const open = h.ref.current.open();
  const start = h.ref.current.start();
  h.ref.current.unlock();
  h.escape();
  await Promise.all([open, start]);
  h.resolveImport();
  await flush();
  assert.equal(h.calls.install, 1);
  assert.equal(h.calls.open + h.calls.start + h.calls.unlock, 0);
  assert.equal(h.doc.count('keydown'), 1, 'the installer replaces the temporary Escape listener');
  h.escape();
  assert.equal(h.calls.exit, 1);
  h.unmount();
  assert.equal(h.calls.destroy, 1);
  assert.equal(h.doc.count('keydown') + h.doc.count('astro:before-swap'), 0);
});

test('React passes normal queued intent to one installation and removes listeners on unmount', async () => {
  const h = harness();
  assert.equal(h.calls.schedule, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.scheduling)), { delayMs: 1000, idleTimeoutMs: 2000 });
  const start = h.ref.current.start();
  h.ref.current.unlock();
  h.resolveImport();
  await start;
  assert.equal(h.calls.install, 1);
  assert.equal(h.calls.start, 1);
  assert.equal(h.calls.unlock, 1);
  await h.ref.current.open();
  assert.equal(h.calls.open, 1);
  h.unmount();
  assert.equal(h.calls.destroy, 1);
  assert.equal(h.doc.count('keydown') + h.doc.count('astro:before-swap'), 0);
});

test('React Astro navigation cancels deferred setup before the island unmounts', async () => {
  const h = harness({ delayMs: 1500, idleTimeoutMs: 3000 });
  assert.deepEqual(JSON.parse(JSON.stringify(h.scheduling)), { delayMs: 1500, idleTimeoutMs: 3000 });
  const pending = h.ref.current.start();
  h.doc.emit('astro:before-swap', {});
  await pending;
  h.resolveImport();
  await flush();
  assert.equal(h.calls.install, 0);
  assert.equal(h.doc.count('keydown'), 0);
  h.unmount();
  assert.equal(h.doc.count('astro:before-swap'), 0);
});

test('React unmount before bootstrap resolution cancels pending work and prevents a late mount', async () => {
  const h = harness();
  const pending = h.ref.current.start();
  h.unmount();
  await pending;
  h.resolveImport();
  await flush();
  assert.equal(h.calls.install, 0);
  assert.equal(h.doc.count('keydown') + h.doc.count('astro:before-swap'), 0);
});

test('React bootstrap failure rejects pending work and removes its temporary Escape listener', async () => {
  const errors = [];
  const h = harness({ onError: error => errors.push(error) });
  const error = new Error('bootstrap download failed');
  const failed = assert.rejects(h.ref.current.open(), error);
  h.rejectImport(error);
  await failed;
  assert.deepEqual(errors, [error]);
  assert.equal(h.doc.count('keydown'), 0);
  await assert.rejects(h.ref.current.start(), error);
  h.unmount();
  assert.equal(h.doc.count('astro:before-swap'), 0);
});


test('a throwing React error callback preserves the original rejection and logs once without an unhandled promise', async () => {
  const originalError = new Error('Bootstrap download failed.');
  const callbackError = new Error('Consumer error reporter failed.');
  const reported = [], unhandled = [];
  const h = harness({ onError(error) { reported.push(error); throw callbackError; } });
  const onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    const failure = assert.rejects(h.ref.current.open(), error => error === originalError);
    h.rejectImport(originalError);
    await failure;
    await flush();
    assert.deepEqual(reported, [originalError]);
    assert.deepEqual(h.loggedErrors, [['Swarm Protocol error handler failed.', callbackError]]);
    assert.deepEqual(unhandled, []);
    assert.equal(h.doc.count('keydown'), 0);
    await assert.rejects(h.ref.current.start(), error => error === originalError);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
    h.unmount();
  }
  assert.equal(h.doc.count('keydown') + h.doc.count('astro:before-swap'), 0);
});

test('React minimize cancels queued open/start intent and delegates only after installation', async () => {
  const h = harness();
  const open = h.ref.current.open();
  const start = h.ref.current.start();
  assert.equal(h.ref.current.minimize(), undefined);
  await Promise.all([open, start]);
  assert.equal(h.calls.install, 0);
  assert.equal(h.calls.minimize, 0);
  h.resolveImport();
  await flush();
  assert.equal(h.calls.install, 1);
  assert.equal(h.calls.open + h.calls.start, 0);
  assert.equal(h.ref.current.minimize(), undefined);
  assert.equal(h.calls.minimize, 1);
  h.unmount();
  assert.equal(h.calls.destroy, 1);
});
