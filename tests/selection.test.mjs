import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import PRODUCTS from '../source/products.json' with {type:'json'};

function selectionHarness(product=PRODUCTS[0]){
  const nodes=new Map(),store=new Map(),timers=[],classes=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
  const node=(id,extra={})=>{const el={id,textContent:'',dataset:{},classList:classes(),style:{},disabled:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},focus(){document.activeElement=this;},...extra};nodes.set(id,el);return el;};
  const volumes=['5','10'].map(v=>node('volume-'+v,{dataset:{productVolume:v}}));
  const label={textContent:'Adicionar à sacola'};
  node('product-page',{dataset:{productId:String(product.id),volume:'5'},querySelectorAll:()=>volumes});
  node('product-price');node('product-old-price');node('product-total');node('product-quantity',{textContent:'1'});
  node('product-minus',{disabled:true});node('product-plus');node('product-add',{isConnected:true,querySelector:()=>label});
  node('cc',{textContent:'0'});node('sl-toast',{contains:()=>false});
  const document={getElementById:id=>id==='sillocta-products'?{textContent:JSON.stringify(PRODUCTS)}:nodes.get(id)||null,querySelector:()=>null,body:{classList:classes(),hasAttribute:()=>false},activeElement:null};
  const window={location:{protocol:'https:'},matchMedia:()=>({matches:true})};
  const context=vm.createContext({document,window,Intl,URL,console,localStorage:{setItem:(k,v)=>store.set(k,v)},requestAnimationFrame:f=>f(),setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){}});
  const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
  const core=source.slice(0,source.indexOf('\n\n(function(){'));
  const detail=source.slice(source.indexOf('// Perfume detail pages'),source.indexOf('// Accessibility and animation lifecycle'));
  vm.runInContext(core+'\n'+detail+'\nrenderCart=function(){};',context);
  return {nodes,store,label,context,document,volumes,timers,run:code=>vm.runInContext(code,context)};
}

test('Detail selection updates prices and totals, then adds the selected variant to the established bag',()=>{
  const h=selectionHarness();h.run("selectProductVolume(byId('volume-10'))");
  assert.equal(h.nodes.get('product-page').dataset.volume,'10');assert.equal(h.volumes[1].attributes['aria-pressed'],'true');
  h.run('changeProductQuantity(1);changeProductQuantity(1)');
  assert.equal(h.nodes.get('product-quantity').textContent,3);
  assert.equal(h.nodes.get('product-price').textContent, new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(245));
  assert.equal(h.nodes.get('product-total').textContent,new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(735));
  h.run("addProductToBag(byId('product-add'))");
  const saved=JSON.parse(h.store.get('sillocta-original-bag-v1'));assert.deepEqual(saved.items,[{pid:1,vol:'10ML',qty:3}]);
  assert.equal(h.nodes.get('cc').textContent,3);assert.ok(h.nodes.get('sl-toast').innerHTML.includes('Ver sacola'));
  h.run("addProductToBag(byId('product-add'))");assert.equal(JSON.parse(h.store.get('sillocta-original-bag-v1')).items[0].qty,3);
  h.timers.at(-1)(); // toast timer is harmless; run the feedback reset explicitly below.
  for(const timer of h.timers)timer();assert.equal(h.nodes.get('product-add').disabled,false);assert.equal(h.label.textContent,'Adicionar à sacola');
});

test('Quantity limits and unavailable products cannot create invalid bag items',()=>{
  const h=selectionHarness();h.run('changeProductQuantity(-1)');assert.equal(Number(h.nodes.get('product-quantity').textContent),1);
  h.nodes.get('product-quantity').textContent='99';h.run('changeProductQuantity(1)');assert.equal(Number(h.nodes.get('product-quantity').textContent),99);assert.equal(h.nodes.get('product-plus').disabled,true);
  h.run("addItem(1,'5',98);addProductToBag(byId('product-add'))");assert.equal(JSON.parse(h.store.get('sillocta-original-bag-v1')).items[0].qty,99);
  const unavailable=selectionHarness(PRODUCTS.find(p=>p.id===13));unavailable.run("selectProductVolume(byId('volume-10'));addProductToBag(byId('product-add'))");
  assert.equal(unavailable.store.size,0);assert.equal(unavailable.nodes.get('product-page').dataset.volume,'5');
});
