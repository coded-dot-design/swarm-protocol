import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Historical 1.0.9 optimization benchmark. Current behavior is covered in target-health.test.mjs.
// Run from any directory; optional paths are resolved by Node against cwd.
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for '+name);return args[i+1]}
const REFINED=args.includes('--refined');
const SOURCE=option('--engine',new URL(REFINED?'../src/dom-defender.js':'./fixtures/dom-defender-1.0.9.js',import.meta.url));
const BASELINE=option('--baseline',new URL('./fixtures/dom-defender-before-perf.js',import.meta.url));
const REPORT=option('--report',null);
process.on('uncaughtException', error=>{console.error(String(error.stack||error).split('\n').filter(line=>!line.includes('data:text/javascript')).slice(0,10).join('\n'));process.exitCode=1});
import { fixture } from './helpers/engine-fixture.mjs';
const rectangle=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
function suite(create,expectShadow=false,refined=false){
 const results={};
 // Physical feeding, exact tiers, Unicode, pause, mixed input, wave rewards and cleanup.
 const a=fixture(create,{footer:true});a.call('start');const canvasHost=expectShadow?a.checkCanvasIsolation():null;assert.equal(a.engine.getSnapshot().remaining,12);a.tick(7);
 const bites=a.events.filter(e=>e.type==='bite');assert.ok(bites.length>30);assert.ok(bites.some(e=>e.lettersEaten===12));for(const e of bites){assert.equal(e.tier,e.lettersEaten<6?1:e.lettersEaten<12?2:3);assert.equal(e.full,e.lettersEaten===12);assert.match(e.letter,/\p{L}/u)}
 a.call('pause');const paused=JSON.stringify(a.engine.getSnapshot()),pausedText=a.nodes.map(n=>n.nodeValue);a.tick(2);assert.equal(JSON.stringify(a.engine.getSnapshot()),paused);assert.deepEqual(a.nodes.map(n=>n.nodeValue),pausedText);a.call('resume');
 a.setCursorPoint(a.lead);a.fire('pointermove',a.pointer(a.lead,540,210));assert.match(a.lead.style.getPropertyValue('cursor'),/16 16, crosshair$/);
 const protectedPress=a.pointer(a.controls,[...a.draws.values()][0].x,[...a.draws.values()][0].y);a.fire('pointerdown',protectedPress);assert.ok(!protectedPress.prevented);
 for(let n=0;n<100&&a.engine.getSnapshot().alive;n++){a.shoot([...a.draws.values()][0],n%2?'touch':'mouse');a.tick(1/60)}a.tick(.1);assert.equal(a.engine.getSnapshot().status,'intermission');assert.equal(a.engine.getSnapshot().kills,12);assert.equal(a.lead.style.getPropertyValue('cursor'),'');a.tick(3.2);assert.equal(a.engine.getSnapshot().wave,2);
 a.call('stop');assert.deepEqual(a.nodes.map(n=>n.nodeValue),a.originalsText);assert.ok(!a.lead.hasAttribute('style'));
 // New app content is not adopted or restored by the game.
 a.call('start');a.tick(2);const app='Application text remains authoritative.';a.nodes[0].nodeValue=app;a.tick(2);assert.equal(a.nodes[0].nodeValue,app);a.call('stop');assert.equal(a.nodes[0].nodeValue,app);a.nodes[0].nodeValue=a.originalsText[0];
 // Scroll invalidation prevents unobserved bites; timer waves still grow to48.
 a.setTargets([]);a.call('start');a.tick(1);for(const area of a.areas)area.rect={...area.rect,top:3000,bottom:3100};a.fire('scroll',{},a.doc);a.tick(.2);const awayText=a.nodes.map(n=>n.nodeValue);a.tick(40);assert.deepEqual(a.nodes.map(n=>n.nodeValue),awayText);assert.equal(a.engine.getSnapshot().alive,48);assert.equal(a.engine.getSnapshot().wave,3);assert.ok([...a.draws.values()].every(b=>b.tier===1||b.lettersEaten>=6));a.call('stop');results.feeding=a.finish();if(expectShadow){assert.equal(canvasHost.isConnected,false);assert.ok(!a.doc.body.children.includes(canvasHost),'Destroy removes the shadow host itself')}
 // Many glyph candidates exercise selection while no CTA ends the round.
 const b=fixture(create,{noTargets:true,seed:0xabc012});b.call('start');b.tick(43);assert.equal(b.engine.getSnapshot().alive,48);assert.ok(b.events.filter(e=>e.type==='bite').length>=144);assert.equal(b.engine.getSnapshot().score,0);assert.ok(b.events.some(e=>e.type==='wave-start'&&e.reason==='timer'));results.hunger=b.finish();
 // 48 bugs, mobile full-width HUD, wide CTA stripes, resize, both damage phases.
 const c=fixture(create,{mobile:true,noText:true,seed:0xa05,wide:true});c.lead.hidden=true;c.call('start');c.tick(41);assert.equal(c.engine.getSnapshot().alive,48);assert.ok([...c.draws.values()].every(b=>b.tier===1&&b.lettersEaten===0));c.lead.rect=rectangle(40,2300,300,46);c.lead.hidden=false;c.fire('resize',{});let sawSparse=false,sawColor=false,sawBlack=false,maxOffscreen=0,resized=false;
 for(let n=0;n<1200&&c.engine.getSnapshot().status!=='gameover';n++){c.tick(1/60);maxOffscreen=Math.max(maxOffscreen,c.engine.getSnapshot().offscreenBugs);const target=[...c.draws.values()].find(x=>x.target)?.target;if(refined&&target){sawSparse ||= target.health>60;sawColor ||= target.health<=60&&target.health>25;sawBlack ||= target.health<=25&&target.health>0;if(!resized&&target.health<85){c.lead.rect=rectangle(30,2300,320,46);c.fire('resize',{});resized=true}}else if(target?.stripes?.size){const blacks=[...target.stripes.values()].filter(s=>s.black).length;if(target.stripes.size<target.stripeWidth){sawSparse=true;assert.equal(blacks,0)}if(target.stripes.size===target.stripeWidth&&!blacks)sawColor=true;if(blacks){sawBlack=true;assert.ok(sawColor);assert.equal(target.stripes.size,target.stripeWidth)}if(!resized&&target.health<85){c.lead.rect=rectangle(30,2300,320,46);c.fire('resize',{});resized=true}}}
 assert.equal(c.engine.getSnapshot().status,'gameover');assert.ok(sawSparse&&sawColor&&sawBlack&&maxOffscreen>=24);c.tick(1);assert.ok(!c.lead.hasAttribute('style'));results.stripes=c.finish();
 // Reticle/compatibility click edge, protected controls, capped tap effects.
 const d=fixture(create,{noText:true,seed:0x33});d.call('start');d.tick(.12);const first=[...d.draws.values()][0];d.setCursorPoint(d.lead);const fineMiss=d.pointer(d.lead,first.x+28,first.y);d.fire('pointerdown',fineMiss);assert.ok(!fineMiss.prevented);d.coarse.matches=true;const coarseHit=d.pointer(d.lead,first.x+28,first.y);d.fire('pointerdown',coarseHit);assert.ok(coarseHit.prevented,'Retained media query still responds to live pointer-capability changes');d.coarse.matches=false;const miss=d.pointer(d.lead,first.x,first.y);d.fire('pointerdown',miss);assert.ok(!miss.prevented);const click={...miss,detail:1};d.fire('click',click);assert.ok(!click.prevented);for(let n=0;n<20;n++)d.fire('pointerdown',d.pointer(d.lead,400,590,'touch'));d.tick(1/60);assert.equal(d.arcs.length,8);d.tick(.5);assert.equal(d.arcs.length,0);d.fire('pointermove',d.pointer(d.lead,500,210));assert.match(d.lead.style.getPropertyValue('cursor'),/^url/);d.lead.style.setProperty('cursor','wait');d.call('pause');assert.equal(d.lead.style.getPropertyValue('cursor'),'wait');d.lead.style.removeProperty('cursor');d.call('resume');d.fire('pointercancel',{});assert.equal(d.lead.style.getPropertyValue('cursor'),'');results.input=d.finish();
 const r=fixture(create,{noText:true,reduced:true});r.call('start');r.fire('pointerdown',r.pointer(r.lead,400,590,'touch'));r.tick(1/60);assert.equal(r.arcs[0][2],10);r.tick(.05);assert.equal(r.arcs[0][2],10);r.tick(.12);assert.equal(r.arcs.length,0);results.reduced=r.finish();
 return results;
}
// New host-ownership cases run only against the current engine. Historical
// fixtures remain unchanged and still produce the exact original game traces.
function verifyStyleOwnership(create){
 const cases=[
  {name:'new inline value survives later repaint and stop',repaint:true,change:()=>({value:'linear-gradient(0deg,#112233,#445566)',priority:''})},
  {name:'same value with a new priority survives repaint',repaint:true,change:(current,priority)=>({value:current,priority:priority?'':'important'})},
  {name:'priority-only update survives immediate stop',repaint:false,change:(current,priority)=>({value:current,priority:priority?'':'important'})},
  {name:'removed inline property stays removed through repaint and stop',repaint:true,change:()=>({value:'',priority:''})}
 ];
 for(const test of cases){
  const page=fixture(create,{noText:true,seed:0x79f});
  page.lead.style.setProperty('background-image','linear-gradient(90deg,#ffffff,#eeeeee)','important');
  page.call('start');
  for(let frame=0;frame<300&&!page.lead.getAttribute('data-swarm-infected');frame++)page.tick(1/60);
  assert.equal(page.lead.getAttribute('data-swarm-infected'),'active','Fixture reaches actual CTA painting');
  const expected=test.change(page.lead.style.getPropertyValue('background-image'),page.lead.style.getPropertyPriority('background-image'));
  if(expected.value)page.lead.style.setProperty('background-image',expected.value,expected.priority);
  else page.lead.style.removeProperty('background-image');
  if(test.repaint){page.tick(.8);assert.equal(page.engine.getSnapshot().status,'running');}
  assert.equal(page.lead.style.getPropertyValue('background-image'),expected.value,test.name);
  assert.equal(page.lead.style.getPropertyPriority('background-image'),expected.priority,test.name);
  page.call('stop');
  assert.equal(page.lead.style.getPropertyValue('background-image'),expected.value,test.name);
  assert.equal(page.lead.style.getPropertyPriority('background-image'),expected.priority,test.name);
  assert.equal(page.lead.style.getPropertyValue('color'),'','Unchanged game-owned properties still restore');
  page.lead.style.removeProperty('background-image');
  page.finish();
 }
 return cases.map(test=>test.name);
}
function verifyAttackCues(create) {
 const page=fixture(create,{noText:true,seed:0x567});
 const cue=()=>page.doc.body.children.find(node=>node.hasAttribute?.('data-swarm-attack-cues'));
 const move=(left,top)=>{page.lead.rect=rectangle(left,top,120,44);page.fire('scroll',{},page.doc);page.tick(.4)};
 page.lead.rect=rectangle(100,900,120,44);
 page.call('start');assert.equal(cue(),undefined,'No cue before an actual attack');
 for(let n=0;n<900&&!cue();n++)page.tick(1/60);
 assert.ok(cue(),'A real attached offscreen attacker creates its edge cue');
 assert.equal(cue().getAttribute('data-swarm-directions'),'bottom');
 assert.equal(cue().hidden,false);
 for(const [left,top,expected] of [[100,-100,'top'],[-200,100,'left'],[900,100,'right'],[900,-100,'top right']]){
  move(left,top);assert.equal(cue().getAttribute('data-swarm-directions'),expected);
 }
 page.call('pause');assert.equal(cue().hidden,true,'Pause clears cues immediately');
 page.call('resume');page.tick(.4);assert.equal(cue().hidden,false);
 move(100,100);assert.equal(cue().hidden,true,'Scrolling the button into view clears the cue');
 move(100,900);
 for(let n=0;n<900&&cue().hidden;n++)page.tick(1/60);
 assert.equal(cue().hidden,false);
 page.lead.isConnected=false;page.fire('scroll',{},page.doc);page.tick(.2);
 assert.equal(cue().hidden,true,'Removed targets stop warning');
 page.lead.isConnected=true;
 page.call('stop');assert.equal(cue().hidden,true);
 page.call('start');assert.equal(cue().hidden,true,'A new round does not retain old threats');
 for(let n=0;n<3000&&page.engine.getSnapshot().status!=='gameover';n++)page.tick(1/60);
 assert.equal(page.engine.getSnapshot().status,'gameover');
 assert.equal(cue().hidden,true,'Game over clears warnings');
 const host=cue();page.finish();assert.equal(host.isConnected,false);
 assert.ok(!page.doc.body.children.includes(host),'Destroy removes the cue host');
 return true;
}
function verifyFeedback(create) {
 for(const config of [{dark:false},{dark:true},{dark:false,reduced:true},{dark:false,noMedia:true}]){
  const page=fixture(create,{...config,noText:true,feedback:true,seed:0x33});
  page.call('start');page.tick(.12);
  const bug=[...page.draws.values()][0];
  page.shoot(bug);page.tick(1/60);
  const score=()=>page.feedback.find(p=>p.kind==='text'&&p.text.startsWith('+'));
  const first=score();assert.ok(first,'A real kill renders a score popup');
  assert.equal(first.color,config.dark?'#b4fff0':'#f4457a');
  assert.equal(first.alpha,1);assert.match(first.font,/700 16px/);
  const outline=page.feedback.find(p=>p.kind==='outline');
  assert.equal(outline.color,config.dark?'#101010':'#ffffff');
  assert.equal(outline.text,first.text);assert.equal(outline.width,3.5);
  assert.ok(page.feedback.some(p=>p.kind==='ring'&&p.color===(config.dark?'#74dfa1':'#127646')));
  const shards=page.feedback.filter(p=>p.kind==='shard');
  assert.equal(shards.length,config.reduced?0:7);
  if(shards.length)assert.ok(shards.every(p=>p.color===(config.dark?'#ff6b6b':'#b42332')));
  const queryCount=page.metrics.matchMedia;
  if(!config.noMedia){
   page.dark.matches=!config.dark;page.tick(1/60);
   assert.equal(score().color,config.dark?'#f4457a':'#b4fff0','An existing popup follows a live system theme change');
   const switched=page.feedback.filter(p=>p.kind==='shard');
   if(switched.length)assert.ok(switched.every(p=>p.color===(config.dark?'#b42332':'#ff6b6b')));
  }
  page.tick(.55);assert.equal(score().alpha,1,'Points stay opaque long enough to read');
  if(config.reduced)assert.equal(score().y,first.y,'Reduced motion keeps score text still');
  else assert.ok(score().y<first.y,'Normal score text rises gently');
  page.tick(.3);assert.ok(score().alpha>0&&score().alpha<1,'Points fade smoothly at the end');
  page.tick(.3);assert.equal(score(),undefined,'Expired scores are removed');
  assert.equal(page.metrics.matchMedia,queryCount,'Rendering reuses one media query');
  assert.equal(page.events.filter(e=>e.type==='kill').length,1);
  page.finish();
 }
 return true;
}
async function run(path,expectShadow=false){const source=fs.readFileSync(path,'utf8');const module=await import(path instanceof URL ? path.href : pathToFileURL(resolve(path)).href);const result=suite(module.createDomDefender,expectShadow,REFINED&&expectShadow);const styleOwnership=expectShadow?verifyStyleOwnership(module.createDomDefender):[];const attackCues=expectShadow?verifyAttackCues(module.createDomDefender):false;const feedback=expectShadow&&!REFINED?verifyFeedback(module.createDomDefender):false;return{feedback,attackCues,styleOwnership,sourceHash:crypto.createHash('sha256').update(source).digest('hex'),sourceBytes:Buffer.byteLength(source),gzipBytes:zlib.gzipSync(source,{level:9}).length,results:result}}
const before=await run(BASELINE);const after=await run(SOURCE,true);
const exactScenarios=REFINED?['hunger']:Object.keys(before.results);
for(const name of exactScenarios){assert.equal(after.results[name].trace,before.results[name].trace,'Exact seeded gameplay/DOM trace: '+name);assert.deepEqual(after.results[name].eventCounts,before.results[name].eventCounts)}
const totals=record=>{const out={};for(const scenario of Object.values(record.results))for(const[k,v]of Object.entries(scenario.metrics))out[k]=k.startsWith('max')?Math.max(out[k]||0,v):(out[k]||0)+v;return out};
const report={nodeVersion:process.version,baselineSourceHash:before.sourceHash,engineSourceHash:after.sourceHash,exactTraceMatch:!REFINED,currentRefinement:REFINED,exactScenarios,shadowCanvasOwnership:true,attackCues:after.attackCues,feedback:after.feedback,styleOwnership:after.styleOwnership,scenarios:Object.keys(before.results),beforeBytes:before.sourceBytes,afterBytes:after.sourceBytes,beforeGzip:before.gzipBytes,afterGzip:after.gzipBytes,before:totals(before),after:totals(after),events:Object.fromEntries(Object.entries(after.results).map(([name,r])=>[name,r.eventCounts])),traces:Object.fromEntries(Object.entries(after.results).map(([name,r])=>[name,r.trace]))};
if(REPORT)fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
