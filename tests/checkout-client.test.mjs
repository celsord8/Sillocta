import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../source/checkout-orders.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({pendingMount=false,stored={},cardController}={}){
  const nodes=new Map(),storage=new Map(Object.entries(stored)),mounts=[],unmounts=[],requests=[],timers=new Map();let timerId=0;
  const node=id=>{const value={id,textContent:'',hidden:false,disabled:false,isConnected:true,focusCount:0,handlers:{},addEventListener(k,f){this.handlers[k]=f;},remove(){this.isConnected=false;},focus(){this.focusCount++;},scrollIntoView(){},setAttribute(k,v){this.attributes[k]=v;},attributes:{},classList:{values:new Set(),contains(k){return this.values.has(k);},toggle(k,on){on?this.values.add(k):this.values.delete(k);}},select(){},querySelector(){return node('child');}};Object.defineProperty(value,'innerHTML',{set(html){this.html=html;for(const match of html.matchAll(/id="([^"]+)"/g))node(match[1]);},get(){return this.html||'';}});nodes.set(id,value);return value;};
  for(const id of ['sillocta-payment-form','sillocta-payment-result','checkout-finalize-btn','checkout-error','checkout-shipping-options','cart-drawer','cart-items'])node(id);
  let selected='cartao',resolveMount;
  const document={head:{appendChild(){}},querySelectorAll:()=>[],createElement:()=>node('script')};
  const paymentFlow={enabled:true,quote:{quoteId:'signed',expiresAt:Date.now()+600000,totalCents:14040}};
  const context=vm.createContext({document,location:{protocol:'https:'},paymentFlow,cart:[],AbortSignal,crypto:{randomUUID:()=> '8ce88571-e73b-4cc2-bd48-7f347b95565c'},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),byId:id=>nodes.get(id),renderCart(){context.selectCheckoutPayment(context._checkout.pagamento);},closeCart(){},selectCheckoutPayment(mode){selected=mode;context._checkout.pagamento=mode;},brl:n=>'R$ '+(n/100).toFixed(2),escapeHtml:value=>String(value),getTotals:()=>({total:1}),setCheckoutFieldError(){},paymentCartData:()=>({items:[{pid:1,volume:'5',quantity:1}],gift:true,coupon:'BEMVINDO10'}),syncPaymentShipping(){},loadPaymentShipping(){},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{requests.push({url,options});return Response.json({enabled:false});},Response,console});
  context.window=context;context.addEventListener=()=>{};context._checkout={pagamento:selected,cep:'06233903'};
  context.MercadoPago=class {bricks(){return {create:async(type,id,options)=>{mounts.push({type,id,options});if(pendingMount)await new Promise(r=>resolveMount=r);return cardController||{unmount:async()=>unmounts.push(id),getFormData:async()=>({token:'tokenized-fixture',payment_method_id:'master',installments:1,payer:{identification:{type:'CPF',number:'12345678909'}}}),getAdditionalData:()=>({paymentTypeId:'credit_card'})};}};}};
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
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.paymentFlow.quote=null;h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,0);assert.match(h.nodes.get('sillocta-card-payment').innerHTML,/Informe o CEP.*escolha a entrega/);
});
test('Starting a new order archives the pending receipt without displaying historical lookup buttons',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;
  const result={state:'pending',method:'pix',receipt:'signed-old-receipt',orderId:'ORDTST-existing',totalCents:14040,qrCode:'PIXTEST'};
  h.context.fetch=async()=>Response.json(result);
  h.context.selectCheckoutPayment('pix');await h.context.submitOnlineOrder();
  h.context.selectCheckoutPayment('cartao');assert.equal(h.context._checkout.pagamento,'pix');assert.equal(h.mounts.length,0);assert.match(h.nodes.get('sillocta-payment-form').innerHTML,/pedido de Pix/);
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Iniciar outro pedido/);
  h.nodes.get('sillocta-new-test').handlers.click();
  assert.equal(h.storage.get('sillocta-orders-test-receipt'),undefined);assert.equal(JSON.parse(h.storage.get('sillocta-orders-test-history'))[0].receipt,result.receipt);
  h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,1);assert.equal(h.nodes.get('sillocta-payment-result').innerHTML,'');assert.equal(h.nodes.has('sillocta-previous-0'),false);assert.equal(JSON.parse(h.storage.get('sillocta-orders-test-history'))[0].receipt,result.receipt);
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
test('Selecting the active card method preserves its existing initialization and form',async()=>{
  const h=harness({pendingMount:true});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,1);h.finishMount();await tick();assert.equal(h.unmounts.length,0);h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.length,1);h.context.selectCheckoutPayment('pix');await tick();assert.equal(h.unmounts.length,1);
});
test('Switching payment methods clears the previous error and keeps saved boleto data',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context._checkout.cpf='12345678909';h.context.selectCheckoutPayment('cartao');await tick();h.nodes.get('checkout-error').textContent='Card initialization failed';h.context.selectCheckoutPayment('pix');assert.equal(h.nodes.get('checkout-error').textContent,'');assert.match(h.nodes.get('checkout-finalize-btn').innerHTML,/Gerar Pix/);h.context.selectCheckoutPayment('boleto');assert.match(h.nodes.get('sillocta-payment-form').innerHTML,/12345678909/);assert.match(h.nodes.get('checkout-finalize-btn').innerHTML,/Gerar boleto/);h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.nodes.get('checkout-finalize-btn').hidden,true);
});
test('An invalid method cannot change the selected form or payment action',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('boleto');const form=h.nodes.get('sillocta-payment-form').innerHTML;h.context.selectCheckoutPayment('invalid');assert.equal(h.context._checkout.pagamento,'boleto');assert.equal(h.nodes.get('sillocta-payment-form').innerHTML,form);
});
test('Refreshing the same quote during card initialization does not restart the secure form',async()=>{
  const h=harness({pendingMount:true});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  h.context.renderPaymentShipping();h.context.renderPaymentShipping();h.finishMount();await tick();await tick();
  assert.equal(h.mounts.length,1);assert.equal(h.unmounts.length,0);
});
test('Invalidating the quote removes the live card form until a new total is ready',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  h.context.paymentFlow.quote=null;h.context.renderPaymentShipping();await tick();
  assert.equal(h.unmounts.length,1);assert.match(h.nodes.get('sillocta-card-payment').innerHTML,/Informe o CEP.*escolha a entrega/);
  h.context.paymentFlow.quote={quoteId:'updated',expiresAt:Date.now()+600000,totalCents:15990};h.context.renderPaymentShipping();await tick();
  assert.equal(h.mounts.length,2);assert.equal(h.mounts[1].options.initialization.amount,159.90);
});
test('A changed total waits for the earlier card initialization to unmount before creating another form',async()=>{
  const h=harness({pendingMount:true});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  h.context.paymentFlow.quote={quoteId:'changed',expiresAt:Date.now()+600000,totalCents:20000};h.context.renderPaymentShipping();await tick();
  assert.equal(h.mounts.length,1);h.finishMount();await tick();await tick();
  assert.equal(h.unmounts.length,1);assert.equal(h.mounts.length,2);assert.equal(h.mounts[1].options.initialization.amount,200);h.finishMount();await tick();
});
test('A failed SDK script is removed and retry loads a fresh script without retaining the old error',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;const sdk=h.context.MercadoPago;delete h.context.MercadoPago;
  h.context.selectCheckoutPayment('cartao');await tick();const failed=h.nodes.get('script');failed.onerror();await tick();
  assert.equal(failed.isConnected,false);assert.match(h.nodes.get('sillocta-card-payment').innerHTML,/Não foi possível carregar/);
  h.nodes.get('sillocta-card-retry').handlers.click();await tick();const fresh=h.nodes.get('script');assert.notEqual(fresh,failed);assert.equal(h.nodes.get('checkout-error').textContent,'');
  h.context.MercadoPago=sdk;fresh.onload();await tick();await tick();assert.equal(h.mounts.length,1);
});
test('The explicit card button waits for the SDK and sends only its tokenized payment data',async()=>{
  const h=harness({pendingMount:true});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  assert.equal(h.nodes.get('sillocta-card-submit').disabled,true);assert.equal(h.nodes.get('checkout-finalize-btn').hidden,true);
  h.finishMount();await tick();assert.equal(h.nodes.get('sillocta-card-submit').disabled,false);assert.match(h.nodes.get('sillocta-card-submit').innerHTML,/Pagar com cartão/);assert.equal(h.mounts[0].options.customization.visual.hidePaymentButton,true);
  let sent;h.context.fetch=async(url,options)=>{sent=JSON.parse(options.body);return Response.json({state:'approved',method:'cartao',receipt:'card-receipt',orderId:'ORDTST-card',totalCents:14040});};
  await h.nodes.get('sillocta-card-submit').onclick();assert.equal(sent.method,'cartao');assert.equal(sent.card.token,'tokenized-fixture');assert.equal(sent.card.type,'credit_card');assert.equal(sent.card.installments,1);assert.equal(sent.card.identification.number,'12345678909');assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Pagamento aprovado/);
});
test('Invalid card fields produce a visible error and never send an order',async()=>{
  const h=harness({cardController:{unmount:async()=>{},getFormData:async()=>{throw Error('sensitive card detail');},getAdditionalData:()=>({paymentTypeId:'credit_card'})}});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  await h.nodes.get('sillocta-card-submit').onclick();assert.match(h.nodes.get('sillocta-card-feedback').textContent,/Confira número, validade/);assert.doesNotMatch(h.nodes.get('checkout-error').textContent,/sensitive/);assert.equal(h.requests.filter(r=>r.url.endsWith('/order')).length,0);assert.equal(h.nodes.get('sillocta-card-submit').disabled,false);
});
test('A second card click cannot tokenize twice and a changed quote cannot send the old token',async()=>{
  let resolveData,calls=0;const h=harness({cardController:{unmount:async()=>{},getFormData:()=>{calls++;return new Promise(r=>resolveData=r);},getAdditionalData:()=>({paymentTypeId:'credit_card'})}});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  const first=h.nodes.get('sillocta-card-submit').onclick();await h.nodes.get('sillocta-card-submit').onclick();assert.equal(calls,1);assert.match(h.nodes.get('sillocta-card-submit').innerHTML,/Validando cartão/);h.context.selectCheckoutPayment('pix');assert.equal(h.context._checkout.pagamento,'cartao');
  h.context.paymentFlow.quote={quoteId:'changed',expiresAt:Date.now()+600000,totalCents:20000};resolveData({token:'stale-token',payment_method_id:'master',installments:1});await first;assert.equal(h.requests.filter(r=>r.url.endsWith('/order')).length,0);assert.match(h.nodes.get('checkout-error').textContent,/total mudou/);
});
test('Pix countdown uses the provider deadline and server clock, and refreshing does not restart it',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;const serverTime=Date.now()-3600000,result={state:'pending',method:'pix',receipt:'pix-time',orderId:'ORDTST-time',totalCents:14040,qrCode:'PIX',paymentExpiresAt:serverTime+30000,serverTime};h.context.fetch=async()=>Response.json(result);h.context.selectCheckoutPayment('pix');await h.context.submitOnlineOrder();
  assert.equal(h.nodes.get('sillocta-countdown').textContent,'00:30');assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Copiar código Pix/);
  result.paymentExpiresAt=serverTime+10000;await h.nodes.get('sillocta-refresh').handlers.click();assert.equal(h.nodes.get('sillocta-countdown').textContent,'00:10');
});
test('An elapsed Pix hides payment instructions and checks the provider without claiming approval or creating a new order',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;const result={state:'pending',method:'pix',receipt:'expired-pix',orderId:'ORDTST-expire',totalCents:14040,qrCode:'PIX',paymentExpiresAt:Date.now()-5000};let orders=0,checks=0;h.context.fetch=async url=>{url.endsWith('/order')?orders++:checks++;return Response.json(result);};h.context.selectCheckoutPayment('pix');await h.context.submitOnlineOrder();await tick();
  assert.equal(h.nodes.get('sillocta-countdown').textContent,'00:00');assert.equal(h.nodes.get('sillocta-payment-instructions').hidden,true);assert.equal(orders,1);assert.equal(checks,1);assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/Pagamento aprovado/);
});
test('No deadline is invented when the provider omits expiry; boleto shows its due date and actions',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.fetch=async()=>Response.json({state:'pending',method:'pix',receipt:'no-expiry',orderId:'ORDTST-no-expiry',totalCents:14040,qrCode:'PIX'});h.context.selectCheckoutPayment('pix');await h.context.submitOnlineOrder();assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/sillocta-countdown/);
  h.nodes.get('sillocta-new-test').handlers.click();h.context._checkout.cpf='12345678909';h.context.selectCheckoutPayment('boleto');h.context.fetch=async()=>Response.json({state:'pending',method:'boleto',receipt:'boleto-due',orderId:'ORDTST-boleto',totalCents:14040,digitableLine:'23793380296060054351030006333303799140000020000',ticketUrl:'https://www.mercadopago.com.br/payments/test',paymentExpiresAt:Date.parse('2026-10-14T23:59:59-03:00')});await h.context.submitOnlineOrder();const html=h.nodes.get('sillocta-payment-result').innerHTML;assert.match(html,/Seu boleto está pronto/);assert.match(html,/14 de out/);assert.match(html,/Abrir boleto/);assert.match(html,/Copiar linha digitável/);assert.doesNotMatch(html,/sillocta-countdown/);
});
test('Boleto waits for actual instructions and hydrates the same order without creating a second payment',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context._checkout.cpf='12345678909';h.context.selectCheckoutPayment('boleto');
  const result={state:'pending',method:'boleto',receipt:'issuing-boleto',orderId:'ORDTST-issuing',totalCents:14040};let creates=0;
  h.context.fetch=async url=>{if(url.endsWith('/order'))creates++;return Response.json(result);};await h.context.submitOnlineOrder();
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Boleto em emissão/);assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/Seu boleto está pronto|Copiar linha digitável|Abrir boleto/);
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Consultar emissão do boleto/);
  const issued={...result,digitableLine:'23793380296060054351030006333303799140000020000',ticketUrl:'https://www.mercadopago.com.br/payments/test',paymentExpiresAt:Date.parse('2026-10-14T23:59:59-03:00')};
  h.context.fetch=async()=>Response.json(issued);await h.nodes.get('sillocta-refresh').handlers.click();
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Seu boleto está pronto/);assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Copiar linha digitável/);assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Abrir boleto/);assert.equal(creates,1);
  h.context.fetch=async()=>Response.json(result);await h.nodes.get('sillocta-refresh').handlers.click();
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/23793380296060054351030006333303799140000020000/);assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/14 de out/);assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Abrir boleto/);
  h.nodes.get('sillocta-new-test').handlers.click();h.context.fetch=async()=>Response.json({...result,receipt:'another-boleto',orderId:'ORDTST-other'});await h.context.submitOnlineOrder();
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Boleto em emissão/);assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/23793380296060054351030006333303799140000020000|Abrir boleto/);
});
test('Boleto instructions disappear after confirmed expiry or rejection instead of remaining payable',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context._checkout.cpf='12345678909';h.context.selectCheckoutPayment('boleto');
  const result={state:'pending',method:'boleto',receipt:'closed-boleto',orderId:'ORDTST-closed',totalCents:14040,digitableLine:'23793380296060054351030006333303799140000020000',ticketUrl:'https://www.mercadopago.com.br/payments/test'};
  h.context.fetch=async()=>Response.json(result);await h.context.submitOnlineOrder();h.context.fetch=async()=>Response.json({...result,state:'expired',digitableLine:null,ticketUrl:null});await h.nodes.get('sillocta-refresh').handlers.click();
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Prazo de pagamento encerrado/);assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/Copiar linha digitável|Abrir boleto/);
});
test('A created Pix immediately enters its own focused stage; polling preserves reading position and reset returns the form',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('pix');
  h.nodes.get('cart-drawer').scrollTop=1500;h.nodes.get('cart-items').scrollTop=1200;
  h.context.fetch=async()=>Response.json({state:'pending',method:'pix',receipt:'stage-pix',orderId:'ORDTST-stage',totalCents:14040,qrImage:'aGVsbG8=',qrCode:'PIX'});
  await h.context.submitOnlineOrder();const drawer=h.nodes.get('cart-drawer'),region=h.nodes.get('sillocta-payment-result');
  assert.equal(drawer.classList.contains('sl-payment-stage'),true);assert.equal(drawer.scrollTop,0);assert.equal(h.nodes.get('cart-items').scrollTop,0);assert.equal(region.focusCount,1);assert.equal(region.attributes.tabindex,'-1');
  assert.ok(region.innerHTML.indexOf('sillocta-copy-code')<region.innerHTML.indexOf('sillocta-payment-code'));assert.match(region.innerHTML,/sl-pix-code-details/);
  drawer.scrollTop=220;await h.nodes.get('sillocta-refresh').handlers.click();assert.equal(drawer.scrollTop,220);assert.equal(region.focusCount,1);
  h.nodes.get('sillocta-new-test').handlers.click();assert.equal(drawer.classList.contains('sl-payment-stage'),false);assert.equal(drawer.attributes['aria-label'],'Sua sacola');
});
test('Delivery selection changes the SDK amount and submitted service; pending orders cannot change delivery',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;
  h.context.paymentFlow.quote={quoteId:'delivery-quote',expiresAt:Date.now()+600000,totalCents:14040,options:[{id:'sandbox',name:'Entrega padrão',priceCents:1990,daysRange:[5,8]},{id:'sandbox-express',name:'Entrega expressa',priceCents:2990,daysRange:[2,4]}]};
  h.context.renderPaymentShipping();h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.at(-1).options.initialization.amount,160.30);
  h.context.selectPaymentShipping('sandbox-express');await tick();await tick();assert.equal(h.mounts.at(-1).options.initialization.amount,170.30);assert.equal(h.context.paymentFlow.selected,'sandbox-express');
  let payload;h.context.fetch=async(url,options)=>{payload=JSON.parse(options.body);return Response.json({state:'pending',method:'cartao',receipt:'delivery-receipt',orderId:'ORDTST-delivery',totalCents:17030});};
  await h.nodes.get('sillocta-card-submit').onclick();assert.equal(payload.serviceId,'sandbox-express');assert.equal(payload.quoteId,'delivery-quote');
  h.context.selectPaymentShipping('sandbox');assert.equal(h.context.paymentFlow.selected,'sandbox-express');assert.match(h.nodes.get('sillocta-result-feedback').textContent,/alterar a entrega/);
});
test('A status connection failure remains visible on the dedicated payment stage without creating another order',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('pix');h.context.fetch=async()=>Response.json({state:'pending',method:'pix',receipt:'failure-receipt',orderId:'ORDTST-failure',totalCents:14040});await h.context.submitOnlineOrder();
  h.context.fetch=async()=>{throw Error('network');};await h.nodes.get('sillocta-refresh').handlers.click();assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/A conexão demorou/);assert.equal(h.nodes.get('cart-drawer').classList.contains('sl-payment-stage'),true);
});
test('Re-rendering a saved payment does not display a false method-change error',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('pix');h.context.fetch=async()=>Response.json({state:'pending',method:'pix',receipt:'saved-pix',orderId:'ORDTST-saved',totalCents:14040});await h.context.submitOnlineOrder();h.context.renderCart();assert.equal(h.nodes.get('checkout-error').textContent,'');
  h.context.selectCheckoutPayment('boleto');assert.match(h.nodes.get('checkout-error').textContent,/pedido já foi criado/);
});
test('Real shipping displays the estimated-package notice and updates the secure card amount when choosing a carrier',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;
  h.context.paymentFlow.quote={quoteId:'real-quote',expiresAt:Date.now()+600000,totalCents:14040,shippingSimulation:false,options:[{id:'me-1',name:'Correios · PAC',priceCents:2250,daysRange:[4,6]},{id:'me-2',name:'Correios · SEDEX',priceCents:3250,daysRange:[2,3]}]};
  h.context.renderPaymentShipping();h.context.selectCheckoutPayment('cartao');await tick();assert.equal(h.mounts.at(-1).options.initialization.amount,162.90);
  const html=h.nodes.get('checkout-shipping-options').innerHTML;assert.match(html,/Cotação do Melhor Envio com embalagem estimada/);assert.doesNotMatch(html,/Valores e prazos demonstrativos/);assert.match(html,/4 a 6 dias úteis/);
  h.context.selectPaymentShipping('me-2');await tick();await tick();assert.equal(h.mounts.at(-1).options.initialization.amount,172.90);
});
test('Retrying an uncertain payment with an expired quote never silently recalculates or changes the amount',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('pix');
  h.context.fetch=async(url,options)=>{h.requests.push({url,options});throw Error('lost response');};
  await h.context.submitOnlineOrder();assert.ok(h.nodes.get('sillocta-retry'));const calls=h.requests.length;
  const future=Date.now()+700000;h.context.Date=class extends Date {static now(){return future;}};
  await h.nodes.get('sillocta-retry').handlers.click();assert.equal(h.requests.length,calls);assert.match(h.nodes.get('checkout-error').textContent,/cotação expirou.*Confira este pedido/);assert.equal(h.storage.get('sillocta-orders-test-uncertain'),'1');
});
test('A critical SDK error after mounting removes the controller, blocks payment and offers a fresh form',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  assert.equal(h.nodes.get('sillocta-card-submit').disabled,false);
  h.mounts[0].options.callbacks.onError({type:'critical',cause:'fields_setup_failed',message:'private SDK details'});await tick();
  assert.equal(h.nodes.get('sillocta-card-submit').disabled,true);assert.equal(h.unmounts.length,1);assert.ok(h.nodes.get('sillocta-card-retry'));assert.doesNotMatch(h.nodes.get('checkout-error').textContent,/private/);
  await h.nodes.get('sillocta-card-submit').onclick();assert.equal(h.requests.filter(r=>r.url.endsWith('/order')).length,0);
  h.nodes.get('sillocta-card-retry').handlers.click();await tick();await tick();assert.equal(h.mounts.length,2);assert.equal(h.nodes.get('sillocta-card-submit').disabled,false);
});
test('An additional-card-data promise that never resolves times out, unlocks the action and never sends an order',async()=>{
  const controller={unmount:async()=>{},getFormData:async()=>({token:'tokenized-fixture',payment_method_id:'master',installments:1,payer:{identification:{type:'CPF',number:'12345678909'}}}),getAdditionalData:()=>new Promise(()=>{})};
  const h=harness({cardController:controller});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  const submission=h.nodes.get('sillocta-card-submit').onclick();await tick();assert.equal(h.nodes.get('sillocta-card-submit').disabled,true);
  const timeout=[...h.timers.values()].find(t=>t.ms===20000);assert.ok(timeout);timeout.fn();await submission;
  assert.match(h.nodes.get('sillocta-card-feedback').textContent,/validação do cartão demorou/);assert.equal(h.nodes.get('sillocta-card-submit').disabled,false);assert.equal(h.requests.filter(r=>r.url.endsWith('/order')).length,0);
});
test('Payment-stage hiding targets the actual checkout wrapper and keeps the payment section visible',()=>{
  const layout=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8'),css=readFileSync(new URL('../source/checkout-orders.css',import.meta.url),'utf8');
  const wrapper=layout.match(/<div class="(sl-checkout-wrap)">/)[1];assert.ok(css.includes('#cart-items .'+wrapper+' > *{display:none!important}'));assert.ok(css.includes('#cart-items .'+wrapper+' > section[aria-labelledby="checkout-payment-title"]{display:block!important'));assert.ok(css.includes('section[aria-labelledby="checkout-payment-title"] > *:not(#sillocta-payment-result)'));
});

test('The SDK submit callback uses tokenized data without tokenizing again and blocks duplicate submissions',async()=>{
  const h=harness({cardController:{unmount:async()=>{},getFormData:async()=>{throw Error('must not tokenize again');},getAdditionalData:()=>{throw Error('must not request data again');}}});await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  let finishOrder,calls=0,sent;h.context.fetch=(url,options)=>{calls++;sent=JSON.parse(options.body);return new Promise(resolve=>finishOrder=()=>resolve(Response.json({state:'approved',method:'cartao',receipt:'sdk-receipt',orderId:'ORDTST-sdk',totalCents:14040})));};
  const submit=h.mounts[0].options.callbacks.onSubmit,card={token:'sdk-token',payment_method_id:'master',installments:3,payer:{identification:{type:'CPF',number:'12345678909'}}},additional={paymentTypeId:'credit_card'};
  const first=submit(card,additional);await tick();await submit(card,additional);assert.equal(calls,1);assert.equal(sent.card.token,'sdk-token');assert.equal(sent.card.installments,3);finishOrder();await first;assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Pagamento aprovado/);
});

test('A stale SDK submit callback cannot charge after its card form is replaced',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();
  const stale=h.mounts[0].options.callbacks.onSubmit;h.context.selectCheckoutPayment('pix');h.context.selectCheckoutPayment('cartao');await tick();await tick();
  await stale({token:'stale-token',payment_method_id:'master',installments:1,payer:{identification:{type:'CPF',number:'12345678909'}}},{paymentTypeId:'credit_card'});
  assert.equal(h.requests.filter(r=>r.url.endsWith('/order')).length,0);assert.equal(h.nodes.get('sillocta-card-submit').disabled,false);
});
test('A declined card shows no approval, does not poll or resubmit, and allows an explicit fresh form',async()=>{
  const h=harness();await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();let orders=0;
  h.context.fetch=async()=>{orders++;return Response.json({state:'rejected',method:'cartao',receipt:'declined-receipt',orderId:'ORDTST-declined',totalCents:14040});};
  await h.nodes.get('sillocta-card-submit').onclick();
  assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Pagamento não aprovado/);assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/Pagamento aprovado/);assert.equal([...h.timers.values()].filter(t=>t.ms===10000).length,0);
  await h.context.submitOnlineOrder();assert.equal(orders,1);h.nodes.get('sillocta-new-test').handlers.click();await tick();await tick();
  assert.equal(h.mounts.length,2);assert.equal(h.nodes.get('sillocta-card-submit').disabled,false);assert.equal(JSON.parse(h.storage.get('sillocta-orders-test-history'))[0].receipt,'declined-receipt');assert.equal(orders,1);
});
test('The custom card button and an SDK callback racing during submission send only one order with the selected installments',async()=>{
  let resolveToken,tokenizations=0;const h=harness({cardController:{unmount:async()=>{},getFormData:()=>{tokenizations++;return new Promise(resolve=>resolveToken=resolve);},getAdditionalData:()=>({paymentTypeId:'credit_card'})}});
  await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();let finish,calls=0,payload;
  h.context.fetch=(url,options)=>{calls++;payload=JSON.parse(options.body);return new Promise(resolve=>finish=()=>resolve(Response.json({state:'approved',method:'cartao',receipt:'race-receipt',orderId:'ORDTST-race',totalCents:14040})));};
  const data={token:'button-token',payment_method_id:'master',installments:3,payer:{identification:{type:'CPF',number:'12345678909'}}},callback=h.mounts[0].options.callbacks.onSubmit;
  const first=h.nodes.get('sillocta-card-submit').onclick();await callback(data,{paymentTypeId:'credit_card'});assert.equal(tokenizations,1);assert.equal(calls,0);
  resolveToken(data);await tick();await callback(data,{paymentTypeId:'credit_card'});await h.context.submitOnlineOrder();assert.equal(calls,1);assert.equal(payload.card.installments,3);
  finish();await first;await callback(data,{paymentTypeId:'credit_card'});assert.equal(calls,1);
});
test('An uncertain card response can only repeat the same payload without tokenizing again',async()=>{
  let tokens=0;const h=harness({cardController:{unmount:async()=>{},getFormData:async()=>{tokens++;return {token:'retry-card-token',payment_method_id:'visa',installments:3,payer:{identification:{type:'CPF',number:'12345678909'}}};},getAdditionalData:()=>({paymentTypeId:'credit_card'})}});
  await tick();h.context.paymentFlow.enabled=true;h.context.selectCheckoutPayment('cartao');await tick();const payloads=[];
  h.context.fetch=async(url,options)=>{payloads.push(options.body);if(payloads.length===1)throw Error('lost response');return Response.json({state:'approved',method:'cartao',receipt:'retried-card',orderId:'ORDTST-retried',totalCents:14040});};
  await h.nodes.get('sillocta-card-submit').onclick();assert.equal(h.storage.get('sillocta-orders-test-uncertain'),'1');assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Repetir o mesmo envio/);assert.doesNotMatch(h.nodes.get('sillocta-payment-result').innerHTML,/Pagamento aprovado/);
  await h.context.submitOnlineOrder();assert.equal(payloads.length,1);await h.nodes.get('sillocta-retry').handlers.click();assert.equal(payloads.length,2);assert.equal(payloads[1],payloads[0]);assert.equal(tokens,1);assert.equal(h.storage.get('sillocta-orders-test-uncertain'),undefined);assert.match(h.nodes.get('sillocta-payment-result').innerHTML,/Pagamento aprovado/);
});
