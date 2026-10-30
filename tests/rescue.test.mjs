import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomDefender } from '../src/dom-defender.js';
import { fixture } from './helpers/engine-fixture.mjs';
// The shell around the rules: rescue cues, Jump and Zap, scrolling and the pointer, driven by real
// play (bugs reach the off-screen footer on their own; score comes from shooting them where they
// are). The rules' own numbers are in world.test.mjs.
const cue=p=>p.doc.body.children.find(n=>n.hasAttribute?.('data-swarm-attack-cues'));
const button=(p,edge=2)=>cue(p).shadowRoot.children[{1:1,2:2,4:3,8:4}[edge]].children[0];
const snap=p=>p.engine.getSnapshot();
const onScreen=(p,b)=>{const h=p.hud.rect;return b.x>10&&b.y>10&&b.x<p.win.innerWidth-10&&b.y<p.win.innerHeight-10&&!(b.x>h.left-30&&b.x<h.right+30&&b.y>h.top-30&&b.y<h.bottom+30)};
/** Shoot bugs where they are until the score reaches `score`. */
function earn(p,score){
  for(let i=0;i<3000&&snap(p).score<score;i++){
    p.tick(1/60);
    const bug=snap(p).status==='running'&&[...p.draws.values()].find(b=>onScreen(p,b));
    if(bug)p.shoot(bug);
  }
  p.tick(1/60);
  assert.ok(snap(p).score>=score,`earned ${snap(p).score}`);
}
/** Play on until the cue shows (every live bug latched on the off-screen footer, with `all`). */
function attack(p,all=false){
  const ready=()=>cue(p)&&!cue(p).hidden&&snap(p).status==='running'&&(!all||(snap(p).remaining===0&&[...p.draws.values()].every(b=>b.attached)));
  for(let i=0;i<1200&&!ready();i++)p.tick(1/60);
  assert.ok(ready(),'bugs latched on the off-screen footer and the cue shows');
}
function rescuePage(config={}){
  const p=fixture(createDomDefender,{noText:true,footer:true,...config});
  p.setTargets([p.footer]);p.call('start');return p;
}

test('new bugs spawn visibly near a tracked pointer, avoiding protected UI on desktop and touch',()=>{
  for(const mobile of [false,true]){
    const p=fixture(createDomDefender,{noTargets:true,noText:true,mobile});
    p.fire('pointermove',p.pointer(p.lead,100,150,mobile?'touch':'mouse'));p.call('start');p.tick(.12);
    const b=[...p.live.values()][0];assert.ok(b);
    assert.ok(b.x>=0&&b.y>=0&&b.x<=p.win.innerWidth&&b.y<=p.win.innerHeight);
    assert.ok(Math.hypot(b.x-100,b.y-150)<400);
    const r=p.hud.rect;assert.ok(b.x<r.left||b.x>r.right||b.y<r.top||b.y>r.bottom);
    p.finish();
  }
});

test('small bugs feed in the viewport without a local button, then leave when local letters are gone',()=>{
  const p=fixture(createDomDefender,{footer:true});p.setTargets([p.footer]);
  p.nodes.forEach(n=>n.nodeValue='ABC');p.call('start');p.tick(.25);
  const b=[...p.live.values()][0];
  p.tick(.6);assert.equal(b.pursuit,null,'Visible letters keep small bugs local');
  assert.equal(b.attached,false);
  p.nodes.forEach(n=>n.nodeValue='010'); // Host text is authoritative and no longer edible.
  for(let i=0;i<60&&!b.pursuit;i++)p.tick(.1);
  assert.ok(b.pursuit,'An exhausted local area permits a distant mission');p.finish();
});

test('native scroll can outrun free bugs without teleporting them back to a viewport edge',()=>{
  const p=fixture(createDomDefender,{noTargets:true,noText:true});p.call('start');p.tick(.12);
  const b=[...p.live.values()][0], before=b.y;
  p.win.scrollTo({top:1500});p.tick(.1);
  assert.ok(Math.abs(b.y-(before-1500))<30,'Return uses normal travel rather than a viewport clamp');
  assert.ok(b.y<0);assert.equal(p.win.scrollY,1500);p.finish();
});

test('locked alert spends nothing; jump moves immediately and keeps enemies alive, focus and score correct',()=>{
  const p=rescuePage();attack(p);const locked=button(p);
  locked.fire('click',{});p.tick(1/60);assert.equal(p.win.scrollY,0);assert.equal(snap(p).score,0);
  p.call('start');earn(p,50);attack(p);
  const before=snap(p);assert.equal(before.rescue.mode,'jump');
  const click=button(p);click.fire('click',{});
  assert.ok(p.win.scrollY>1500,'the page scrolls at once');assert.equal(p.doc.activeElement,p.footer);
  assert.equal(cue(p).hidden,true);click.fire('click',{});
  p.tick(1/60);
  const after=snap(p);assert.equal(after.score,before.score-50);assert.equal(after.alive,before.alive);
  assert.equal(after.rescue.jumpCost,75);assert.equal(after.rescue.zaps,0);
  click.fire('click',{});p.tick(1/60);assert.equal(snap(p).score,after.score);
  assert.equal(p.events.filter(e=>e.type==='rescue').length,1);p.finish();
});

test('zap is radius-bound, returns one point each, and cannot farm a clear bonus',()=>{
  for(const reduced of [false,true]){
    const p=rescuePage({reduced});earn(p,200);attack(p,true);
    const before=snap(p), normalKills=p.events.filter(e=>e.type==='kill').length;
    assert.equal(before.rescue.mode,'zap');button(p).fire('click',{});p.tick(1/60);
    const after=snap(p), event=p.events.find(e=>e.type==='rescue');
    assert.equal(event.action,'zap');assert.equal(event.killed,before.alive);assert.equal(after.score,before.score-200+before.alive);
    assert.equal(after.alive,0);assert.equal(after.kills,before.kills+before.alive);assert.equal(after.combo,1);
    assert.equal(after.rescue.zapCost,375);assert.equal(after.rescue.jumpCost,75);
    assert.equal(p.events.filter(e=>e.type==='kill').length,normalKills,'No normal kill multiplier/audio burst');
    assert.equal(after.status,'intermission');assert.equal(p.events.find(e=>e.type==='wave-clear').bonus,0);
    assert.ok(p.arcs.some(a=>a[2]>(reduced?100:10)));p.call('pause');const snapshot=snap(p);p.tick(1);assert.deepEqual(snap(p),snapshot);
    p.call('start');assert.deepEqual(snap(p).rescue,{jumpCost:50,zapCost:200,mode:'locked',jumps:0,zaps:0});p.finish();
  }
});

test('zap leaves distant survivors and charges once; removed, paused or hidden threats cannot charge',()=>{
  const p=rescuePage();earn(p,200);
  // Play on until a bug is latched off screen while another is still free on screen.
  const split=()=>cue(p)&&!cue(p).hidden&&snap(p).status==='running'&&[...p.draws.values()].some(b=>!b.attached&&onScreen(p,b));
  for(let i=0;i<2400&&!split();i++)p.tick(1/60);
  assert.ok(split());
  const free=[...p.draws.values()].find(b=>!b.attached&&onScreen(p,b)).id, before=snap(p);
  button(p).fire('click',{});p.tick(1/60);
  const event=p.events.find(e=>e.type==='rescue'), survivor=p.draws.get(free);
  assert.ok(event.killed>0&&event.killed<before.alive);
  assert.equal(snap(p).score,before.score-200+event.killed);
  assert.ok(survivor&&survivor.y<0,'The free survivor stayed at its place in the page');p.finish();
  for(const mode of ['removed','paused','hidden','failed-scroll']){
    const q=rescuePage();earn(q,50);attack(q);const control=button(q),score=snap(q).score;
    if(mode==='removed')q.footer.isConnected=false;
    if(mode==='paused')q.call('pause');
    if(mode==='hidden')q.doc.hidden=true;
    if(mode==='failed-scroll')q.footer.scrollIntoView=()=>{};
    control.fire('click',{});q.tick(1/60);assert.equal(snap(q).score,score,mode);
    assert.equal(q.events.filter(e=>e.type==='rescue').length,0,mode);
    q.footer.isConnected=true;q.doc.hidden=false;q.finish();
  }
});

test('rapid repeated rescues and protected alert presses cannot shoot through or charge twice',()=>{
  const p=rescuePage();earn(p,50);
  // A moment with the cue up and a bug on screen: a press on the cue right over that bug.
  const ready=()=>cue(p)&&!cue(p).hidden&&snap(p).status==='running'&&[...p.draws.values()].some(b=>!b.attached&&onScreen(p,b));
  for(let i=0;i<2400&&!ready();i++)p.tick(1/60);
  assert.ok(ready());
  const control=button(p),before=snap(p).score,kills=snap(p).kills,bug=[...p.draws.values()].find(b=>!b.attached&&onScreen(p,b));
  const press=p.pointer(control,bug.x,bug.y);p.fire('pointerdown',press);assert.ok(!press.prevented,'the cue press is the cue\'s');
  control.fire('click',{});
  // Even if a second edge remains visible, the shared action cooldown is authoritative.
  control.fire('click',{});p.tick(1/60);control.fire('click',{});p.tick(1/60);
  assert.equal(snap(p).kills,kills,'no bug was shot through the cue');
  assert.equal(snap(p).score,before-50);
  assert.equal(p.events.filter(e=>e.type==='rescue').length,1);p.finish();
});
