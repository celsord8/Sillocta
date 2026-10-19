import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {measurementMetadata} from '../scripts/measurement.mjs';
const code=readFileSync(new URL(process.env.SILLOCTA_TEST_BUNDLES?'../public/measurement.js':'../source/measurement.js',import.meta.url),'utf8');
function harness({privacy={},storage=new Map(),collector,gaId='',vercel=true}={}){
 const scripts=[],timers=[];
 const context=vm.createContext({navigator:privacy,location:{origin:'https://shop.example',pathname:'/perfume/creed-aventus'},URL,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},document:{title:'Aventus | Sillocta',referrer:'https://referrer.example/?private=value#secret',querySelector:selector=>({getAttribute:()=>selector.includes('ga4')?gaId:String(vercel)}),getElementById:()=>null,createElement:()=>({}),head:{appendChild:script=>scripts.push(script)}},setTimeout:fn=>timers.push(fn)});
 context.window=context;if(collector)context.va=collector;vm.runInContext(code,context);
 return {metrics:context.SilloctaMetrics,context,scripts,timers,storage,events:()=>Array.from(context.vaq||[]).filter(([name])=>name==='event').map(([,data])=>JSON.parse(JSON.stringify(data)))};
}
test('Funnel stages deduplicate views and checkout selections without counting an empty bag',()=>{
 const h=harness();h.metrics.viewProduct({id:1,email:'private@example.com'});h.metrics.viewProduct({id:1});h.metrics.addItem(1,'10',2);h.metrics.checkout([]);
 const items=[{pid:1,vol:'10ML',qty:2,nome:'Private name'}];h.metrics.checkout(items);h.metrics.checkout(items);h.metrics.checkout([{...items[0],qty:3}]);
 assert.deepEqual(h.events().map(e=>e.name),['view_item','add_to_cart','view_cart','begin_checkout','view_cart','begin_checkout']);
 assert.deepEqual(h.events()[1].data,{product_id:1,volume_ml:10,quantity:2});assert.equal(JSON.stringify(h.events()).includes('Private'),false);
});
test('Only explicit approved API results count a purchase, with sandbox events isolated and no duplicate on reload',()=>{
 const h=harness();const pending={orderId:'ORD123',method:'pix',state:'pending',sandbox:true,totalCents:14500,receipt:'signed-private-receipt',customer:{email:'secret@example.com'}};
 h.metrics.paymentResult(pending);h.metrics.paymentResult(pending);h.metrics.paymentResult({...pending,state:'approved'});h.metrics.paymentResult({...pending,state:'approved'});
 assert.deepEqual(h.events().map(e=>e.name),['test_payment_created','test_payment_approved']);
 const again=harness({storage:h.storage});again.metrics.paymentResult({...pending,state:'approved'});assert.equal(again.events().length,0);
 again.metrics.paymentResult({...pending,orderId:'ORD456',sandbox:false,state:'approved'});
 assert.deepEqual(again.events().map(e=>e.name),['payment_created','payment_approved']);
 assert.deepEqual(again.events()[1].data,{payment_method:'pix',total_cents:14500,currency:'BRL'});
 assert.doesNotMatch(JSON.stringify(h.events()),/ORD123|receipt|secret@example/);
});
test('Pending, rejected, missing-mode and malformed responses never produce a false approval',()=>{
 const h=harness(),base={orderId:'ORD789',method:'boleto',totalCents:10000};
 for(const result of [{...base,state:'approved'},{...base,sandbox:true,state:'rejected'},{...base,sandbox:'true',state:'approved'},{...base,sandbox:false,state:'approved',totalCents:-1}])h.metrics.paymentResult(result);
 assert.equal(h.events().length,0);h.metrics.paymentResult({...base,sandbox:false,state:'pending'});assert.deepEqual(h.events().map(e=>e.name),['payment_created']);
});
test('Privacy signals disable all event collection and scripts; URL queries and hashes are redacted',()=>{
 for(const privacy of [{doNotTrack:'1'},{globalPrivacyControl:true}]){
  const h=harness({privacy});h.metrics.viewProduct({id:1});h.metrics.addItem(1,'5',1);h.metrics.checkout([{pid:1,vol:'5ML',qty:1}]);assert.equal(h.events().length,0);assert.equal(h.timers.length,0);
 }
 const h=harness();const before=Array.from(h.context.vaq).find(([name])=>name==='beforeSend')[1];
 assert.equal(before({url:'https://shop.example/?email=private#receipt'}).url,'https://shop.example/');h.timers[0]();assert.equal(h.scripts.length,2);
 h.context.navigator.globalPrivacyControl=true;assert.equal(before({url:'https://shop.example/'}),null);h.metrics.addItem(1,'5',1);assert.equal(h.events().length,0);
});
test('Unavailable storage and a failing collector do not prevent shopping',()=>{
 const h=harness({collector:()=>{throw Error('collector failed');}});
 assert.doesNotThrow(()=>h.metrics.addItem(1,'5',1));
 const blocked=harness();blocked.context.sessionStorage.getItem=()=>{throw Error('storage blocked');};blocked.context.sessionStorage.setItem=()=>{throw Error('storage blocked');};
 assert.doesNotThrow(()=>{blocked.metrics.viewProduct({id:1});blocked.metrics.viewProduct({id:1});});assert.equal(blocked.events().length,1);
});

test('A missing destination leaves the funnel inactive and never requests a paid custom event',()=>{
 const h=harness({vercel:false});h.metrics.viewProduct({id:1});h.metrics.addItem(1,'5',1);assert.equal(h.events().length,0);h.timers[0]();assert.equal(h.scripts.length,2);
});
test('GA4 is opt-in, loads after the first render, and sends safe parameters with denied storage',()=>{
 const h=harness({vercel:false,gaId:'G-TEST1234'});h.metrics.viewProduct({id:1});h.metrics.addItem(1,'5',2);
 const queue=Array.from(h.context.dataLayer).map(entry=>Array.from(entry));
 assert.equal(queue[0][0],'consent');assert.equal(queue[0][2].analytics_storage,'denied');
 assert.equal(h.events().length,0);assert.equal(h.scripts.length,0);h.timers[0]();assert.equal(h.scripts.length,3);
 const add=queue.find(entry=>entry[0]==='event'&&entry[1]==='add_to_cart');assert.equal(add[2].send_to,'G-TEST1234');assert.equal(add[2].items[0].quantity,2);assert.equal(add[2].page_referrer,'https://referrer.example/');assert.doesNotMatch(JSON.stringify(queue),/private=value|#secret/);
});
test('Preview builds exclude production collection IDs and invalid IDs cannot enter HTML',()=>{
 assert.equal(measurementMetadata({VERCEL_ENV:'preview',PUBLIC_GA4_MEASUREMENT_ID:'G-TEST1234'}),'');
 assert.match(measurementMetadata({VERCEL_ENV:'production',PUBLIC_GA4_MEASUREMENT_ID:'G-TEST1234'}),/G-TEST1234/);
 assert.equal(measurementMetadata({VERCEL_ENV:'production'}),'');
 assert.throws(()=>measurementMetadata({PUBLIC_GA4_MEASUREMENT_ID:'<script>unsafe</script>'}));
});
