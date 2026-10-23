import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomDefender } from '../src/dom-defender.js';
import { fixture } from './helpers/engine-fixture.mjs';
const rect=(left,top,width=160,height=44)=>({left,top,width,height,right:left+width,bottom:top+height});
const cue=p=>p.doc.body.children.find(n=>n.hasAttribute?.('data-swarm-attack-cues'));
const button=(p,edge=2)=>cue(p).shadowRoot.children[{1:1,2:2,4:3,8:4}[edge]].children[0];
function earn(p,n){
  p.tick(3.5);
  for(let i=0;i<n;i++){
    const bug=[...p.live.values()][0];assert.ok(bug);
    bug.x=100;bug.y=220;bug.hp=1;bug.age=10;bug.attached=false;bug.pursuit=null;
    p.shoot(bug);p.tick(1/60);
  }
}
function attack(p){
  const bugs=[...p.live.values()];assert.ok(bugs.length);
  for(const b of bugs){b.speed=0;b.biteIn=100;b.foodWaitUntil=0;b.scatterUntil=0;b.attached=true;b.pursuit='attack';b.x=160;b.y=2320;}
  p.tick(1/60);assert.equal(cue(p).hidden,false);
  return bugs;
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
  const b=[...p.live.values()][0];b.speed=0;b.foodWaitUntil=0;
  p.tick(.3);assert.equal(b.pursuit,null,'Visible letters keep small bugs local');
  assert.equal(b.attached,false);
  p.nodes.forEach(n=>n.nodeValue='010'); // Host text is authoritative and no longer edible.
  for(let i=0;i<60&&!b.pursuit;i++)p.tick(.1);
  assert.ok(b.pursuit,'An exhausted local area permits a distant mission');p.finish();
});

test('fully grown attackers keep their remote mission while small bugs prefer a visible base',()=>{
  const p=rescuePage();p.tick(.5);
  const b=[...p.live.values()][0], original=b.target;
  b.tier=3;b.hp=3;b.attached=true;b.pursuit='attack';b.biteIn=100;
  // Enroll both targets at round start, then reveal the local one.
  p.call('stop');p.lead.hidden=true;p.setTargets([p.lead,p.footer]);p.call('start');p.tick(.5);
  const big=[...p.live.values()][0];big.tier=3;big.hp=3;big.attached=true;big.pursuit='attack';big.biteIn=100;
  const small=[...p.live.values()][1];small.tier=1;small.foodWaitUntil=0;
  p.lead.hidden=false;p.fire('resize',{});p.tick(.2);
  assert.equal(big.target.id,original.id);assert.equal(big.pursuit,'attack');
  assert.equal(small.target.id,'lead');assert.equal(small.pursuit,null);p.finish();
});

test('native scroll can outrun free bugs without teleporting them back to a viewport edge',()=>{
  const p=fixture(createDomDefender,{noTargets:true,noText:true});p.call('start');p.tick(.12);
  const b=[...p.live.values()][0], before=b.y;b.speed=100;
  p.win.scrollTo({top:1500});p.tick(.1);
  assert.ok(Math.abs(b.y-(before-1500))<25,'Return uses normal travel rather than a viewport clamp');
  assert.ok(b.y<0);assert.equal(p.win.scrollY,1500);p.finish();
});

test('locked alert spends nothing; jump moves immediately and keeps enemies alive, focus and score correct',()=>{
  const p=rescuePage();p.tick(.12);attack(p);const locked=button(p);
  locked.fire('click',{});assert.equal(p.win.scrollY,0);assert.equal(p.engine.getSnapshot().score,0);
  p.call('start');earn(p,4);attack(p);
  const before=p.engine.getSnapshot();assert.equal(before.rescue.mode,'jump');
  const click=button(p);click.fire('click',{});
  const after=p.engine.getSnapshot();assert.equal(after.score,before.score-50);assert.equal(after.alive,before.alive);
  assert.ok(p.win.scrollY>1500);assert.equal(p.doc.activeElement,p.footer);
  assert.equal(after.rescue.jumpCost,75);assert.equal(after.rescue.zaps,0);
  assert.equal(cue(p).hidden,true);click.fire('click',{});assert.equal(p.engine.getSnapshot().score,after.score);
  assert.equal(p.events.filter(e=>e.type==='rescue').length,1);p.finish();
});

test('zap is radius-bound, kills every tier, returns one point each, and cannot farm a clear bonus',()=>{
  for(const reduced of [false,true]){
    const p=rescuePage({reduced});earn(p,7);const bugs=attack(p);
    bugs.forEach((b,i)=>{b.tier=i%3+1;b.hp=b.tier});
    const before=p.engine.getSnapshot(), normalKills=p.events.filter(e=>e.type==='kill').length;
    assert.equal(before.rescue.mode,'zap');button(p).fire('click',{});
    const after=p.engine.getSnapshot(), event=p.events.find(e=>e.type==='rescue');
    assert.equal(event.killed,before.alive);assert.equal(after.score,before.score-200+before.alive);
    assert.equal(after.alive,0);assert.equal(after.kills,before.kills+before.alive);assert.equal(after.combo,1);
    assert.equal(after.rescue.zapCost,375);assert.equal(after.rescue.mode,'locked');
    assert.equal(p.events.filter(e=>e.type==='kill').length,normalKills,'No normal kill multiplier/audio burst');
    p.tick(1/60);assert.equal(p.engine.getSnapshot().status,'intermission');assert.equal(p.events.find(e=>e.type==='wave-clear').bonus,0);
    assert.ok(p.arcs.some(a=>a[2]>(reduced?100:10)));p.call('pause');const snapshot=p.engine.getSnapshot();p.tick(1);assert.deepEqual(p.engine.getSnapshot(),snapshot);
    p.call('start');assert.deepEqual(p.engine.getSnapshot().rescue,{jumpCost:50,zapCost:200,mode:'locked',jumps:0,zaps:0});p.finish();
  }
});

test('zap leaves distant survivors and charges once; removed, paused or hidden threats cannot charge',()=>{
  const p=rescuePage();earn(p,7);const bugs=attack(p);const far=bugs.at(-1);
  far.attached=false;far.pursuit=null;far.x=30;far.y=80;far.speed=0;
  const before=p.engine.getSnapshot();button(p).fire('click',{});
  assert.equal(p.engine.getSnapshot().alive,1);assert.equal(p.engine.getSnapshot().score,before.score-200+bugs.length-1);
  assert.ok(far.y<0,'Free survivor stayed at its original section');p.finish();
  for(const mode of ['removed','paused','hidden','failed-scroll']){
    const q=rescuePage();earn(q,4);attack(q);const control=button(q),score=q.engine.getSnapshot().score;
    if(mode==='removed')q.footer.isConnected=false;
    if(mode==='paused')q.call('pause');
    if(mode==='hidden')q.doc.hidden=true;
    if(mode==='failed-scroll')q.footer.scrollIntoView=()=>{};
    control.fire('click',{});assert.equal(q.engine.getSnapshot().score,score,mode);
    q.footer.isConnected=true;q.finish();
  }
});

test('rapid repeated rescues and protected alert presses cannot shoot through or charge twice',()=>{
  const p=rescuePage();earn(p,4);attack(p);
  const control=button(p),b=[...p.live.values()][0];b.x=200;b.y=200;
  const press=p.pointer(control,200,200);p.fire('pointerdown',press);assert.ok(!press.prevented);
  control.fire('click',{});const score=p.engine.getSnapshot().score;
  // Even if a second edge remains visible, the shared action cooldown is authoritative.
  control.fire('click',{});assert.equal(p.engine.getSnapshot().score,score);p.finish();
});


test('grown bugs bite a contacted letter on their route without gaining extra HP or chasing distant food',()=>{
  const p=fixture(createDomDefender);p.call('start');p.tick(.3);
  const b=[...p.live.values()].find(b=>b.food);assert.ok(b);
  const glyph=b.food,r=glyph.rect;glyph.reservedBy=0;b.food=null;b.chewing=false;
  b.tier=3;b.hp=3;b.lettersEaten=12;b.foodSearchIn=0;b.foodWaitUntil=0;b.speed=0;b.x=r.x-7;b.y=r.y;
  const target=b.target;p.tick(.5);
  assert.ok(p.events.some(e=>e.type==='bite'&&e.id===b.id&&e.lettersEaten===13&&e.full));
  assert.equal(b.hp,3);assert.equal(b.tier,3);assert.equal(b.target,target);
  b.x=700;b.y=390;b.food=null;b.chewing=false;b.foodSearchIn=0;p.tick(.1);
  assert.equal(b.food,null,'A hunter does not chase distant glyphs');p.finish();
});
