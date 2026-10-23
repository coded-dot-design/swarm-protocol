import test from 'node:test';
import assert from 'node:assert/strict';
import { guardTargetHover } from '../src/target-hover.js';

test('hover guard scopes selector lists, nested groups and pseudo-elements, then restores exactly', () => {
  const child = { selectorText: '& > button::before' };
  const rules = [{ selectorText: '.button:hover, .button:focus-visible' },
    { selectorText: '.group:hover', cssRules: [child] }, { selectorText: '.unrelated' }];
  const originals = [...rules, child].map(r => r.selectorText);
  const restore = guardTargetHover({ styleSheets: [{ cssRules: rules }] });
  assert.match(rules[0].selectorText, /:not\(:where\(/);
  assert.ok(rules[0].selectorText.endsWith(',.button:focus-visible'));
  assert.match(child.selectorText, /\)\)::before$/);
  assert.equal(rules[2].selectorText, '.unrelated');
  restore();
  assert.deepEqual([...rules, child].map(r => r.selectorText), originals);
});

test('hover guard tolerates unreadable sheets and preserves a newer host CSSOM edit', () => {
  const rule = { selectorText: 'button:hover' }, sheet = { cssRules: [rule] };
  const restore = guardTargetHover({ styleSheets: [{ get cssRules() { throw Error('SecurityError'); } }, sheet], adoptedStyleSheets: [sheet] });
  rule.selectorText = '.host-new-rule:hover';
  restore();
  assert.equal(rule.selectorText, '.host-new-rule:hover');
});

test('negative hover selectors retain the default appearance inside powered buttons', () => {
  const rule = { selectorText: 'button:not(:hover)' };
  const restore = guardTargetHover({ styleSheets: [{ cssRules: [rule] }] });
  assert.ok(rule.selectorText.startsWith('button:not(:hover:not(:where('));
  assert.equal((rule.selectorText.match(/:where\(/g) || []).length, 1);
  restore();
  assert.equal(rule.selectorText, 'button:not(:hover)');
});
