import test from 'node:test';
import assert from 'node:assert/strict';
import {createBitHighlights} from '../src/bit-highlights.js';
test('native bit ranges repair Unicode offsets after writes and release only owned paint',()=>{
 const registry=new Map(),styles=[];
 class Highlight extends Set {}
 const doc={defaultView:{CSS:{highlights:registry},Highlight},head:{append:el=>styles.push(el)},createElement:()=>({remove(){styles.splice(styles.indexOf(this),1);}}),createRange:()=>({setStart(node,offset){this.node=node;this.start=offset;},setEnd(node,offset){this.end=offset;}})};
 const paint=createBitHighlights(doc),node={nodeValue:'𝕏0'};
 const record={node,offsets:[0,2],glyphs:[{index:0,eaten:false},{index:1,eaten:true}]};
 paint.update(record);
 const name=[...registry.keys()][0],highlight=registry.get(name),range=[...highlight][0];
 assert.equal(range.start,2);assert.equal(node.nodeValue,'𝕏0');
 node.nodeValue='10';record.offsets=[0,1];record.glyphs[0].eaten=true;paint.update(record);
 assert.equal(range.start,1);assert.equal(range.end,2);assert.equal(highlight.size,2);
 assert.equal(styles.length,1);paint.update(record);assert.equal(highlight.size,2);
 const other=new Highlight();registry.set(name,other);node.nodeValue='host edit';paint.destroy();
 assert.equal(registry.get(name),other);assert.equal(node.nodeValue,'host edit');assert.equal(styles.length,0);
 paint.destroy();
});
test('unsupported highlights are a zero-work native text fallback',()=>{
 const paint=createBitHighlights({defaultView:{}});paint.update({});paint.destroy();
});
