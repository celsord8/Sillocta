import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handle,canonicalCart,configuration,normalizeOrder,safeTicketUrl,providerBody} from '../lib/checkout.mjs';
const env={VERCEL_ENV:'preview',MERCADO_PAGO_ACCESS_TOKEN:'TEST-fixture-not-a-credential',MERCADO_PAGO_PUBLIC_KEY:'TEST-public-fixture'};
const origin='https://sillocta-test.vercel.app',now=1791664000000;
const cart={items:[{pid:1,volume:'5',quantity:1}],coupon:'BEMVINDO10',gift:true,total:1};
const customer={nome:'Comprador de Teste',fone:'11999999999',email:'test@testuser.com',cep:'06233903',logradouro:'Av. das Nações Unidas',numero:'3003',bairro:'Bonfim',cidade:'Osasco',uf:'SP'};
const key='8ce88571-e73b-4cc2-bd48-7f347b95565c';
const request=(action,input,cookie,other={})=>new Request(origin+'/api/checkout/'+action,{method:'POST',headers:{origin,cookie,'content-type':'application/json',...other},body:JSON.stringify(input)});
async function session(){const response=await handle(new Request(origin+'/api/checkout/config'),env,{now});return response.headers.get('set-cookie').split(';')[0];}
async function quote(cookie,extra={}){const r=await handle(request('quote',{...cart,cep:customer.cep,...extra},cookie),env,{now});assert.equal(r.status,200);return r.json();}
const orderData=(body,state='pending')=>({id:'ORD01J6TC8BYRR0T4ZKY0QR39WGYE',external_reference:body.external_reference,total_amount:body.total_amount,total_paid_amount:state==='approved'?body.total_amount:'0.00',user_id:'123456',country_code:'BRA',type:'online',status:state==='approved'?'processed':state==='rejected'?'failed':'action_required',status_detail:state==='approved'?'accredited':'waiting_transfer',transactions:{payments:[{amount:body.total_amount,status:state==='approved'?'processed':state==='rejected'?'failed':'action_required',status_detail:state==='approved'?'accredited':'waiting_transfer',payment_method:{...body.transactions.payments[0].payment_method,qr_code:'PIXTEST',qr_code_base64:'aGVsbG8=',ticket_url:'https://www.mercadopago.com.br/payments/test'}}]}});
test('Only Preview with the explicitly supplied test key family can activate checkout; public config never exposes Access Token',async()=>{
  assert.equal(configuration(env).enabled,true);
  for(const patch of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{MERCADO_PAGO_ACCESS_TOKEN:''},{MERCADO_PAGO_ACCESS_TOKEN:'APP_USR-unverified'}])assert.equal(configuration({...env,...patch}).enabled,false);
  const r=await handle(new Request(origin+'/api/checkout/config'),env,{now});const body=await r.text();assert.ok(!body.includes(env.MERCADO_PAGO_ACCESS_TOKEN));assert.ok(r.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Strict'));
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
  const fetcher=async(url,options)=>{calls.push(url);if(options.method==='POST'){const body=JSON.parse(options.body);assert.equal(body.total_amount,'140.40');assert.equal(body.processing_mode,'automatic');assert.equal(body.transactions.payments[0].payment_method.type,'bank_transfer');data=orderData(body);if(headers)assert.equal(options.headers['X-Idempotency-Key'],headers);headers=options.headers['X-Idempotency-Key'];}return Response.json(data);};
  const r=await handle(request('order',input,cookie),env,{now,fetcher});assert.equal(r.status,200);const result=await r.json();assert.equal(result.state,'pending');assert.equal(result.qrCode,'PIXTEST');
  assert.equal((await handle(request('order',input,cookie),env,{now,fetcher})).status,200);
  const status=await handle(request('status',{receipt:result.receipt},cookie),env,{now,fetcher});assert.equal(status.status,200);assert.ok(calls.at(-1).endsWith('/'+result.orderId));
  const other=await session();assert.equal((await handle(request('status',{receipt:result.receipt},other),env,{now,fetcher})).status,401);
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
  const cookie=await session(),q=await quote(cookie),r=await handle(request('order',{...cart,customer,quoteId:q.quoteId,serviceId:'sandbox',requestKey:key,method:'pix'},cookie),env,{now,fetcher:async()=>Response.json({private_token:'DO_NOT_EXPOSE'},{status:403})});const body=await r.text();assert.equal(r.status,503);assert.ok(body.includes('credentials_rejected'));assert.ok(!body.includes('DO_NOT_EXPOSE'));assert.ok(!body.includes(env.MERCADO_PAGO_ACCESS_TOKEN));
});
test('Receipt links reject scripts, credentials and misleading Mercado Pago host suffixes',()=>{
  assert.equal(safeTicketUrl('https://www.mercadopago.com.br/test'),'https://www.mercadopago.com.br/test');for(const url of ['javascript:alert(1)','https://mercadopago.com.br.attacker.test/x','https://secret@mercadopago.com.br/x','http://mercadopago.com.br/x'])assert.equal(safeTicketUrl(url),null);
});
test('Deployed pages load the official tokenization controller and never ship private server files',()=>{
  const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),client=readFileSync(new URL('../public/checkout-orders.js',import.meta.url),'utf8');assert.ok(home.includes('/checkout-orders.js'));assert.ok(client.includes('https://sdk.mercadopago.com/js/v2'));assert.ok(client.includes("create('cardPayment'"));assert.ok(client.includes('controller.unmount()'));assert.ok(!client.includes('MERCADO_PAGO_ACCESS_TOKEN'));assert.ok(!home.includes('data-sillocta-review'));
});
