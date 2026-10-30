import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { announcer } from '../src/announce.ts';

/** Just enough document for the announcer: one body, attribute lookups, append and remove. */
function documentFixture() {
  const body = { children: [], append(node) { node.parent = this; this.children.push(node); } };
  const doc = {
    body,
    writes: 0,
    createElement(tag) {
      const attributes = new Map();
      let text = '';
      return {
        tag, parent: null,
        get isConnected() { return this.parent === body; },
        get textContent() { return text; },
        set textContent(value) { doc.writes++; text = value; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
        hasAttribute(name) { return attributes.has(name); },
        remove() { if (this.parent) { body.children.splice(body.children.indexOf(this), 1); this.parent = null; } },
      };
    },
    querySelector(selector) {
      assert.equal(selector, '[data-fz-announce]');
      return body.children.find(node => node.hasAttribute('data-fz-announce')) ?? null;
    },
  };
  return doc;
}

test('one lazy, visually hidden polite region per document, removed only by its creator', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  try {
    const doc = documentFixture(), a = announcer({ doc }), b = announcer({ doc });
    assert.equal(doc.body.children.length, 0, 'nothing is created before the first write');
    a.say('score', 'Score 10');
    mock.timers.tick(0);
    assert.equal(doc.body.children.length, 1);
    const region = doc.body.children[0];
    assert.equal(region.getAttribute('data-fz-announce'), '');
    assert.equal(region.getAttribute('role'), 'status');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.equal(region.getAttribute('aria-atomic'), 'true');
    assert.match(region.getAttribute('style'), /clip-path:inset\(50%\)/);
    assert.doesNotMatch(region.getAttribute('style'), /display:\s*none|visibility:\s*hidden/);
    b.say('status', 'Game paused');
    mock.timers.tick(1000);
    assert.equal(doc.body.children.length, 1, 'a second announcer shares the region');
    assert.equal(region.textContent, 'Game paused');
    b.destroy();
    assert.equal(doc.body.children.length, 1, 'only the creator removes the region');
    a.destroy();
    assert.equal(doc.body.children.length, 0);
  } finally { mock.timers.reset(); }
});

test('coalesces per key, keeps first-queued order and writes at most once per gap', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  try {
    const doc = documentFixture(), a = announcer({ doc, gap: 1 });
    a.say('score', 'Score 10');
    a.say('lives', 'Buttons at 90% integrity');
    a.say('score', 'Score 20');
    a.say('score', 'Score 30');
    mock.timers.tick(0);
    const region = doc.body.children[0];
    assert.equal(region.textContent, 'Score 30. Buttons at 90% integrity', 'latest text per key, first-queued order');
    assert.equal(doc.writes, 1);
    for (let k = 4; k <= 9; k++) { a.say('score', `Score ${k}0`); mock.timers.tick(100); }
    assert.equal(doc.writes, 1, 'nothing within the gap');
    mock.timers.tick(400);
    assert.equal(doc.writes, 2);
    assert.equal(region.textContent, 'Score 90', 'rapid changes coalesce to the latest');
    // The same words again are still announced (a trailing space toggles).
    mock.timers.tick(1000);
    a.say('score', 'Score 90');
    mock.timers.tick(0);
    assert.equal(doc.writes, 3);
    assert.equal(region.textContent, 'Score 90 ');
    mock.timers.tick(1000);
    a.say('score', 'Score 90');
    mock.timers.tick(0);
    assert.equal(region.textContent, 'Score 90');
    // flush() writes at once (game over); destroy() clears a pending timer.
    a.say('status', 'Game over. Final score 90');
    a.flush();
    assert.equal(region.textContent, 'Game over. Final score 90');
    a.say('score', 'Score 100');
    a.destroy();
    mock.timers.tick(5000);
    assert.equal(doc.body.children.length, 0);
    assert.equal(doc.writes, 5, 'no write after destroy');
  } finally { mock.timers.reset(); }
});
