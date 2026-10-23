import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomDefender } from '../src/dom-defender.js';
import { targetSignal, liquidFill, bubbleContrast } from '../src/target-health.js';
import { readTargetPalette } from '../src/target-palette.js';
import { fixture } from './helpers/engine-fixture.mjs';

test('health uses the requested states and slows its pulse as power drains', () => {
  assert.equal(targetSignal(100, '#123456').color, '#123456');
  assert.equal(targetSignal(60).color, '#cdde00');
  assert.equal(targetSignal(25).color, '#f4457a');
  assert.equal(targetSignal(-1).fill, 0);
  assert.equal(targetSignal(101).fill, 100);
  let previous = 0;
  for (let hp = 100; hp >= 0; hp--) {
    const period = targetSignal(hp).period;
    assert.ok(period > previous);
    previous = period;
  }
  assert.match(liquidFill(50, '#cdde00'), /50%,transparent 50%/);
  assert.notEqual(liquidFill(50, '#cdde00', 1, 0), liquidFill(50, '#cdde00', 1, .1));
});

test('real bites drain a liquid background without touching labels or native button state', () => {
  const p = fixture(createDomDefender, { noText: true, footer: true });
  p.lead.style.setProperty('color', '#234567', 'important');
  p.lead.style.setProperty('text-shadow', 'none');
  p.lead.style.setProperty('box-shadow', 'inset 0 0 0 1px red');
  p.lead.style.setProperty('transform', 'scale(.95)');
  p.lead.style.setProperty('background-image', 'linear-gradient(90deg,white,gray)');
  const original = p.lead.style.cssText;
  p.call('start');
  assert.ok(decodeURIComponent(p.lead.style.getPropertyValue('background-image')).includes('rgb(255, 255, 255)'));
  assert.match(p.lead.style.getPropertyValue('background-image'), /linear-gradient\(90deg,white,gray\)/);
  let sawRipple = false, sawMovement = false;
  const colors = new Set();
  for (let frame = 0; frame < 3600; frame++) {
    p.tick(1 / 60);
    const raw = p.lead.style.getPropertyValue('background-image');
    const image = raw.includes('data:image/svg+xml,') ? decodeURIComponent(raw.split('data:image/svg+xml,')[1].split('"')[0]) : raw;
    for (const color of ['rgb(255, 255, 255)', '#cdde00', '#f4457a']) if (image.includes(color)) colors.add(color);
    sawRipple ||= image.includes('<svg');
    sawMovement ||= Boolean(p.lead.style.getPropertyValue('translate'));
    assert.equal(p.lead.style.getPropertyValue('color'), '#234567');
    assert.equal(p.lead.style.getPropertyPriority('color'), 'important');
    assert.equal(p.lead.style.getPropertyValue('text-shadow'), 'none');
    assert.equal(p.lead.style.getPropertyValue('box-shadow'), 'inset 0 0 0 1px red');
    assert.equal(p.lead.style.getPropertyValue('transform'), 'scale(.95)');
    assert.equal(p.lead.hasAttribute('disabled'), false);
    assert.equal(p.lead.hasAttribute('aria-disabled'), false);
    if (p.lead.getAttribute('data-swarm-infected') === 'breached') break;
  }
  assert.ok(sawRipple && sawMovement);
  assert.deepEqual(colors, new Set(['rgb(255, 255, 255)', '#cdde00', '#f4457a']));
  assert.equal(p.lead.getAttribute('data-swarm-infected'), 'breached');
  assert.equal(p.lead.style.getPropertyValue('background-image'), 'linear-gradient(90deg,white,gray)');
  assert.equal(p.lead.style.getPropertyValue('rotate'), '-3deg');
  p.call('stop');
  assert.equal(p.lead.style.cssText, original);
  for (const name of ['color', 'text-shadow', 'box-shadow', 'transform', 'background-image']) p.lead.style.removeProperty(name);
  p.finish();
});

test('pause freezes liquid and beacon motion; stop and restart reset the page', () => {
  const p = fixture(createDomDefender, { noText: true });
  p.call('start');
  for (let i = 0; i < 900 && !p.events.some(e => e.type === 'damage'); i++) p.tick(1 / 60);
  assert.ok(p.events.some(e => e.type === 'damage'));
  p.tick(.1);
  p.call('pause');
  const styles = p.lead.style.cssText, rings = JSON.stringify(p.signals);
  p.tick(2);
  assert.equal(p.lead.style.cssText, styles);
  assert.equal(JSON.stringify(p.signals), rings);
  p.call('resume'); p.tick(.2);
  assert.notEqual(JSON.stringify(p.signals), rings);
  p.call('stop'); assert.equal(p.lead.hasAttribute('style'), false);
  p.call('start'); assert.ok(decodeURIComponent(p.lead.style.getPropertyValue('background-image')).includes('rgb(255, 255, 255)'));
  p.finish();
});

test('reduced motion keeps the health fill and a steady border without ripples or shaking', () => {
  const p = fixture(createDomDefender, { noText: true, reduced: true });
  p.call('start'); p.tick(12);
  assert.ok(p.events.some(e => e.type === 'damage'));
  assert.ok(!p.lead.style.getPropertyValue('background-image').includes('data:image'));
  assert.equal(p.lead.style.getPropertyValue('translate'), '');
  assert.equal(p.lead.style.getPropertyValue('rotate'), '');
  assert.ok(p.signals.length <= 1);
  p.finish();
});

test('host edits win during liquid painting, depletion and cleanup', () => {
  const p = fixture(createDomDefender, { noText: true, footer: true });
  p.call('start');
  p.lead.style.setProperty('background-image', 'none', 'important');
  p.lead.style.setProperty('rotate', '7deg', 'important');
  // Make the rotation a newer host edit after the game has acquired it.
  for (let i = 0; i < 900 && !p.events.some(e => e.type === 'damage'); i++) p.tick(1 / 60);
  p.tick(.1);
  p.lead.style.setProperty('rotate', '9deg', 'important');
  p.tick(30);
  assert.equal(p.lead.style.getPropertyValue('background-image'), 'none');
  assert.equal(p.lead.style.getPropertyPriority('background-image'), 'important');
  assert.equal(p.lead.style.getPropertyValue('rotate'), '9deg');
  p.call('stop');
  assert.equal(p.lead.style.getPropertyValue('background-image'), 'none');
  assert.equal(p.lead.style.getPropertyValue('rotate'), '9deg');
  p.lead.style.removeProperty('background-image'); p.lead.style.removeProperty('rotate');
  p.finish();
});

for (const dark of [false, true]) {
  for (const [index, color] of ['#ff6b6b', '#d984ff', '#8573ee'].entries()) {
    test(`${dark ? 'dark' : 'light'} score retains the killed tier ${index + 1} bug color across theme changes`, () => {
      const p = fixture(createDomDefender, { noText: true, noTargets: true, dark, feedback: true });
      p.call('start'); p.tick(.15);
      const bug = [...p.live.values()][0];
      Object.assign(bug, { color, tier: index + 1, hp: 1 });
      p.shoot(bug); p.tick(1 / 60);
      const score = () => p.feedback.find(f => f.kind === 'text' && f.text.startsWith('+'));
      assert.equal(score().color, color);
      assert.equal(score().alpha, 1);
      assert.ok(p.feedback.some(f => f.kind === 'outline' && f.color === '#101010'));
      assert.ok(p.feedback.some(f => f.kind === 'outline' && f.color === (dark ? '#101010' : '#ffffff')));
      p.dark.matches = !dark; p.tick(.55);
      assert.equal(score().color, color);
      assert.equal(score().alpha, 1);
      p.tick(.3); assert.ok(score().alpha > 0 && score().alpha < 1);
      p.tick(.3); assert.equal(score(), undefined);
      p.finish();
    });
  }
}

test('button bites release solid bubbles in the feeding bug color', () => {
  const p = fixture(createDomDefender, { noText: true, feedback: true });
  p.call('start');
  for (let i = 0; i < 900 && !p.events.some(e => e.type === 'damage'); i++) p.tick(1 / 60);
  assert.equal(p.feedback.some(f => f.kind === 'text' && /^[01]$/.test(f.text)), false);
  assert.equal(p.feedback.some(f => f.kind === 'outline'), false);
  const bug = [...p.live.values()].find(b => b.siphonUntil > p.engine.getSnapshot().elapsed);
  assert.ok(bug);
  assert.ok(p.feedback.some(f => f.kind === 'bubble' && f.color === bug.color && f.alpha > .8));
  assert.ok(p.arcs.some(([, , radius]) => radius >= 2.4 && radius <= 6));
  p.finish();
});

test('a biting bug briefly latches to its target before crawling again', () => {
  const p = fixture(createDomDefender, { noText: true });
  p.call('start');
  for (let i = 0; i < 900 && !p.events.some(e => e.type === 'damage'); i++) p.tick(1 / 60);
  const bug = [...p.live.values()].find(b => b.siphonUntil > p.engine.getSnapshot().elapsed);
  assert.ok(bug);
  const position = [bug.x, bug.y];
  p.tick(.06);
  assert.deepEqual([bug.x, bug.y], position, 'The bug pauses in contact during its bite');
  p.tick(.3);
  assert.notDeepEqual([bug.x, bug.y], position, 'The same bug continues crawling after feeding');
  p.finish();
});

test('hover keeps power and pulse phase while bubbles accelerate without a phase reset', () => {
  const p = fixture(createDomDefender, { noText: true, footer: true });
  let hovered = false, focused = false;
  p.lead.matches = selector => selector === ':hover' ? hovered : hovered || focused;
  const computed = p.win.getComputedStyle;
  p.win.getComputedStyle = el => {
    const style = computed(el);
    return { getPropertyValue: name => name === 'background-image' && !el.style.getPropertyValue(name)
      ? (hovered || focused ? 'linear-gradient(red,blue)' : 'none') : style.getPropertyValue(name) };
  };
  p.call('start');
  for (let i = 0; i < 900 && !p.events.some(e => e.type === 'damage'); i++) p.tick(1 / 60);
  p.tick(.05);
  assert.ok(p.lead.style.getPropertyValue('translate'));
  p.call('pause');
  const health = p.engine.getSnapshot().targets[0].health;
  const rings = structuredClone(p.signals);
  hovered = true;
  p.fire('pointerover', { target: p.lead });
  assert.equal(p.engine.getSnapshot().targets[0].health, health);
  assert.ok(!p.lead.style.getPropertyValue('background-image').includes('linear-gradient(red,blue)'));
  assert.ok(!decodeURIComponent(p.lead.style.getPropertyValue('background-image')).includes('opacity="0.86"'));
  assert.equal(p.lead.style.getPropertyValue('background-color'), 'rgb(255, 255, 255)');
  assert.equal(p.lead.style.getPropertyPriority('background-image'), 'important');
  assert.ok(p.lead.style.getPropertyValue('translate'));
  assert.ok(p.lead.style.getPropertyValue('rotate'));
  assert.deepEqual(p.signals.map(r => r.rect), rings.map(r => r.rect), 'Interaction must not restart the pulse');
  assert.equal(p.signals[0].alpha, rings[0].alpha);
  focused = true; p.fire('focusin', { target: p.lead });
  hovered = false; p.fire('pointerout', { target: p.lead, relatedTarget: p.doc.body });
  assert.ok(!p.lead.style.getPropertyValue('background-image').includes('linear-gradient(red,blue)'));
  p.call('resume'); p.tick(.3);
  assert.equal(p.lead.getAttribute('data-swarm-hover-locked'), 'active');
  focused = false; p.fire('focusout', { target: p.lead, relatedTarget: p.doc.body });
  assert.ok(!p.lead.style.getPropertyValue('background-image').includes('linear-gradient(red,blue)'));
  p.finish();
});

test('hovering a depleted target temporarily releases tilt without restoring health', () => {
  const p = fixture(createDomDefender, { noText: true, footer: true });
  let hovered = false;
  p.lead.matches = () => hovered;
  p.call('start');
  for (let i = 0; i < 3600 && p.lead.getAttribute('data-swarm-infected') !== 'breached'; i++) p.tick(1 / 60);
  assert.equal(p.lead.style.getPropertyValue('rotate'), '-3deg');
  hovered = true; p.fire('pointerover', { target: p.lead });
  assert.equal(p.lead.style.getPropertyValue('rotate'), '');
  assert.equal(p.lead.style.getPropertyValue('background-image'), '');
  assert.equal(p.engine.getSnapshot().targets[0].health, 0);
  hovered = false; p.fire('pointerout', { target: p.lead, relatedTarget: p.doc.body });
  assert.equal(p.lead.style.getPropertyValue('rotate'), '-3deg');
  p.finish();
});


test('palette fallback and explicit hover token preserve host styles and attributes', () => {
  const p = fixture(createDomDefender, { noText: true });
  p.lead.style.setProperty('background-color', '#ffffff');
  p.lead.style.setProperty('transition', 'background .2s', 'important');
  p.lead.setAttribute('data-swarm-color-probe', 'host');
  p.doc.styleSheets = [{ get cssRules() { throw new Error('SecurityError'); } }];
  const original = p.lead.style.cssText;
  assert.deepEqual(readTargetPalette(p.lead, p.doc), { base: '#ffffff', power: '#ffffff' });
  assert.equal(p.lead.style.cssText, original);
  p.lead.style.setProperty('--swarm-power-color', 'rgb(255, 0, 0)');
  assert.equal(readTargetPalette(p.lead, p.doc).power, 'rgb(255, 0, 0)', 'Opaque red must not be mistaken for transparent');
  assert.equal(p.lead.getAttribute('data-swarm-color-probe'), 'host');
  assert.equal(p.lead.style.getPropertyPriority('transition'), 'important');
  for (const name of ['background-color', 'transition', '--swarm-power-color']) p.lead.style.removeProperty(name);
  p.lead.removeAttribute('data-swarm-color-probe');
  p.call('start');
  p.finish();
});

test('interior bubbles stay behind labels and background work is capped at 12Hz', () => {
  const p = fixture(createDomDefender, { noText: true, footer: true });
  p.call('start');
  let previous = p.lead.style.getPropertyValue('background-image'), writes = 0;
  for (let i = 0; i < 60; i++) {
    p.tick(1 / 60);
    const current = p.lead.style.getPropertyValue('background-image');
    if (current !== previous) writes++;
    previous = current;
  }
  const svg = decodeURIComponent(previous);
  assert.equal((svg.match(/<ellipse /g) || []).length, 6);
  assert.ok(svg.includes('clip-path="url(#l)"'));
  assert.ok(writes > 0 && writes <= 12);
  p.call('pause'); p.tick(1);
  assert.equal(p.lead.style.getPropertyValue('background-image'), previous);
  p.finish();
});


test('interior bubbles use an opposite surface tone and a broad size range', () => {
  assert.equal(bubbleContrast('#fefefe'), '#101010');
  assert.equal(bubbleContrast('rgb(20, 25, 30)'), '#ffffff');
  assert.equal(bubbleContrast('oklch(0.25 0.02 220)'), '#ffffff');
  assert.equal(bubbleContrast('oklch(95% 0.02 220)'), '#101010');
  assert.equal(bubbleContrast('color(display-p3 0.1 0.1 0.1)'), '#ffffff');
  const svg = decodeURIComponent(liquidFill(100, '#06c4ff', 0, 0, .5, 1, {time: 1, width: 100, height: 40, color: '#101010'}));
  const sizes = [...svg.matchAll(/rx="([^"]+)"/g)].map(m => +m[1]);
  assert.equal(new Set(sizes).size, 6);
  assert.ok(Math.max(...sizes) / Math.min(...sizes) > 4);
});

test('hover boils faster at the same bounded paint cadence and restores the guard on stop', () => {
  function sample(hovered) {
    const p = fixture(createDomDefender, { noText: true, footer: true });
    p.lead.matches = () => hovered;
    p.call('start');
    let previous = p.lead.style.getPropertyValue('background-image'), writes = 0;
    for (let i = 0; i < 30; i++) {
      p.tick(1 / 60);
      const current = p.lead.style.getPropertyValue('background-image');
      if (current !== previous) writes++;
      previous = current;
    }
    const y = +decodeURIComponent(previous).match(/cy="([^"]+)"/)[1];
    assert.ok(writes > 0 && writes <= 6);
    p.call('stop');
    assert.equal(p.lead.hasAttribute('data-swarm-hover-locked'), false);
    p.finish();
    return 100 - y;
  }
  assert.ok(sample(true) > sample(false) * 2, 'Hover increases travel, not paint frequency');
});
