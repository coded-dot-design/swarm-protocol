import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomDefender } from '../src/dom-defender.js';
import { fixture } from './helpers/engine-fixture.mjs';
// The controller around the engine: host callbacks that stop the round or throw inside a frame,
// and a paused round redrawn after the page scrolled.

test('a host callback may stop or destroy the round from inside a frame', () => {
  for (const how of ['stop', 'destroy']) {
    let controller, done = false;
    const p = fixture(o => (controller = createDomDefender({ ...o, onEvent: e => { o.onEvent(e); if (e.type === 'bite' && !done) { done = true; controller[how](); } } })));
    p.call('start');
    p.tick(6);
    assert.ok(done, 'a bite reached the callback');
    assert.equal(p.engine.getSnapshot().status, 'idle');
    assert.deepEqual(p.nodes.map(n => n.nodeValue), p.originalsText, 'and the page came back');
    p.finish();
  }
});

test('a host callback that throws is reported and the round goes on', () => {
  const errors = [], log = console.error;
  console.error = e => errors.push(e);
  try {
    const p = fixture(o => createDomDefender({ ...o, onEvent: e => { o.onEvent(e); if (e.type === 'bite') throw new Error('host bug'); } }));
    p.call('start');
    p.tick(6);
    assert.ok(errors.some(e => e?.message === 'host bug'));
    assert.ok(p.events.filter(e => e.type === 'bite').length > 1, 'bites go on after the throw');
    assert.equal(p.engine.getSnapshot().status, 'running');
    p.finish();
  } finally { console.error = log; }
});

test('a paused round redrawn after a scroll shows bugs where they are in the page', () => {
  const p = fixture(createDomDefender, { noText: true });
  p.call('start'); p.tick(.5);
  p.call('pause');
  const [id, bug] = [...p.draws.entries()].find(([, b]) => !b.attached), y = bug.y;
  p.win.scrollTo({ top: 300 });
  p.fire('pointerover', { target: p.lead, relatedTarget: null });
  assert.ok(Math.abs(p.draws.get(id).y - (y - 300)) < .01, 'free bugs keep their place in the page');
  p.finish();
});
