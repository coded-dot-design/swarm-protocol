import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomDefender } from '../src/dom-defender.js';
import { fixture } from './helpers/engine-fixture.mjs';

test('48-bug feeding stays within layout, selection, and animation-loop budgets',()=>{
  const p=fixture(createDomDefender,{noTargets:true,seed:0xabc012});
  p.call('start');p.tick(43);
  assert.equal(p.engine.getSnapshot().alive,48);
  assert.ok(p.events.some(e=>e.type==='bite'&&e.lettersEaten>12),'Grown hunters also exercise contact feeding');
  const {metrics}=p.finish();
  assert.equal(metrics.maxRaf,1);
  assert.equal(metrics.rangeCreated,1,'Reuse a Range through the round');
  assert.ok(metrics.maxRangePerFrame<=36);
  // Generous ceilings catch accidental per-candidate ancestry/distance scans.
  assert.ok(metrics.closest<200000,`${metrics.closest} ancestry checks`);
  assert.ok(metrics.hypot<150000,`${metrics.hypot} distance calls`);
});
