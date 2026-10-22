import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
// Run from any directory; optional paths are resolved by Node against cwd.
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for '+name);return args[i+1]}
const SOURCE=option('--engine',new URL('../src/dom-defender.js',import.meta.url));
const BASELINE=option('--baseline',new URL('./fixtures/dom-defender-before-perf.js',import.meta.url));
const REPORT=option('--report',null);
process.on('uncaughtException', error=>{console.error(String(error.stack||error).split('\n').filter(line=>!line.includes('data:text/javascript')).slice(0,10).join('\n'));process.exitCode=1});
let counting=null;
const originals={hypot:Math.hypot,abs:Math.abs,random:Math.random,sort:Array.prototype.sort,filter:Array.prototype.filter,slice:Array.prototype.slice,map:Array.prototype.map,splice:Array.prototype.splice,from:Array.from};
Math.hypot=function(...args){if(counting)counting.hypot++;return originals.hypot(...args)};
Math.abs=function(x){if(counting)counting.abs++;return originals.abs(x)};
Array.prototype.sort=function(compare){if(counting)counting.sortCalls++;const wrapped=typeof compare==='function'?(a,b)=>{if(counting)counting.sortComparisons++;return compare(a,b)}:compare;return originals.sort.call(this,wrapped)};
for(const name of ['filter','slice','map','splice'])Array.prototype[name]=function(...args){if(counting)counting[name+'Calls']++;return originals[name].apply(this,args)};
Array.from=function(...args){if(counting)counting.arrayFromCalls++;return originals.from(...args)};
const rectangle=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
function emitter(){const listeners=new Map();return{listeners,addEventListener(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},removeEventListener(n,f){listeners.get(n)?.delete(f)},fire(n,e){for(const f of [...listeners.get(n)||[]])f(e)}}}
function fixture(create,config={}){
 const metrics={hypot:0,abs:0,sortCalls:0,sortComparisons:0,filterCalls:0,sliceCalls:0,mapCalls:0,spliceCalls:0,arrayFromCalls:0,matchMedia:0,rangeCreated:0,rangeRects:0,elementRects:0,computedStyle:0,closest:0,styleWrites:0,attributeWrites:0,rafScheduled:0,maxRaf:0,maxRangePerFrame:0,frames:0};
 let seed=config.seed||0xdecafbad,now=0,nextId=0,canvas=null,arcs=[],lastDraw=[],cursorPoint=null,occluder=null;const rafs=new Map(),timers=new Map(),draws=new Map(),live=new Map(),events=[],allElements=[],nodes=[],storage=new Map();
 const trace=crypto.createHash('sha256');
 function invoke(fn){const before=counting;counting=metrics;try{return fn()}finally{counting=before}}
 function rng(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
 function css(){const values=new Map();return{get length(){return values.size},get cssText(){return JSON.stringify([...values])},getPropertyValue:n=>values.get(n)?.value||'',getPropertyPriority:n=>values.get(n)?.priority||'',setProperty(n,value,priority=''){if(counting)metrics.styleWrites++;values.set(n,{value:String(value),priority})},removeProperty:n=>values.delete(n)}}
 function connect(node,value){node.isConnected=value;for(const child of node.children||[])connect(child,value);if(node.shadowRoot)connect(node.shadowRoot,value)}
 function append(parent,values){for(const child of values){child.parentNode=parent;child.parentElement=parent.tagName?parent:null;parent.children.push(child);connect(child,parent.isConnected)}}
 function element(tag,r,attributes={}){const attr=new Map(Object.entries(attributes)),style=css();const el={tagName:tag.toUpperCase(),id:attributes.id||'',textContent:tag,style,rect:r,hidden:false,isConnected:true,parentElement:null,parentNode:null,children:[],append(...values){append(this,values)},appendChild(child){append(this,[child]);return child},attachShadow(){const root={host:this,isConnected:this.isConnected,children:[],append(...values){append(this,values)}};this.shadowRoot=root;return root},getBoundingClientRect(){if(counting)metrics.elementRects++;return this.rect},hasAttribute(n){return n==='style'?style.length>0||attr.has(n):attr.has(n)},getAttribute(n){return n==='style'?(style.length?style.cssText:attr.has(n)?'':null):attr.get(n)??null},setAttribute(n,v){if(counting)metrics.attributeWrites++;attr.set(n,String(v))},removeAttribute:n=>attr.delete(n),contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false},closest(selector){if(counting)metrics.closest++;for(let p=this;p;p=p.parentElement){for(const token of selector.split(',')){const part=token.trim(),attribute=part.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);if(attribute?p.hasAttribute?.(attribute[1])&&(!attribute[2]||p.getAttribute(attribute[1])===attribute[2]):p.tagName?.toLowerCase()===part.toLowerCase())return p}}return null},remove(){connect(this,false);const siblings=this.parentNode?.children;if(siblings){const index=siblings.indexOf(this);if(index>=0)siblings.splice(index,1)}this.parentNode=null;this.parentElement=null}};allElements.push(el);return el}
 const width=config.mobile?390:800,height=config.mobile?844:600;
 const lead=element('button',rectangle(config.mobile?90:490,config.mobile?280:190,config.wide?300:160,44),{id:'lead','data-swarm-target':''});
 const footer=element('button',rectangle(80,2300,config.mobile?210:320,46),{id:'footer','data-swarm-target':''});
 const hud=element('aside',config.mobile?rectangle(0,610,390,234):rectangle(570,430,220,150),{'data-swarm-ui':''});
 const areas=[element('p',rectangle(20,65,width-40,110),{'data-swarm-text':''}),element('p',rectangle(20,310,width-40,100),{'data-swarm-text':''})];
 const surface=element('article',rectangle(0,0,width,420),{'data-swarm-surface':''});
 const originalsText=['Alpha beta GAMMA λΩЖ e\u0301𐐀! 2019 01 🙂 '.repeat(15),'Eat six letters then grow. Keep every real click safe! '.repeat(15)];
 for(let i=0;i<areas.length;i++)nodes.push({nodeValue:originalsText[i],isConnected:true,parentElement:areas[i],lineWidth:width-60});
 const protectedLink=element('a',rectangle(20,30,100,20)),protectedNode={nodeValue:'Never eat this link',isConnected:true,parentElement:protectedLink};
 const controls=element('input',rectangle(20,480,100,20));
 let chosenTargets=config.noTargets?[]:config.footer?[lead,footer]:[lead],chosenText=config.noText?[]:areas,chosenSurfaces=[surface];
 const context={setTransform(){},clearRect(){draws.clear();live.clear();lastDraw=[];arcs=[]},fillRect(){},fillText(){},save(){},restore(){},beginPath(){},arc(x,y,r){arcs.push([x,y,r])},stroke(){},moveTo(){},lineTo(){}};
 const computedDefaults={'background-image':'none','background-color':'rgb(255, 255, 255)','background-size':'auto','background-position':'0% 0%','background-repeat':'repeat','background-origin':'padding-box','background-clip':'border-box','color':'rgb(21, 21, 21)','text-shadow':'none'};
 const coarse={matches:false};
 const win={...emitter(),innerWidth:width,innerHeight:height,devicePixelRatio:1,performance:{now:()=>now},matchMedia(q){if(counting)metrics.matchMedia++;return q==='(pointer: coarse)'?coarse:{matches:false}},getComputedStyle(el){if(counting)metrics.computedStyle++;return{getPropertyValue:n=>el.style.getPropertyValue(n)||computedDefaults[n]||''}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame(f){if(counting)metrics.rafScheduled++;rafs.set(++nextId,f);metrics.maxRaf=Math.max(metrics.maxRaf,rafs.size);return nextId},cancelAnimationFrame:id=>rafs.delete(id),setTimeout(f,ms){timers.set(++nextId,{f,at:now+ms});return nextId},clearTimeout:id=>timers.delete(id)};
 function glyphRect(node,start,end){const units=[...graphemes.segment(node.nodeValue)],part=units.find(p=>p.index===start);assert.ok(part,'UTF-16 start must be a grapheme boundary');assert.equal(end,start+part.segment.length);let x=node.parentElement.rect.left+4,y=node.parentElement.rect.top+2,left=x;for(const unit of units){const w=/[01]/.test(unit.segment)?7:unit.segment.length>1?12:/\s/.test(unit.segment)?5:8;if(x-left+w>node.lineWidth){x=left;y+=20}if(unit.index===start)return rectangle(x,y,w,18);x+=w}throw Error('Missing glyph')}
 const doc={...emitter(),hidden:false,defaultView:win,body:element('body',rectangle(0,0,width,height)),querySelector(){return null},querySelectorAll(s){return s==='[data-swarm-target]'?chosenTargets:s==='[data-swarm-text]'?chosenText:s==='[data-swarm-surface]'?chosenSurfaces:s==='[data-swarm-ui]'?[hud]:[]},createTreeWalker(el){let i=0;const list=nodes.filter(n=>n.parentElement===el).concat(protectedNode);return{nextNode:()=>list[i++]||null}},createElement(tag){const el=element(tag,rectangle(0,0,width,height));if(tag==='canvas'){canvas=el;canvas.getContext=()=>context}return el},createRange(){if(counting)metrics.rangeCreated++;let node,start,end;return{setStart(n,i){node=n;start=i},setEnd(n,i){assert.equal(n,node);end=i},getBoundingClientRect(){if(counting)metrics.rangeRects++;return glyphRect(node,start,end)},detach(){}}},elementFromPoint(x,y){if(cursorPoint)return cursorPoint;if(occluder)return occluder;for(const area of areas){const r=area.rect;if(y>=r.top&&y<r.top+r.height&&x>=r.left&&x<r.right)return area}return areas[0]}};
 Math.random=rng;
 const engine=invoke(()=>create({document:doc,reducedMotion:config.reduced??false,drawBug(ctx,b){draws.set(b.id,{...b});live.set(b.id,b);lastDraw.push([b.id,b.x,b.y,b.angle,b.tier,b.hp,b.lettersEaten,b.chewing,b.attached,b.pursuit,b.scatterUntil])},onEvent:e=>{events.push(e);trace.update('E'+JSON.stringify(e))},onState:s=>trace.update('S'+JSON.stringify(s))}));
 function checkpoint(){trace.update('F'+JSON.stringify(lastDraw));trace.update('D'+JSON.stringify([chosenTargets.map(t=>[t.id,t.style.cssText,t.getAttribute('data-swarm-infected')]),nodes.map(n=>n.nodeValue)]))}
 function tick(seconds){for(let n=0;n<Math.round(seconds*60);n++){now+=1000/60;const callbacks=[...rafs.values()];rafs.clear();const before=metrics.rangeRects;for(const cb of callbacks)invoke(()=>cb(now));for(const[id,t]of[...timers])if(t.at<=now){timers.delete(id);invoke(t.f)}metrics.maxRangePerFrame=Math.max(metrics.maxRangePerFrame,metrics.rangeRects-before);metrics.frames+=callbacks.length;assert.ok(metrics.rangeRects-before<=36);checkpoint()}}
 function pointer(el,x,y,type='mouse'){return{button:0,clientX:x,clientY:y,pointerType:type,target:el,composedPath:()=>[el],preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}}}
 function fire(name,e,where=win){return invoke(()=>where.fire(name,e))}
 function shoot(b,type='mouse',click=true){const p=pointer(lead,b.x,b.y,type);fire('pointerdown',p);assert.ok(p.prevented&&p.stopped);if(click){const c={...p,detail:1,prevented:false,stopped:false};fire('click',c);assert.ok(c.prevented&&c.stopped)}}
 function call(name){return invoke(()=>engine[name]())}
 function checkCanvasIsolation(){const root=canvas.parentNode,host=root?.host;assert.ok(host?.hasAttribute('data-swarm-overlay'),'Canvas is owned by a dedicated shadow host');assert.equal(host.hasAttribute('data-swarm-ui'),false,'Overlay never excludes the whole viewport from gameplay');assert.equal(host.parentElement,doc.body);assert.equal(host.getAttribute('aria-hidden'),'true');assert.ok(root.children.some(node=>node.tagName==='STYLE'&&node.textContent.includes('pointer-events:none!important')),'Overlay remains pointer transparent');return host}
 function finish(){call('destroy');assert.equal(rafs.size,0);assert.equal(timers.size,0);assert.ok(metrics.maxRaf<=1,'At most one pending animation frame');assert.equal([...win.listeners.values(),...doc.listeners.values()].reduce((n,set)=>n+set.size,0),0);assert.equal(canvas?.isConnected,false);assert.ok(chosenTargets.every(t=>!t.hasAttribute('style')),'Original empty target styles restored');assert.equal(protectedNode.nodeValue,'Never eat this link');return{metrics,trace:trace.digest('hex'),eventCounts:Object.fromEntries([...new Set(events.map(e=>e.type))].map(type=>[type,events.filter(e=>e.type===type).length]))}}
 return{engine,call,tick,fire,shoot,pointer,finish,checkCanvasIsolation,events,draws,live,nodes,originalsText,lead,footer,areas,hud,controls,win,doc,metrics,coarse,setCursorPoint:el=>cursorPoint=el,setOccluder:el=>occluder=el,get arcs(){return arcs},setText:arr=>chosenText=arr,setTargets:arr=>chosenTargets=arr};
}
function suite(create,expectShadow=false){
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
 for(let n=0;n<1200&&c.engine.getSnapshot().status!=='gameover';n++){c.tick(1/60);maxOffscreen=Math.max(maxOffscreen,c.engine.getSnapshot().offscreenBugs);const target=[...c.draws.values()].find(x=>x.target)?.target;if(target?.stripes.size){const blacks=[...target.stripes.values()].filter(s=>s.black).length;if(target.stripes.size<target.stripeWidth){sawSparse=true;assert.equal(blacks,0)}if(target.stripes.size===target.stripeWidth&&!blacks)sawColor=true;if(blacks){sawBlack=true;assert.ok(sawColor);assert.equal(target.stripes.size,target.stripeWidth)}if(!resized&&target.health<85){c.lead.rect=rectangle(30,2300,320,46);c.fire('resize',{});resized=true}}}
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
  {name:'same value with newer important priority survives repaint',repaint:true,change:current=>({value:current,priority:'important'})},
  {name:'priority-only update survives immediate stop',repaint:false,change:current=>({value:current,priority:'important'})},
  {name:'removed inline property stays removed through repaint and stop',repaint:true,change:()=>({value:'',priority:''})}
 ];
 for(const test of cases){
  const page=fixture(create,{noText:true,seed:0x79f});
  page.lead.style.setProperty('background-image','linear-gradient(90deg,#ffffff,#eeeeee)','important');
  page.call('start');
  for(let frame=0;frame<300&&!page.lead.getAttribute('data-swarm-infected');frame++)page.tick(1/60);
  assert.equal(page.lead.getAttribute('data-swarm-infected'),'active','Fixture reaches actual CTA painting');
  const expected=test.change(page.lead.style.getPropertyValue('background-image'));
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
async function run(path,expectShadow=false){const source=fs.readFileSync(path,'utf8');const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const result=suite(module.createDomDefender,expectShadow);const styleOwnership=expectShadow?verifyStyleOwnership(module.createDomDefender):[];return{styleOwnership,sourceHash:crypto.createHash('sha256').update(source).digest('hex'),sourceBytes:Buffer.byteLength(source),gzipBytes:zlib.gzipSync(source,{level:9}).length,results:result}}
const before=await run(BASELINE);const after=await run(SOURCE,true);
for(const name of Object.keys(before.results)){assert.equal(after.results[name].trace,before.results[name].trace,'Exact seeded gameplay/DOM trace: '+name);assert.deepEqual(after.results[name].eventCounts,before.results[name].eventCounts)}
const totals=record=>{const out={};for(const scenario of Object.values(record.results))for(const[k,v]of Object.entries(scenario.metrics))out[k]=k.startsWith('max')?Math.max(out[k]||0,v):(out[k]||0)+v;return out};
const report={nodeVersion:process.version,baselineSourceHash:before.sourceHash,engineSourceHash:after.sourceHash,exactTraceMatch:true,shadowCanvasOwnership:true,styleOwnership:after.styleOwnership,scenarios:Object.keys(before.results),beforeBytes:before.sourceBytes,afterBytes:after.sourceBytes,beforeGzip:before.gzipBytes,afterGzip:after.gzipBytes,before:totals(before),after:totals(after),events:Object.fromEntries(Object.entries(after.results).map(([name,r])=>[name,r.eventCounts])),traces:Object.fromEntries(Object.entries(after.results).map(([name,r])=>[name,r.trace]))};
if(REPORT)fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
