import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileZoomLock} from '../shared/zoom-lock.ts';
function fixture(computed='auto',mobile=true){
 const values=new Map();const style={getPropertyValue:k=>values.get(k)?.[0]||'',getPropertyPriority:k=>values.get(k)?.[1]||'',setProperty:(k,v,p='')=>values.set(k,[v,p]),removeProperty:k=>values.delete(k)};
 const doc=new EventTarget();doc.documentElement={style,hasAttribute:()=>false,getAttribute:()=>values.size?'touch-action:value':'',removeAttribute(){}};
 doc.defaultView={matchMedia:()=>({matches:mobile}),getComputedStyle:()=>({touchAction:computed})};return{doc,style};
}
test('zoom lock preserves scrolling and restores styles/listeners on pause',()=>{
 const {doc,style}=fixture();const lock=createMobileZoomLock(doc);lock.setActive(true);
 assert.equal(style.getPropertyValue('touch-action'),'pan-x pan-y');assert.equal(style.getPropertyPriority('touch-action'),'important');
 const gesture=new Event('gesturestart',{cancelable:true});doc.dispatchEvent(gesture);assert.equal(gesture.defaultPrevented,true);
 lock.setActive(false);assert.equal(style.getPropertyValue('touch-action'),'');
 const released=new Event('gesturestart',{cancelable:true});doc.dispatchEvent(released);assert.equal(released.defaultPrevented,false);
 lock.setActive(true);lock.setActive(false);assert.equal(style.getPropertyValue('touch-action'),'');
});
test('host restrictions and newer host writes remain authoritative',()=>{
 const {doc,style}=fixture('pan-y pinch-zoom');style.setProperty('touch-action','pan-y pinch-zoom');
 const lock=createMobileZoomLock(doc);lock.setActive(true);assert.equal(style.getPropertyValue('touch-action'),'pan-y');lock.setActive(false);assert.equal(style.getPropertyValue('touch-action'),'pan-y pinch-zoom');
 lock.setActive(true);style.setProperty('touch-action','none');lock.setActive(false);assert.equal(style.getPropertyValue('touch-action'),'none');
});
test('desktop and explicit opt-out do not change zoom policy',()=>{
 for(const [mobile,enabled]of [[false,true],[true,false]]){const {doc,style}=fixture('auto',mobile);createMobileZoomLock(doc,enabled).setActive(true);assert.equal(style.getPropertyValue('touch-action'),'');}
});
