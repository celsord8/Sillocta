import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
const classes=()=>{const values=new Set();return {contains:key=>values.has(key),toggle(key,on){if(on)values.add(key);else values.delete(key);}};};

test('Mobile checkout freezes the background once and restores the original page position',()=>{
 const panels=new Map(['cart-drawer','mobile-menu-drawer','footer-info-overlay'].map(id=>[id,{classList:classes()}]));
 const scrolls=[],body={style:{position:'',top:'',width:'',overflow:''},classList:classes()};
 const context={byId:id=>panels.get(id),document:{body,documentElement:{classList:classes()},hidden:false},window:{scrollX:0,scrollY:724,matchMedia:()=>({matches:true}),scrollTo:value=>scrolls.push(value)}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('let checkoutPageLock=null;'),source.indexOf('function setPanel(')),context);
 panels.get('cart-drawer').classList.toggle('open',true);context.lockPage();
 assert.equal(body.style.position,'fixed');assert.equal(body.style.top,'-724px');
 context.window.scrollY=0;context.lockPage();
 panels.get('cart-drawer').classList.toggle('open',false);context.lockPage();
 assert.equal(body.style.position,'');assert.equal(body.style.top,'');assert.equal(body.style.width,'');
 assert.equal(scrolls.length,1);assert.equal(scrolls[0].top,724);
 assert.equal(body.style.overflow,'');
});

test('Checkout covers fractional visual viewport edges and resizes for the keyboard',()=>{
 const properties=new Map(),drawer={classList:classes(),style:{setProperty:(key,value)=>properties.set(key,value)}};
 const context={byId:()=>drawer,window:{visualViewport:{height:642.35,offsetTop:12.8}}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function syncCheckoutViewport(){'),source.indexOf("window.visualViewport?.addEventListener('resize'")),context);
 context.syncCheckoutViewport();assert.equal(properties.size,0);
 drawer.classList.toggle('open',true);context.syncCheckoutViewport();
 assert.equal(properties.get('--sl-checkout-top'),'12px');assert.equal(properties.get('--sl-checkout-height'),'644px');
 context.window.visualViewport={height:310.2,offsetTop:114.3};context.syncCheckoutViewport();
 assert.equal(properties.get('--sl-checkout-top'),'114px');assert.equal(properties.get('--sl-checkout-height'),'311px');
});
