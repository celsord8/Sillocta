import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../source/checkout-orders.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({pendingMount=false,stored={}}={}){
  const nodes=new Map(),storage=new Map(Object.entries(stored)),mounts=[],unmounts=[],requests=[],timers=new Map();let timerId=0;
  const node=id=>{const value={id,textContent:'',hidden:false,disabled:false,isConnected:true,handlers:{},addEventListener(k,f){this.handlers[k]=f;},focus(){},select(){},querySelector(){return node('child');}};Object.defineProperty(value,'innerHTML',{set(html){this.html=html;for(const match of html.matchAll(/id="([^"]+)"/g))node(match[1]);},get(){return this.html||'';}});nodes.set(id,value);return value;};
  for(const id of ['sillocta-payment-form','sillocta-payment-result','checkout-finalize-btn','checkout-error'])node(id);
  let selected='cartao',resolveMount;
  const document={head:{appendChild(){}},querySelectorAll:()=>[],createElement:()=>node('script')};
  const paymentFlow={enabled:true,quote:{quoteId:'signed',expiresAt:Date.now()+600000,totalCents:14040}};
  const context=vm.createContext({document,location:{protocol:'https:'},paymentFlow,cart:[],AbortSignal,crypto:{randomUUID:()=> '8ce88571-e73b-4cc2-bd48-7f347b95565c'},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),byId:id=>nodes.get(id),renderCart(){},closeCart(){},selectCheckoutPayment(mode){selected=mode;context._checkout.pagamento=mode;},brl:n=>'R$ '+(n/100).toFixed(2),escapeHtml:value=>String(value),getTotals:()=>({total:1}),setCheckoutFieldError(){},paymentCartData:()=>({items:[{pid:1,volume:'5',quantity:1}],gift:true,coupon:'BEMVINDO10'}),syncPaymentShipping(){},loadPaymentShipping(){},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{requests.push({url,options});return Response.json({enabled:false});},Response,console});
  context.window=context;context.addEventListener=()=>{};context._checkout={pagamento:selected,cep:'06233903'};
  context.MercadoPago=class {bricks(){return {create:async(type,id,options)=>{mounts.push({type,id,options});if(pendingMount)await new Promise(r=>resolveMount=r);return {unmount:async()=>unmounts.push(id)};}};}};
  vm.runInContext(code,context);
  return {context,nodes,storage,mounts,unmounts,requests,timers,finishMount:()=>resolveMount?.()};
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
test('Selecting a card without a valid total shows an instruction instead of an empty form',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.paymentFlow.quote=null;h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,0);assert.match(h.nodes.get('sillocta-card-payment').innerHTML,/Informe o CEP.*Atualizar total/);
});
test('A pending test keeps its payment method and can be archived before starting a card test',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;
  const result={state:'pending',method:'pix',receipt:'signed-old-receipt',orderId:'ORDTST-existing',totalCents:14040,qrCode:'PIXTEST'};
  h.context.fetch=async()=>Response.json(result);
  h.context.selectCheckoutPayment('pix');await h.context.submitOnlineOrder();
  h.context.selectCheckoutPayment('cartao');assert.equal(h.context._checkout.pagamento,'pix');assert.equal(h.mounts.length,0);assert.match(h.nodes.get('sillocta-payment-form').innerHTML,/pedido de Pix/);
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Iniciar outro teste/);
  h.nodes.get('sillocta-new-test').handlers.click();
  assert.equal(h.storage.get('sillocta-orders-test-receipt'),undefined);assert.equal(JSON.parse(h.storage.get('sillocta-orders-test-history'))[0].receipt,result.receipt);
  h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,1);assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Consultar ORDTST-existing/);
  await h.nodes.get('sillocta-previous-0').handlers.click();await tick();assert.equal(h.context._checkout.pagamento,'pix');assert.equal(h.storage.get('sillocta-orders-test-receipt'),result.receipt);assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Aguardando pagamento/);
});
test('A delayed status response cannot replace a new test with an archived pending order',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;
  const result={state:'pending',method:'pix',receipt:'signed-old-receipt',orderId:'ORDTST-existing',totalCents:14040};
  h.context.fetch=async()=>Response.json(result);h.context.selectCheckoutPayment('pix');await h.context.submitOnlineOrder();
  let finishStatus;h.context.fetch=()=>new Promise(resolve=>finishStatus=()=>resolve(Response.json(result)));
  const refresh=h.nodes.get('sillocta-refresh').handlers.click();h.nodes.get('sillocta-new-test').handlers.click();h.context.selectCheckoutPayment('cartao');finishStatus();await refresh;await tick();
  assert.equal(h.context._checkout.pagamento,'cartao');assert.equal(h.storage.get('sillocta-orders-test-receipt'),undefined);assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/Aguardando pagamento/);
});
test('A card initialization timeout offers a retry and unmounts a controller that arrives late',async()=>{
  const h=harness({pendingMount:true});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  const timeout=[...h.timers.values()].find(t=>t.ms===20000);assert.ok(timeout);timeout.fn();await tick();assert.match(h.nodes.get('sillocta-card-payment').innerHTML,/demorou a carregar/);assert.ok(h.nodes.get('sillocta-card-retry'));
  h.finishMount();await tick();assert.equal(h.unmounts.length,1);
});
test('Starting another test fails closed when the previous receipt cannot be saved',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;const result={state:'pending',method:'pix',receipt:'signed-old-receipt',orderId:'ORDTST-existing',totalCents:14040};h.context.fetch=async()=>Response.json(result);h.context.selectCheckoutPayment('pix');await h.context.submitOnlineOrder();
  h.context.sessionStorage.setItem=()=>{throw Error('storage unavailable');};h.nodes.get('sillocta-new-test').handlers.click();assert.equal(h.storage.get('sillocta-orders-test-receipt'),result.receipt);assert.match(h.nodes.get('checkout-error').textContent,/Não foi possível guardar/);h.context.selectCheckoutPayment('cartao');assert.equal(h.context._checkout.pagamento,'pix');
});
test('An SDK initialization failure returning no controller shows a visible retry',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.MercadoPago=class {bricks(){return {create:async()=>undefined};}};h.context.selectCheckoutPayment('cartao');await tick();assert.match(h.nodes.get('sillocta-card-payment').innerHTML,/Não foi possível inicializar/);assert.ok(h.nodes.get('sillocta-card-retry'));
});
test('Repeated card selection waits for the previous initialization to finish before creating another Brick',async()=>{
  const h=harness({pendingMount:true});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,1);h.finishMount();await tick();assert.equal(h.unmounts.length,1);assert.equal(h.mounts.length,2);h.finishMount();await tick();
});
