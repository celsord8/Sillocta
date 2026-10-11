import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handle,canonicalCart,configuration,normalizeOrder,safeTicketUrl,providerBody,shippingPackages,shippingOptions} from '../lib/checkout.mjs';
const env={VERCEL_ENV:'preview',MERCADO_PAGO_ACCESS_TOKEN:'APP_USR-fixture-not-a-credential',MERCADO_PAGO_PUBLIC_KEY:'APP_USR-public-fixture'};
const identity={id:123456,country_id:'BR',site_id:'MLB',tags:['test_user'],email:'private-not-returned@testuser.com'};
const verifiedFetcher=fetcher=>async(url,options)=>url==='https://api.mercadolibre.com/users/me'?Response.json(identity):fetcher(url,options);
const origin='https://sillocta-test.vercel.app',now=1791664000000;
const cart={items:[{pid:1,volume:'5',quantity:1}],coupon:'BEMVINDO10',gift:true,total:1};
const customer={nome:'Comprador de Teste',fone:'11999999999',email:'test@testuser.com',cep:'06233903',logradouro:'Av. das Nações Unidas',numero:'3003',bairro:'Bonfim',cidade:'Osasco',uf:'SP'};
const key='8ce88571-e73b-4cc2-bd48-7f347b95565c';
const request=(action,input,cookie,other={})=>new Request(origin+'/api/checkout/'+action,{method:'POST',headers:{origin,cookie,'content-type':'application/json',...other},body:JSON.stringify(input)});
async function session(){const response=await handle(new Request(origin+'/api/checkout/config'),env,{now,fetcher:verifiedFetcher(()=>{throw Error('config must not call Orders');})});return response.headers.get('set-cookie').split(';')[0];}
async function quote(cookie,extra={}){const r=await handle(request('quote',{...cart,cep:customer.cep,...extra},cookie),env,{now});assert.equal(r.status,200);return r.json();}
const orderData=(body,state='pending')=>({id:'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',external_reference:body.external_reference,total_amount:body.total_amount,total_paid_amount:state==='approved'?body.total_amount:'0.00',user_id:'123456',country_code:'BRA',type:'online',status:state==='approved'?'processed':state==='rejected'?'failed':'action_required',status_detail:state==='approved'?'accredited':'waiting_transfer',transactions:{payments:[{amount:body.total_amount,status:state==='approved'?'processed':state==='rejected'?'failed':'action_required',status_detail:state==='approved'?'accredited':'waiting_transfer',payment_method:{...body.transactions.payments[0].payment_method,qr_code:'PIXTEST',qr_code_base64:'aGVsbG8=',ticket_url:'https://www.mercadopago.com.br/payments/test'}}]}});
test('Only Preview with Orders key candidates and a verified Brazilian test seller can activate public checkout',async()=>{
  assert.equal(configuration(env).enabled,true);
  for(const patch of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{MERCADO_PAGO_ACCESS_TOKEN:''},{MERCADO_PAGO_ACCESS_TOKEN:'TEST-legacy'},{MERCADO_PAGO_PUBLIC_KEY:'TEST-legacy'}]){
    assert.equal(configuration({...env,...patch}).enabled,false);
    const disabled=await handle(new Request(origin+'/api/checkout/config'),{...env,...patch},{now,fetcher:()=>{throw Error('disabled environments must not call provider');}});
    assert.equal((await disabled.json()).enabled,false);assert.equal(disabled.headers.get('set-cookie'),null);
  }
  const r=await handle(new Request(origin+'/api/checkout/config'),env,{now,fetcher:verifiedFetcher(()=>{throw Error('must not call Orders');})});const body=await r.text();assert.ok(!body.includes(env.MERCADO_PAGO_ACCESS_TOKEN));assert.ok(!body.includes(identity.email));assert.ok(body.includes(env.MERCADO_PAGO_PUBLIC_KEY));assert.ok(r.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Strict'));
});
test('APP_USR alone never exposes the public key or starts a checkout session for a live, foreign or unverified seller',async()=>{
  for(const value of [{...identity,tags:['normal']},{...identity,tags:null},{...identity,country_id:'AR'},{...identity,site_id:'MLA'},{...identity,id:'invalid'}]){
    const r=await handle(new Request(origin+'/api/checkout/config'),env,{now,fetcher:async()=>Response.json(value)}),body=await r.json();
    assert.equal(body.enabled,false);assert.equal(body.publicKey,undefined);assert.equal(body.code,'sandbox_required');assert.equal(r.headers.get('set-cookie'),null);
  }
  for(const fetcher of [async()=>Response.json({private:'hidden'},{status:403}),async()=>{throw Error('network');},async()=>new Response('not json')]){
    const r=await handle(new Request(origin+'/api/checkout/config'),env,{now,fetcher});assert.equal((await r.json()).enabled,false);assert.equal(r.headers.get('set-cookie'),null);
  }
});
test('Server catalog ignores customer-supplied prices, applies exact coupon and gift values, and rejects bad or excessive quantities',()=>{
  const c=canonicalCart(cart);assert.equal(c.subtotal,14500);assert.equal(c.discount,1450);assert.equal(c.gift,990);assert.equal(c.total,14040);
  for(const patch of [{items:[{pid:1,volume:'5',quantity:1.5}]},{items:[{pid:1,volume:'5',quantity:100}]},{items:[{pid:999,volume:'5',quantity:1}]},{coupon:'INVALID'},{gift:'true'},{items:[{pid:1,volume:'5',quantity:60},{pid:1,volume:'5',quantity:40}]}])assert.throws(()=>canonicalCart({...cart,...patch}));
});
test('Origins, sessions, expired quotes, changed cart and modified signed quotes are rejected before contacting provider',async()=>{
  const cookie=await session(),q=await quote(cookie),input={...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'};
  const checks=[{req:request('order',input,cookie,{origin:'https://other.test'}),time:now,code:403},{req:request('order',input,''),time:now,code:401},{req:request('order',input,cookie),time:now+600001,code:401},{req:request('order',{...input,gift:false},cookie),time:now,code:409},{req:request('order',{...input,quoteId:q.quoteId+'x'},cookie),time:now,code:401}];
  for(const c of checks){const r=await handle(c.req,env,{now:c.time,fetcher:()=>{throw Error('must not fetch');}});assert.equal(r.status,c.code);}
});
test('Pix creation uses Orders with the server total and repeat requests preserve provider idempotency; owner-bound status is verified',async()=>{
  const cookie=await session(),q=await quote(cookie),input={...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'};let data,headers,calls=[];
  const fetcher=verifiedFetcher(async(url,options)=>{calls.push(url);if(options.method==='POST'){const body=JSON.parse(options.body);assert.equal(body.total_amount,'160.30');assert.equal(body.processing_mode,'automatic');assert.equal(body.transactions.payments[0].payment_method.type,'bank_transfer');data=orderData(body);if(headers)assert.equal(options.headers['X-Idempotency-Key'],headers);headers=options.headers['X-Idempotency-Key'];}return Response.json(data);});
  const r=await handle(request('order',input,cookie),env,{now,fetcher});assert.equal(r.status,200);const result=await r.json();assert.equal(result.state,'pending');assert.equal(result.qrCode,'PIXTEST');
  assert.equal((await handle(request('order',input,cookie),env,{now,fetcher})).status,200);
  const status=await handle(request('status',{receipt:result.receipt},cookie),env,{now,fetcher});assert.equal(status.status,200);assert.ok(calls.at(-1).endsWith('/'+result.orderId));
  const other=await session();assert.equal((await handle(request('status',{receipt:result.receipt},other),env,{now,fetcher})).status,401);
});
test('A seller recheck blocks live credentials before POST /v1/orders even with a previously signed valid quote',async()=>{
  const cookie=await session(),q=await quote(cookie),input={...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'};
  for(const value of [{...identity,tags:[]},{...identity,country_id:'AR'}]){
    let orderCalls=0;
    const r=await handle(request('order',input,cookie),env,{now,fetcher:async(url,options)=>{
      if(url==='https://api.mercadolibre.com/users/me'){assert.equal(options.headers.authorization,'Bearer '+env.MERCADO_PAGO_ACCESS_TOKEN);return Response.json(value);}
      orderCalls++;throw Error('must not create a real order');
    }});
    assert.equal(r.status,503);assert.equal((await r.json()).code,'sandbox_required');assert.equal(orderCalls,0);
  }
});
test('Order response must belong to the independently verified test seller',async()=>{
  const cookie=await session(),q=await quote(cookie),input={...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'};
  const r=await handle(request('order',input,cookie),env,{now,fetcher:verifiedFetcher(async(url,options)=>Response.json({...orderData(JSON.parse(options.body)),user_id:'999'}))});
  assert.equal(r.status,502);assert.equal((await r.json()).receipt,undefined);
});
test('Status cannot query Orders after the authenticated identity changes to another test seller',async()=>{
  const cookie=await session(),q=await quote(cookie),input={...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'};
  const r=await handle(request('order',input,cookie),env,{now,fetcher:verifiedFetcher(async(url,options)=>Response.json(orderData(JSON.parse(options.body))))}),result=await r.json();
  let orderCalls=0;const status=await handle(request('status',{receipt:result.receipt},cookie),env,{now,fetcher:async url=>{
    if(url==='https://api.mercadolibre.com/users/me')return Response.json({...identity,id:999});orderCalls++;throw Error('must not query order for another seller');
  }});
  assert.equal(status.status,401);assert.equal((await status.json()).code,'seller_mismatch');assert.equal(orderCalls,0);
});
test('Only settled provider data with matching order, seller and exact paid amount is approved',()=>{
  const body=providerBody({method:'pix'},canonicalCart(cart),customer,'reference');const data=orderData(body,'approved'),expected={id:data.id,reference:'reference',total:14040,seller:'123456',method:'pix'};
  assert.equal(normalizeOrder(data,expected).state,'approved');assert.equal(normalizeOrder({...data,total_paid_amount:'0.00'},expected).state,'pending');
  assert.equal(normalizeOrder(orderData(body,'rejected'),expected).state,'rejected');
  for(const patch of [{external_reference:'other'},{user_id:'999'},{total_amount:'1.00'},{id:'ORDDIFFERENTORDER123'}])assert.throws(()=>normalizeOrder({...data,...patch},expected));
});
test('Boleto includes CPF and complete payer address; cards accept only tokenized SDK data and no supplied amount',()=>{
  const c=canonicalCart(cart),b=providerBody({method:'boleto',cpf:'123.456.789-09'},c,customer,'r');assert.equal(b.payer.address.state,'SP');assert.equal(b.transactions.payments[0].payment_method.id,'boleto');assert.equal(b.transactions.payments[0].expiration_time,'P3D');
  const card={token:'tokenized-card',id:'visa',type:'credit_card',installments:1,identification:{number:'12345678909'},amount:1,card_number:'raw ignored'};
  const a=providerBody({method:'cartao',card},c,customer,'r');assert.equal(a.total_amount,'140.40');assert.equal(a.payer.email,'test@testuser.com');assert.ok(!JSON.stringify(a).includes('raw ignored'));assert.throws(()=>providerBody({method:'cartao',card:{...card,installments:0}},c,customer,'r'));
});
test('Provider authentication failure is actionable and contains neither provider error details nor secrets',async()=>{
  const cookie=await session(),q=await quote(cookie),r=await handle(request('order',{...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'},cookie),env,{now,fetcher:verifiedFetcher(async()=>Response.json({private_token:'DO_NOT_EXPOSE'},{status:403}))});const body=await r.text();assert.equal(r.status,503);assert.ok(body.includes('credentials_rejected'));assert.ok(!body.includes('DO_NOT_EXPOSE'));assert.ok(!body.includes(env.MERCADO_PAGO_ACCESS_TOKEN));
});
test('Receipt links reject scripts, credentials and misleading Mercado Pago host suffixes',()=>{
  assert.equal(safeTicketUrl('https://www.mercadopago.com.br/test'),'https://www.mercadopago.com.br/test');for(const url of ['javascript:alert(1)','https://mercadopago.com.br.attacker.test/x','https://secret@mercadopago.com.br/x','http://mercadopago.com.br/x'])assert.equal(safeTicketUrl(url),null);
});
test('Payment expiry comes from Orders and survives a status response missing its date',async()=>{
  const cookie=await session(),q=await quote(cookie),deadline='2026-10-11T12:30:00-03:00';let data;
  const fetcher=verifiedFetcher(async(url,options)=>{if(options.method==='POST'){data=orderData(JSON.parse(options.body));data.transactions.payments[0].date_of_expiration=deadline;}return Response.json(data);});
  const created=await handle(request('order',{...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'},cookie),env,{now,fetcher});const result=await created.json();assert.equal(result.paymentExpiresAt,Date.parse(deadline));assert.equal(result.serverTime,now);
  delete data.transactions.payments[0].date_of_expiration;const status=await handle(request('status',{receipt:result.receipt},cookie),env,{now:now+5000,fetcher});assert.equal((await status.json()).paymentExpiresAt,result.paymentExpiresAt);
  const expected={id:data.id,reference:data.external_reference,total:16030,seller:'123456',method:'pix'};assert.equal(normalizeOrder(data,expected).paymentExpiresAt,null);data.transactions.payments[0].date_of_expiration='not a date';assert.equal(normalizeOrder(data,expected).paymentExpiresAt,null);data.status='expired';assert.equal(normalizeOrder(data,expected).state,'expired');
});
test('Delivery price is bound to the signed quote and included in Orders; injected prices and unknown services cannot underpay',async()=>{
  const cookie=await session(),q=await quote(cookie);assert.equal(q.shippingSimulation,true);assert.equal(q.options.length,2);assert.equal(q.options[0].priceCents,1990);assert.equal(q.options[1].priceCents,2990);
  let body,data;const fetcher=verifiedFetcher(async(url,options)=>{if(options.method==='POST'){body=JSON.parse(options.body);data=orderData(body);}return Response.json(data);});
  const response=await handle(request('order',{...cart,customer,quoteId:q.quoteId,serviceId:'sandbox-express',shippingPrice:0,total:1,requestKey:key,method:'pix'},cookie),env,{now,fetcher});assert.equal(response.status,200);const result=await response.json();assert.equal(body.total_amount,'170.30');assert.equal(body.transactions.payments[0].amount,'170.30');assert.equal(result.totalCents,17030);assert.equal(result.shipping.name,'Entrega expressa');assert.equal(result.shipping.priceCents,2990);
  const status=await handle(request('status',{receipt:result.receipt},cookie),env,{now,fetcher});assert.equal((await status.json()).shipping.priceCents,2990);
  const unknown=await handle(request('order',{...cart,customer,quoteId:q.quoteId,serviceId:'injected-free',requestKey:key,method:'pix'},cookie),env,{now,fetcher:()=>{throw Error('invalid service must not contact provider');}});assert.equal(unknown.status,409);
});
test('The Preview standard free-shipping policy applies to products, while express delivery stays separate',async()=>{
  const cookie=await session(),q=await quote(cookie,{items:[{pid:1,volume:'5',quantity:3}]});assert.equal(q.options[0].priceCents,0);assert.equal(q.options[1].priceCents,2990);assert.equal(q.options[0].demo,true);
});
test('Deployed pages load the official tokenization controller and never ship private server files',()=>{
  const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),client=readFileSync(new URL('../public/checkout-orders.js',import.meta.url),'utf8');assert.ok(home.includes('/checkout-orders.js'));assert.ok(client.includes('https://sdk.mercadopago.com/js/v2'));assert.ok(client.includes("create('cardPayment'"));assert.ok(client.includes('controller.unmount()'));assert.ok(!client.includes('MERCADO_PAGO_ACCESS_TOKEN'));assert.ok(!home.includes('data-sillocta-review'));
});

// Melhor Envio quotation integration.
{
const origin='https://sillocta-test.vercel.app',now=1791664000000;
const env={VERCEL_ENV:'preview',MERCADO_PAGO_ACCESS_TOKEN:'APP_USR-shipping-fixture',MERCADO_PAGO_PUBLIC_KEY:'APP_USR-public-fixture',MELHOR_ENVIO_TOKEN:'shipping-secret-fixture',SHIPPING_ORIGIN_CEP:'61760-046',MELHOR_ENVIO_CONTACT_EMAIL:'contact@example.com'};
const cart={items:[{pid:1,volume:'5',quantity:1}],coupon:'BEMVINDO10',gift:true};
const customer={nome:'Comprador de Teste',fone:'11999999999',email:'test@testuser.com',cep:'06233903',logradouro:'Rua de Teste',numero:'1',bairro:'Centro',cidade:'Osasco',uf:'SP'};
const service=(id=1,price='25.00')=>({id,name:'PAC',company:{name:'Correios'},price,custom_price:'22.50',delivery_time:8,custom_delivery_time:6,custom_delivery_range:{min:4,max:6}});
const req=(action,input,cookie)=>new Request(origin+'/api/checkout/'+action,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(input)});
const identity={id:123456,country_id:'BR',site_id:'MLB',tags:['test_user']};
async function session(){const r=await handle(new Request(origin+'/api/checkout/config'),env,{now,fetcher:async()=>Response.json(identity)});return r.headers.get('set-cookie').split(';')[0];}

test('Generic packaging includes box protection, grows with item count and splits large orders with exact insurance',()=>{
  const pack=n=>shippingPackages(canonicalCart({...cart,items:[{pid:1,volume:'5',quantity:n}]}));
  assert.deepEqual(pack(1),[{length:16,width:11,height:6,weight:0.13,insurance:130.5}]);
  assert.equal(pack(6)[0].weight,0.28);assert.equal(pack(7)[0].weight,0.36);assert.equal(pack(18)[0].height,10);assert.equal(pack(19)[0].height,15);
  const c=canonicalCart({...cart,items:[{pid:1,volume:'5',quantity:49}]});const boxes=shippingPackages(c);assert.equal(boxes.length,2);assert.equal(boxes[0].weight,1.69);assert.equal(boxes[1].weight,0.13);assert.equal(boxes.reduce((n,b)=>n+Math.round(b.insurance*100),0),c.subtotal-c.discount);
  assert.throws(()=>shippingPackages({items:[{quantity:961}]}),/atendimento/);
});
test('Carrier options prefer account-specific prices and deadlines, filter invalid services and grant only the cheapest free shipping',()=>{
  const c=canonicalCart(cart),cheap={...service(2),custom_price:'19.90'};
  const options=shippingOptions([service(),cheap,{...service(3),error:'unavailable'},{...service(4),custom_price:'-1.00'},{...service(5),custom_delivery_range:{min:8,max:2}},{...service('invalid')}],c);
  assert.deepEqual(options.map(o=>o.id),['me-2','me-1']);assert.equal(options[1].priceCents,2250);assert.deepEqual(options[1].daysRange,[4,6]);assert.equal(options[0].demo,false);
  const free=shippingOptions([service(),cheap],canonicalCart({...cart,items:[{pid:1,volume:'5',quantity:3}]}));assert.equal(free[0].priceCents,0);assert.equal(free[0].carrierPriceCents,1990);assert.equal(free[1].priceCents,2250);
  assert.throws(()=>shippingOptions([],c),/Não há entrega/);assert.throws(()=>shippingOptions({},c),/inválida/);
});
test('Live quote sends only canonical volumes, origin and destination; secrets stay on the server',async()=>{
  const cookie=await session(),calls=[];
  const r=await handle(req('quote',{...cart,cep:customer.cep,weight:0.001,price:1,origin:'00000000'},cookie),env,{now,fetcher:async(url,options)=>{calls.push({url,options});return Response.json([service()]);}});
  assert.equal(r.status,200);const q=await r.json();assert.equal(q.shippingSimulation,false);assert.equal(q.packagingEstimated,true);assert.equal(q.shippingProvider,'melhor-envio');assert.equal(q.options[0].priceCents,2250);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://melhorenvio.com.br/api/v2/me/shipment/calculate');assert.equal(calls[0].options.headers['User-Agent'],'Sillocta (contact@example.com)');assert.equal(calls[0].options.headers.authorization,'Bearer '+env.MELHOR_ENVIO_TOKEN);
  const body=JSON.parse(calls[0].options.body);assert.deepEqual(body.from,{postal_code:'61760046'});assert.deepEqual(body.to,{postal_code:customer.cep});assert.equal(body.volumes[0].weight,0.13);assert.equal(body.volumes[0].insurance,130.5);
  const publicData=JSON.stringify(q);assert.ok(!publicData.includes(env.MELHOR_ENVIO_TOKEN));assert.ok(!publicData.includes(env.MELHOR_ENVIO_CONTACT_EMAIL));
});
test('Registered account contact is resolved privately when no integration email is configured',async()=>{
  const cookie=await session(),calls=[],e={...env,MELHOR_ENVIO_CONTACT_EMAIL:'',MELHOR_ENVIO_TOKEN:'unique-bootstrap-fixture'};
  const r=await handle(req('quote',{...cart,cep:customer.cep},cookie),e,{now,fetcher:async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('/me')?{email:'account@example.com'}:[service()]);}});
  assert.equal(r.status,200);const q=await r.text();assert.equal(calls[0].url,'https://melhorenvio.com.br/api/v2/me');assert.equal(calls[0].options.method,'GET');assert.equal(calls[1].options.headers['User-Agent'],'Sillocta (account@example.com)');assert.ok(!q.includes('account@example.com'));
});
test('Provider errors never fall back to invented shipping prices or leak provider responses',async()=>{
  const cookie=await session();
  for(const [status,expected] of [[401,503],[403,503],[429,429],[500,503],[422,422]]){
    const r=await handle(req('quote',{...cart,cep:customer.cep},cookie),env,{now,fetcher:async()=>Response.json({private:env.MELHOR_ENVIO_TOKEN},{status})});assert.equal(r.status,expected);const body=await r.json();assert.equal(body.options,undefined);assert.ok(!JSON.stringify(body).includes(env.MELHOR_ENVIO_TOKEN));
  }
  for(const fetcher of [async()=>{throw Error('private network detail');},async()=>new Response('not json'),async()=>Response.json([])]){
    const r=await handle(req('quote',{...cart,cep:customer.cep},cookie),env,{now,fetcher});assert.notEqual(r.status,200);assert.equal((await r.json()).options,undefined);
  }
  const r=await handle(req('quote',{...cart,cep:customer.cep},cookie),{...env,SHIPPING_ORIGIN_CEP:''},{now,fetcher:()=>{throw Error('must not fetch');}});assert.equal(r.status,503);
});
test('Selected real delivery price is signed into the payment; injected prices, stale quotes and unknown services cannot change it',async()=>{
  const cookie=await session(),r=await handle(req('quote',{...cart,cep:customer.cep},cookie),env,{now,fetcher:async()=>Response.json([service()])}),q=await r.json();
  const input={...cart,customer,quoteId:q.quoteId,serviceId:'me-1',priceCents:1,total:1,method:'pix',requestKey:'8ce88571-e73b-4cc2-bd48-7f347b95565c'};let paid;
  const fetcher=async(url,options)=>{
    if(url==='https://api.mercadolibre.com/users/me')return Response.json(identity);
    assert.equal(url,'https://api.mercadopago.com/v1/orders');paid=JSON.parse(options.body);
    return Response.json({id:'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',external_reference:paid.external_reference,total_amount:paid.total_amount,total_paid_amount:'0.00',user_id:'123456',country_code:'BRA',type:'online',status:'action_required',status_detail:'waiting_transfer',transactions:{payments:[{amount:paid.total_amount,status:'action_required',status_detail:'waiting_transfer',payment_method:{...paid.transactions.payments[0].payment_method,qr_code:'PIXTEST'}}]}});
  };
  const created=await handle(req('order',input,cookie),env,{now,fetcher});assert.equal(created.status,200);assert.equal(paid.total_amount,'162.90');const result=await created.json();assert.equal(result.totalCents,16290);assert.equal(result.shipping.priceCents,2250);assert.equal(result.shipping.demo,false);
  for(const [patch,time,status] of [[{serviceId:'other'},now,409],[{},now+600001,401]]){
    const denied=await handle(req('order',{...input,...patch},cookie),env,{now:time,fetcher:()=>{throw Error('must not charge');}});assert.equal(denied.status,status);
  }
});

}
