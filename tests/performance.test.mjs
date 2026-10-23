import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('archived v1.0.9 optimization preserves its historical gameplay/DOM traces', () => {
  // The harness instruments built-ins, so run it in its own Node process.
  const result = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(new URL('./engine-performance.mjs', import.meta.url)),
    '--engine', fileURLToPath(new URL('./fixtures/dom-defender-1.0.9.js', import.meta.url)),
  ], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 }));
  assert.equal(result.exactTraceMatch, true);
  assert.equal(result.attackCues, true);
  assert.equal(result.feedback, true);
  assert.equal(result.scenarios.length, 5);
  assert.equal(result.after.frames, 8827);
  assert.equal(result.after.maxRaf, 1);
  assert.ok(result.after.rangeCreated < result.before.rangeCreated);
  assert.ok(result.after.sortComparisons < result.before.sortComparisons);
});

test('cached HUD updates preserve public state and rendered UI', () => {
  const output = execFileSync(process.execPath, [
    fileURLToPath(new URL('./widget-hud-performance.mjs', import.meta.url)),
  ], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  assert.ok(output.length > 0);
  // The portable harness asserts exact checkpoints, callback counts, and cleanup.
});

// Current gameplay intentionally changes spawn and pursuit traces. Historical
// traces remain exact above; the current suite verifies behavior and work bounds.
test('current liquid targets preserve feeding, waves, offscreen pursuit, input and bounded work', () => {
  const result = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(new URL('./engine-performance.mjs', import.meta.url)), '--refined',
  ], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 }));
  assert.equal(result.currentRefinement, true);
  assert.equal(result.attackCues, true);
  assert.equal(result.scenarios.length, 5);
  assert.deepEqual(result.exactScenarios, [], 'Spawning and navigation intentionally change gameplay traces');
  assert.equal(result.after.maxRaf, 1);
  assert.ok(result.after.maxRangePerFrame <= 36);
  assert.ok(result.after.rangeCreated < result.before.rangeCreated);
});
