import { transformSync } from 'esbuild';
/**
 * Swarm Protocol — MIT © 2026 Chris Cooley.
 * Portable post-load scheduler tests, with a controlled clock and lazy import.
 * Run: node qa/deferred-lifecycle.mjs [path/to/src/swarm-deferred.js]
 * Also works from tests/deferred-lifecycle.test.mjs in the standalone package.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script, createContext } from 'node:vm';
import test from 'node:test';

const sourcePath=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../src/swarm-deferred.ts',import.meta.url));
const source=transformSync(readFileSync(sourcePath,'utf8'), {loader:'ts'}).code;
const importPattern=/import\((['"])\.\/swarm-loader\.js\1\)/g;
assert.equal([...source.matchAll(importPattern)].length,1,'The scheduler must have one lazy bootstrap boundary.');
const instrumented=source.replace(importPattern,'__loadBootstrap()')
  .replace('export function installSwarmDeferred(','function installSwarmDeferred(')+'\ninstallSwarmDeferred;';

const settle=async()=>{for(let index=0;index<12;index++)await Promise.resolve();};

function fixture({complete=false,idle=true,hidden=false,installError=null}={}) {
  class Target {
    listeners=new Map();
    addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
    removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
    emit(type){for(const fn of [...(this.listeners.get(type)||[])])if(this.listeners.get(type)?.has(fn))fn({type});}
    count(){return [...this.listeners.values()].reduce((total,list)=>total+list.size,0);}
  }
  const win=new Target(),doc=new Target(),timers=new Map(),idles=new Map(),imports=[],idleTimeouts=[];
  const calls={imports:0,installs:0,destroys:0,timers:0,idles:0,ui:0};
  let clock=0,serial=0,mountOptions=null;
  const failUnexpected=name=>()=>{throw new Error('Unexpected scheduler '+name);};
  Object.assign(win,{
    setTimeout(fn,delay){const id=++serial;calls.timers++;timers.set(id,{fn,at:clock+delay});return id;},
    clearTimeout(id){timers.delete(id);},
    requestAnimationFrame:failUnexpected('animation frame'),
    setInterval:failUnexpected('interval'),
    fetch:failUnexpected('fetch'),
    localStorage:{getItem:failUnexpected('storage read'),setItem:failUnexpected('storage write')},
  });
  if(idle) Object.assign(win,{
    requestIdleCallback(fn,{timeout}){const id=++serial;calls.idles++;idleTimeouts.push(timeout);idles.set(id,fn);return id;},
    cancelIdleCallback(id){idles.delete(id);},
  });
  Object.assign(doc,{
    defaultView:win,readyState:complete?'complete':'loading',hidden,
    createElement(){calls.ui++;throw new Error('The scheduler must not create UI.');},
  });
  const listener=()=>{};
  const installation={destroy(){calls.destroys++;doc.removeEventListener('stub-installation',listener);}};
  const bootstrap={installSwarm(options){
    calls.installs++;mountOptions=options;
    if(installError)throw installError;
    doc.addEventListener('stub-installation',listener);
    return installation;
  }};
  const loadBootstrap=()=>{
    calls.imports++;
    return new Promise((resolve,reject)=>imports.push({resolve,reject}));
  };
  const context=createContext({document:doc,window:win,__loadBootstrap:loadBootstrap});
  const installSwarmDeferred=new Script(instrumented,{filename:sourcePath}).runInContext(context);
  function nextTimer(){
    const next=[...timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
    assert.ok(next,'Expected a scheduled timer.');
    timers.delete(next[0]);clock=next[1].at;next[1].fn();
  }
  function advance(ms){
    const until=clock+ms;
    let count=0;
    while([...timers.values()].some(timer=>timer.at<=until)){
      assert.ok(++count<100,'The scheduler must not poll.');nextTimer();
    }
    clock=until;
  }
  return {
    calls,doc,win,installation,idleTimeouts,nextTimer,advance,
    install:(options={},scheduling={})=>installSwarmDeferred({document:doc,...options},scheduling),
    installRaw:installSwarmDeferred,
    setGlobalDocument(value){context.document=value;},
    options:()=>mountOptions,
    load(){doc.readyState='complete';win.emit('load');},
    visibility(value){doc.hidden=value;doc.emit('visibilitychange');},
    idle(){const next=idles.entries().next().value;assert.ok(next,'Expected an idle callback.');idles.delete(next[0]);next[1]({didTimeout:false,timeRemaining:()=>10});},
    resolveImport(){const next=imports.shift();assert.ok(next,'Expected an outstanding import.');next.resolve(bootstrap);},
    rejectImport(error){const next=imports.shift();assert.ok(next,'Expected an outstanding import.');next.reject(error);},
    pending:()=>({timers:timers.size,idles:idles.size,listeners:win.count()+doc.count()}),
    assertClean(){assert.deepEqual({timers:timers.size,idles:idles.size,listeners:win.count()+doc.count()},{timers:0,idles:0,listeners:0});},
  };
}

test('module evaluation is SSR-safe and invoking it without a document fails clearly',()=>{
  const install=new Script(instrumented).runInContext(createContext({__loadBootstrap(){throw new Error('Unexpected import.');}}));
  assert.equal(typeof install,'function');
  assert.throws(()=>install(),/must be called in a browser/);
});

test('nothing imports or schedules before load, then delay and idle gate the bootstrap',async()=>{
  const f=fixture(),scheduled=f.install();let settled=false;
  void scheduled.ready.then(()=>{settled=true;});
  f.advance(10000);await settle();
  assert.equal(settled,false);assert.equal(f.calls.imports,0);assert.equal(f.calls.timers,0);assert.equal(f.calls.idles,0);assert.equal(f.calls.ui,0);
  f.load();f.advance(999);assert.equal(f.calls.imports,0);assert.equal(f.calls.idles,0);
  f.advance(1);assert.equal(f.calls.imports,0);assert.deepEqual(f.idleTimeouts,[2000]);
  f.idle();assert.equal(f.calls.imports,1);assert.equal(f.calls.installs,0);
  f.resolveImport();assert.equal(await scheduled.ready,f.installation);
  assert.equal(f.calls.installs,1);assert.equal(f.options().document,f.doc);
  assert.deepEqual(f.pending(),{timers:0,idles:0,listeners:1},'Only the completed installation retains its own listener.');
  scheduled.destroy();scheduled.destroy();assert.equal(f.calls.destroys,1);f.assertClean();
});

test('an already-loaded page honors configured delay and idle timeout without another load event',async()=>{
  const f=fixture({complete:true}),scheduled=f.install({}, {delayMs:250,idleTimeoutMs:750});
  f.advance(249);assert.equal(f.calls.imports,0);assert.equal(f.calls.idles,0);
  f.advance(1);assert.deepEqual(f.idleTimeouts,[750]);f.idle();
  f.resolveImport();await scheduled.ready;scheduled.destroy();f.assertClean();
});

test('unsupported idle callbacks use a cancellable timer after the post-load delay',async()=>{
  const f=fixture({complete:true,idle:false}),scheduled=f.install();
  f.advance(999);assert.equal(f.calls.imports,0);
  f.nextTimer();assert.equal(f.calls.imports,0);assert.equal(f.pending().timers,1);
  f.nextTimer();assert.equal(f.calls.imports,1);assert.equal(f.calls.idles,0);
  f.resolveImport();await scheduled.ready;scheduled.destroy();f.assertClean();
});

for(const stage of ['before load','delay','idle','fallback timer','import']) {
  test(`destroy during ${stage} settles cancellation and prevents a late installation`,async()=>{
    const f=fixture({complete:stage!=='before load',idle:stage!=='fallback timer'}),scheduled=f.install();
    if(stage==='idle'||stage==='import'){f.advance(1000);if(stage==='import')f.idle();}
    else if(stage==='fallback timer')f.nextTimer();
    else if(stage==='delay')f.advance(500);
    scheduled.destroy();scheduled.destroy();assert.equal(await scheduled.ready,null);
    const importsBefore=f.calls.imports;
    f.load();f.visibility(false);f.advance(10000);
    if(stage==='import'){f.resolveImport();await settle();}
    assert.equal(f.calls.imports,importsBefore);assert.equal(f.calls.installs,0);assert.equal(f.calls.destroys,0);f.assertClean();
  });
}

test('an initially hidden page does no work until it is visible and passes a fresh delay/idle gate',async()=>{
  const f=fixture({hidden:true}),scheduled=f.install();
  f.load();f.advance(10000);assert.equal(f.calls.timers,0);assert.equal(f.calls.imports,0);
  f.visibility(false);f.advance(999);assert.equal(f.calls.imports,0);
  f.advance(1);f.idle();f.resolveImport();await scheduled.ready;
  scheduled.destroy();f.assertClean();
});

for(const stage of ['delay','idle']) {
  test(`hiding during ${stage} cancels scheduled work until a fresh visible gate`,async()=>{
    const f=fixture({complete:true}),scheduled=f.install();
    f.advance(stage==='idle'?1000:500);f.visibility(true);
    assert.equal(f.pending().timers+f.pending().idles,0);
    f.advance(10000);assert.equal(f.calls.imports,0);
    f.visibility(false);f.advance(999);assert.equal(f.calls.imports,0);
    f.advance(1);f.idle();f.resolveImport();await scheduled.ready;
    scheduled.destroy();f.assertClean();
  });
}

test('a bootstrap that finishes in a hidden tab waits for visibility without downloading twice',async()=>{
  const f=fixture({complete:true}),scheduled=f.install();let settled=false;
  void scheduled.ready.then(()=>{settled=true;});
  f.advance(1000);f.idle();f.visibility(true);f.resolveImport();await settle();
  assert.equal(f.calls.installs,0);assert.equal(settled,false);assert.equal(f.pending().timers+f.pending().idles,0);
  f.visibility(false);f.advance(1000);assert.equal(f.calls.installs,0);f.idle();
  assert.equal(await scheduled.ready,f.installation);assert.equal(f.calls.imports,1);
  scheduled.destroy();f.assertClean();
});

test('visibility restored during an in-flight import still requires its fresh delay and idle gate',async()=>{
  const f=fixture({complete:true}),scheduled=f.install();
  f.advance(1000);f.idle();f.visibility(true);f.visibility(false);
  f.resolveImport();await settle();assert.equal(f.calls.installs,0);
  f.advance(1000);assert.equal(f.calls.installs,0);f.idle();await scheduled.ready;
  assert.equal(f.calls.imports,1);assert.equal(f.calls.installs,1);
  scheduled.destroy();f.assertClean();
});

for(const stage of ['before import','during import']) {
  test(`a caller host detached ${stage} cancels instead of mounting on a removed page`,async()=>{
    const f=fixture({complete:true}),host={ownerDocument:f.doc,isConnected:true},scheduled=f.install({host});
    if(stage==='during import'){f.advance(1000);f.idle();}
    host.isConnected=false;
    if(stage==='before import')f.advance(1000);else f.resolveImport();
    assert.equal(await scheduled.ready,null);assert.equal(f.calls.installs,0);f.assertClean();
  });
}

test('a host owner document controls scheduling and all installation options pass through',async()=>{
  const f=fixture({complete:true}),host={ownerDocument:f.doc,isConnected:true};
  f.setGlobalDocument({get defaultView(){throw new Error('Global document must not win over the host.');}});
  const onState=()=>{},onEvent=()=>{},onError=()=>{};
  const options={host,targetSelector:'#cta',textSelector:'.copy',surfaceSelector:'.surface',triggerSelector:'#copyright',keyboard:false,storageKey:'custom',reducedMotion:true,onState,onEvent,onError};
  const scheduled=f.installRaw(options);
  f.advance(1000);f.idle();f.resolveImport();await scheduled.ready;
  assert.equal(f.options().document,f.doc);
  for(const [key,value] of Object.entries(options))assert.equal(f.options()[key],value,key);
  scheduled.destroy();f.assertClean();
});

test('a bootstrap import failure rejects ready, cleans scheduling, and does not duplicate onError',async()=>{
  const f=fixture({complete:true});let reported=0;
  const scheduled=f.install({onError(){reported++;}}),error=new Error('Bootstrap failed.');
  f.advance(1000);f.idle();
  const rejection=assert.rejects(scheduled.ready,candidate=>candidate===error);
  f.rejectImport(error);await rejection;
  assert.equal(f.calls.installs,0);assert.equal(reported,0);f.assertClean();
  scheduled.destroy();assert.equal(f.calls.destroys,0);
});

test('a late import failure after cancellation does not change its null result',async()=>{
  const f=fixture({complete:true}),scheduled=f.install(),error=new Error('Cancelled download failed.');
  f.advance(1000);f.idle();scheduled.destroy();f.rejectImport(error);
  assert.equal(await scheduled.ready,null);await settle();
  assert.equal(f.calls.installs,0);f.assertClean();
});

test('an installer failure also rejects ready and releases the scheduler',async()=>{
  const error=new Error('Installer failed.'),f=fixture({complete:true,installError:error}),scheduled=f.install();
  f.advance(1000);f.idle();
  const rejection=assert.rejects(scheduled.ready,candidate=>candidate===error);
  f.resolveImport();await rejection;assert.equal(f.calls.installs,1);f.assertClean();
});
