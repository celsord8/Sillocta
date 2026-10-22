import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../source/product-pages.js';
import PRODUCTS from '../source/products.json' with {type:'json'};

const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
const deliveryCode=source.slice(source.indexOf('function productDeliverySelection('),source.indexOf('function selectProductVolume('));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(api){
  const nodes=new Map(),timers=new Map(),requests=[];let nextTimer=0;
  for(const id of ['product-page','product-quantity','product-delivery','product-delivery-cep','product-delivery-result','product-delivery-status','product-delivery-note','product-delivery-submit'])nodes.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}});
  nodes.get('product-page').dataset={volume:'5'};nodes.get('product-quantity').textContent='1';nodes.get('product-delivery-cep').value='61760-046';
  const context=vm.createContext({Date,Number,Array,JSON,AbortController,byId:id=>nodes.get(id),currentProduct:()=>PRODUCTS[1],paymentFlow:{enabled:true},paymentApi:async(path,options)=>{requests.push({path,options});return api(path,options);},brl:n=>'R$ '+(n/100).toFixed(2),escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),maskCEP:s=>s.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2'),setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(source.match(/const productDelivery=.+;/)[0]+'\n'+deliveryCode,context);
  return {context,nodes,timers,requests,query:()=>context.consultProductDelivery()};
}
const quote=(patch={})=>({expiresAt:Date.now()+600000,totalCents:16500,shippingSimulation:false,options:[{id:'express',name:'Entrega expressa',priceCents:2500,daysRange:[1,3]},{id:'standard',name:'Entrega padrão',priceCents:1500,daysRange:[4,6]}],...patch});

test('Delivery consults only the selected perfume, volume and quantity without applying bag extras',async()=>{
  const h=harness(async()=>quote());h.nodes.get('product-page').dataset.volume='10';h.nodes.get('product-quantity').textContent='2';await h.query();
  assert.deepEqual(JSON.parse(h.requests[0].options.body),{items:[{pid:2,volume:'10',quantity:2}],cep:'61760046',coupon:'',gift:false});
  assert.match(h.nodes.get('product-delivery-result').innerHTML,/R\$ 180.00/);assert.match(h.nodes.get('product-delivery-result').innerHTML,/4 a 6 dias úteis após a postagem/);
  h.context.selectProductDelivery('express');assert.match(h.nodes.get('product-delivery-result').innerHTML,/R\$ 190.00/);
});
test('Malformed CEP and demonstration shipping never produce an apparent real estimate',async()=>{
  const h=harness(async()=>quote({shippingSimulation:true}));
  for(const cep of ['123','00000-000']){h.nodes.get('product-delivery-cep').value=cep;await h.query();}
  assert.equal(h.requests.length,0);h.nodes.get('product-delivery-cep').value='61760046';await h.query();assert.equal(h.nodes.get('product-delivery-result').hidden,true);assert.match(h.nodes.get('product-delivery-status').textContent,/indisponível/);
});
test('Changing volume clears stale totals immediately and only the new asynchronous quote is rendered',async()=>{
  const pending=[];const h=harness(()=>new Promise(resolve=>pending.push(resolve)));
  const first=h.query();h.nodes.get('product-page').dataset.volume='10';h.context.syncProductDeliverySelection();
  assert.equal(h.nodes.get('product-delivery-result').hidden,true);assert.equal(h.requests[0].options.signal.aborted,true);
  const second=h.query();pending[1](quote({totalCents:29500}));await second;pending[0](quote());await first;
  assert.match(h.nodes.get('product-delivery-result').innerHTML,/R\$ 310.00/);assert.doesNotMatch(h.nodes.get('product-delivery-result').innerHTML,/R\$ 180.00/);
});
test('Changed CEP, navigation and expired quotes cannot leave a usable old delivery result',async()=>{
  let resolve;const h=harness(()=>new Promise(done=>{resolve=done;}));const pending=h.query();
  h.nodes.get('product-delivery-cep').value='50000000';h.context.changeProductDeliveryCep(h.nodes.get('product-delivery-cep'));resolve(quote());await pending;assert.equal(h.nodes.get('product-delivery-result').hidden,true);
  h.context.paymentApi=async()=>quote({expiresAt:Date.now()-1});await h.query();assert.equal(h.nodes.get('product-delivery-result').hidden,true);
  h.context.paymentApi=async()=>quote();await h.query();const expiry=[...h.timers.values()].at(-1);expiry.fn();assert.equal(h.nodes.get('product-delivery-result').hidden,true);assert.match(h.nodes.get('product-delivery-status').textContent,/expirou/);
  const late=harness(()=>new Promise(done=>{resolve=done;}));const request=late.query();late.nodes.set('product-page',{dataset:{volume:'5'}});resolve(quote());await request;assert.equal(late.nodes.get('product-delivery-result').innerHTML,'');
});
test('Network failure unlocks retry; an eligible free delivery has no charge and is not labelled approved',async()=>{
  const h=harness(async()=>{throw Error('A conexão demorou. Tente novamente.');});await h.query();assert.equal(h.nodes.get('product-delivery-submit').disabled,false);assert.match(h.nodes.get('product-delivery-status').textContent,/conexão/);
  h.context.paymentApi=async()=>quote({totalCents:59000,options:[{id:'free',name:'Correios',priceCents:0,daysRange:[1,3]}]});await h.query();assert.match(h.nodes.get('product-delivery-result').innerHTML,/Grátis/);assert.match(h.nodes.get('product-delivery-result').innerHTML,/R\$ 590.00/);assert.doesNotMatch(h.nodes.get('product-delivery-result').innerHTML,/aprovado/);
});
test('Rapid quantity changes debounce into a single request with the final quantity',async()=>{
  const h=harness(async()=>quote());await h.query();
  for(const qty of [2,3,4]){h.nodes.get('product-quantity').textContent=String(qty);h.context.syncProductDeliverySelection();}
  const pending=[...h.timers.values()].filter(timer=>timer.ms===650);assert.equal(pending.length,1);pending[0].fn();await tick();
  assert.equal(h.requests.length,2);assert.equal(JSON.parse(h.requests[1].options.body).items[0].quantity,4);
});
test('Only available product pages expose the calculator and keep purchase actions unchanged',()=>{
  const available=globalThis.SilloctaProductPages.render(PRODUCTS[1]);assert.match(available,/id="product-delivery-cep"/);assert.match(available,/Adicionar à sacola/);assert.match(available,/Ver minha sacola/);
  assert.doesNotMatch(globalThis.SilloctaProductPages.render(PRODUCTS.find(p=>!p.available)),/id="product-delivery-cep"/);
});
