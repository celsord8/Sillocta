import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../source/checkout-orders.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({pendingMount=false,stored={}}={}){
  const nodes=new Map(),storage=new Map(Object.entries(stored)),mounts=[],unmounts=[],requests=[];
  const node=id=>{const value={id,innerHTML:'',textContent:'',hidden:false,disabled:false,isConnected:true,handlers:{},addEventListener(k,f){this.handlers[k]=f;},focus(){},select(){},querySelector(){return node('child');}};nodes.set(id,value);return value;};
  for(const id of ['sillocta-payment-form','sillocta-payment-result','checkout-finalize-btn','checkout-error'])node(id);
  let selected='cartao',resolveMount;
  const document={head:{appendChild(){}},querySelectorAll:()=>[],createElement:()=>node('script')};
  const paymentFlow={enabled:true,quote:{quoteId:'signed',expiresAt:Date.now()+600000,totalCents:14040}};
  const context=vm.createContext({document,location:{protocol:'https:'},paymentFlow,cart:[],AbortSignal,crypto:{randomUUID:()=> '8ce88571-e73b-4cc2-bd48-7f347b95565c'},setTimeout:()=>1,clearTimeout(){},byId:id=>nodes.get(id),renderCart(){},closeCart(){},selectCheckoutPayment(mode){selected=mode;context._checkout.pagamento=mode;},brl:n=>'R$ '+(n/100).toFixed(2),escapeHtml:value=>String(value),getTotals:()=>({total:1}),setCheckoutFieldError(){},paymentCartData:()=>({items:[{pid:1,volume:'5',quantity:1}],gift:true,coupon:'BEMVINDO10'}),syncPaymentShipping(){},loadPaymentShipping(){},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{requests.push({url,options});return Response.json({enabled:false});},Response,console});
  context.window=context;context.addEventListener=()=>{};context._checkout={pagamento:selected,cep:'06233903'};
  context.MercadoPago=class {bricks(){return {create:async(type,id,options)=>{mounts.push({type,id,options});if(pendingMount)await new Promise(r=>resolveMount=r);return {unmount:async()=>unmounts.push(id)};}};}};
  Object.defineProperty(nodes.get('sillocta-payment-form'),'innerHTML',{set(value){this.html=value;if(value.includes('sillocta-card-payment'))node('sillocta-card-payment');},get(){return this.html;}});
  vm.runInContext(code,context);
  return {context,nodes,storage,mounts,unmounts,requests,finishMount:()=>resolveMount?.()};
}
test('Card Brick takes the authoritative server amount; switching away unmounts its controller',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();await tick();assert.equal(h.mounts.length,1);assert.equal(h.mounts[0].type,'cardPayment');assert.equal(h.mounts[0].options.initialization.amount,140.40);assert.equal(h.nodes.get('checkout-finalize-btn').hidden,true);
  h.context.selectCheckoutPayment('pix');await tick();assert.equal(h.unmounts.length,1);assert.equal(h.nodes.get('checkout-finalize-btn').hidden,false);assert.ok(h.nodes.get('sillocta-payment-form').innerHTML.includes('QR Code'));
});
test('A late asynchronous card mount is removed after selecting a different payment method',async()=>{
  const h=harness({pendingMount:true});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,1);h.context.selectCheckoutPayment('pix');h.finishMount();await tick();assert.equal(h.unmounts.length,1);
});
test('Reload after an uncertain submission blocks a new card or Pix request',async()=>{
  const h=harness({stored:{'sillocta-orders-test-uncertain':'1'}});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,0);h.context.selectCheckoutPayment('pix');assert.equal(h.nodes.get('checkout-finalize-btn').disabled,true);await h.context.submitOnlineOrder();assert.ok(h.nodes.get('checkout-error').textContent.includes('já foi enviado'));assert.equal(h.requests.filter(r=>r.url.endsWith('/order')).length,0);
});
