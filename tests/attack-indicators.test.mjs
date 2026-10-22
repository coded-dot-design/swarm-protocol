import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackIndicators, getAttackEdges } from '../src/attack-indicators.js';

const rect = (left, top, width = 120, height = 44) => ({ left, top, width, height, right: left + width, bottom: top + height });
const attacker = (bounds, options = {}) => ({ attached: true, target: { rect: bounds, rendered: true, health: 80, element: { isConnected: true }, ...options } });

test('attached attackers point to the actual offscreen edge, including corners and simultaneous threats', () => {
  for (const [bounds, expected] of [[rect(100,-44),1],[rect(100,600),2],[rect(-120,100),4],[rect(800,100),8],[rect(800,-44),9]]) {
    assert.equal(getAttackEdges([attacker(bounds)], 800, 600), expected);
  }
  assert.equal(getAttackEdges([attacker(rect(100,-60)),attacker(rect(100,700)),attacker(rect(-200,100)),attacker(rect(900,100))],800,600),15);
});

test('visible and partially visible buttons, travelling bugs, dead and removed targets never warn', () => {
  const below = rect(100,700);
  const inactive = [
    attacker(rect(100,100)), attacker(rect(100,599)), attacker(rect(100,-43)),
    attacker(rect(-119,100)), attacker(rect(799,100)),
    { ...attacker(below), attached: false }, { attached: true, target: null },
    attacker(below,{health:0}), attacker(below,{rendered:false}),
    attacker(below,{element:{isConnected:false}}), attacker(rect(100,700,0,44)),
  ];
  assert.equal(getAttackEdges(inactive,800,600),0);
});

test('scroll and resize use current cached geometry without querying the DOM', () => {
  const bug=attacker(rect(100,650));
  bug.target.element.getBoundingClientRect=()=>{throw new Error('Unexpected layout read');};
  assert.equal(getAttackEdges([bug],800,600),2);
  assert.equal(getAttackEdges([bug],800,700),0);
  bug.target.rect=rect(100,-100);
  assert.equal(getAttackEdges([bug],800,700),1);
  bug.target.rect=rect(100,100);
  assert.equal(getAttackEdges([bug],800,700),0);
});

function documentFixture() {
  let writes=0;
  function element(tag) {
    const attributes=new Map();
    return {tag, children:[], hidden:false,
      setAttribute(name,value){writes++;attributes.set(name,value);},
      getAttribute:name=>attributes.get(name),
      append(...children){this.children.push(...children);for(const child of children)child.parent=this;},
      appendChild(child){this.append(child);},
      attachShadow(){this.shadowRoot=element('shadow');return this.shadowRoot;},
      remove(){this.parent.children=this.parent.children.filter(child=>child!==this);},
    };
  }
  return {body:element('body'),createElement:element,get writes(){return writes;}};
}

test('cues mount only for a threat, retain stable DOM, clear directions, and clean up permanently', () => {
  const doc=documentFixture(), cues=createAttackIndicators(doc);
  cues.update(0); assert.equal(doc.body.children.length,0);
  cues.update(2);
  assert.equal(doc.body.children.length,1);
  const host=doc.body.children[0], root=host.shadowRoot, edgeNodes=root.children.slice(1,5), live=root.children.at(-1);
  assert.equal(host.getAttribute('data-swarm-ui'),undefined,'Full-screen cues must not block the game hit area');
  assert.equal(host.getAttribute('data-swarm-directions'),'bottom');
  assert.deepEqual(edgeNodes.map(node=>node.hidden),[true,false,true,true]);
  assert.match(live.textContent,/below.*Scroll to squash/);
  const writes=doc.writes;
  for(let frame=0;frame<120;frame++)cues.update(2);
  assert.equal(doc.writes,writes,'Unchanged frames must not rewrite cue attributes');
  cues.update(9);
  assert.deepEqual(edgeNodes.map(node=>node.hidden),[false,true,true,false]);
  assert.match(live.textContent,/above and to the right/);
  cues.update(0);
  assert.equal(host.hidden,true); assert.equal(live.textContent,'');
  cues.update(1);assert.equal(host.hidden,false);assert.equal(doc.body.children[0],host);
  cues.destroy();cues.destroy();cues.update(2);
  assert.equal(doc.body.children.length,0);
});

test('cues honor reduced motion and keep all visual layers pointer-transparent', () => {
  const doc=documentFixture(), cues=createAttackIndicators(doc,true);
  cues.update(2);
  const host=doc.body.children[0], css=host.shadowRoot.children[0].textContent;
  assert.equal(host.getAttribute('data-reduced-motion'),'');
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/:host\(\[data-reduced-motion\]\) .edge::before\{animation:none/);
  assert.match(css,/\*\{box-sizing:border-box;pointer-events:none!important\}/);
  assert.equal(host.shadowRoot.children.at(-1).getAttribute('aria-live'),'polite');
  cues.destroy();
});
