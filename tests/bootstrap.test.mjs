import test from 'node:test';
import assert from 'node:assert/strict';
import { installSwarm } from '../dist/index.js';

class Target {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event) { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event); }
  listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

function browser() {
  let time = 0, created = 0;
  class Element extends Target {
    constructor(tag) {
      super();
      this.tag = tag;
      this.attrs = new Map();
      this.children = [];
      this.hidden = false;
      this.isConnected = true;
      this.classList = { toggle() {} };
    }
    setAttribute(name, value) { this.attrs.set(name, value); }
    matches(selector) {
      return selector.split(',').some(item => item.startsWith('[')
        ? this.attrs.has(item.slice(1, -1))
        : item === this.tag);
    }
    closest(selector) { return this.matches(selector) ? this : null; }
    attachShadow() { this.shadowRoot = new Element('shadow'); return this.shadowRoot; }
    append(...children) { for (const child of children) this.appendChild(child); }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.isConnected = false; }
  }
  const win = new Target();
  win.performance = { now: () => time };
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('Dormant bootstrap accessed storage'); } });
  win.requestAnimationFrame = () => { throw new Error('Dormant bootstrap started animation'); };
  const doc = new Target();
  doc.defaultView = win;
  doc.hidden = false;
  doc.body = new Element('body');
  doc.createElement = tag => { created++; return new Element(tag); };
  const event = (key, target = doc.body, caps = false) => ({
    key,
    target,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    cancelable: true,
    composedPath: () => [target, doc, win],
    getModifierState: () => caps,
    preventDefault() { this.defaultPrevented = true; },
  });
  return { doc, win, Element, event, advance: ms => { time += ms; }, created: () => created };
}

test('installation stays dormant and destroy removes its bootstrap listeners', () => {
  const b = browser();
  const swarm = installSwarm({ document: b.doc });
  assert.equal(b.created(), 0);
  assert.equal(b.doc.body.children.length, 0);
  assert.equal(swarm.getSnapshot(), null);
  assert.equal(swarm.isUnlocked(), false);
  swarm.destroy();
  swarm.destroy();
  assert.equal(b.doc.listenerCount() + b.win.listenerCount(), 0);
  assert.equal(b.created(), 0);
});

test('the exact plain sequence unlocks only the lightweight floating button', () => {
  const b = browser();
  const swarm = installSwarm({ document: b.doc });
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'b', 'a', 'Enter']) {
    b.advance(100);
    b.doc.emit('keydown', b.event(key));
  }
  assert.equal(swarm.isUnlocked(), true);
  assert.equal(b.doc.body.children.length, 1);
  assert.equal(b.doc.body.children[0].attrs.has('data-swarm-launcher'), true);
  assert.equal(swarm.getSnapshot(), null);
  swarm.hide();
  assert.equal(b.doc.body.children[0].hidden, true);
  swarm.unlock();
  assert.equal(b.doc.body.children[0].hidden, false);
  swarm.destroy();
  assert.equal(b.doc.body.children.length, 0);
});

test('Caps Lock is inert and Escape fully hides and relocks the built bootstrap', () => {
  const b = browser();
  const swarm = installSwarm({ document: b.doc, triggerSelector: false });
  b.doc.emit('keydown', b.event('CapsLock'));
  assert.equal(swarm.isUnlocked(), false);
  assert.equal(b.created(), 0);
  swarm.unlock();
  const host = b.doc.body.children[0];
  assert.equal(host.hidden, false);
  b.doc.emit('keydown', b.event('CapsLock'));
  assert.equal(host.hidden, false);
  assert.equal(swarm.isUnlocked(), true);
  const escape = b.event('Escape');
  b.doc.emit('keydown', escape);
  assert.equal(escape.defaultPrevented, false);
  assert.equal(host.hidden, true);
  assert.equal(swarm.isUnlocked(), false);
  assert.equal(swarm.getSnapshot(), null);
  swarm.resume();
  assert.equal(host.hidden, true);
  assert.equal(swarm.isUnlocked(), false);
  swarm.destroy();
  assert.equal(b.doc.body.children.length, 0);
  assert.equal(b.doc.listenerCount() + b.win.listenerCount(), 0);
});
