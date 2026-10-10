import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import PRODUCTS from '../source/products.json' with {type:'json'};

const UUID=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const ORD=/^ORD[A-Z0-9]{10,80}$/;
const COUPONS={BEMVINDO10:10,SILLOCTA15:15,PROMO20:20};
const UF='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const fail=(message,status=400,code='invalid_request')=>{throw Object.assign(new Error(message),{status,code});};
export const money=value=>(value/100).toFixed(2);
export function cents(value){const s=String(value);if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(s))return null;const [n,f='']=s.split('.');return Number(n)*100+Number(f.padEnd(2,'0'));}
export function canonicalCart(input){
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>52)fail('Confira os itens da sacola.');
  const combined=new Map();
  for(const i of input.items){const p=PRODUCTS.find(p=>p.id===i.pid),volume=String(i.volume);if(!p?.available||!['5','10'].includes(volume)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99)fail('Confira os produtos, volumes e quantidades.');
    const key=p.id+':'+volume,quantity=(combined.get(key)?.quantity||0)+i.quantity;if(quantity>99)fail('A quantidade máxima por volume é 99.');
    combined.set(key,{pid:p.id,volume,quantity,unitCents:p.prices[volume]});}
  const items=[...combined.values()].sort((a,b)=>a.pid-b.pid||Number(a.volume)-Number(b.volume));
  const coupon=String(input.coupon||'').trim().toUpperCase();if(coupon&&!COUPONS[coupon])fail('Cupom inválido.');
  if(input.gift!==undefined&&typeof input.gift!=='boolean')fail('Opção de presente inválida.');
  const subtotal=items.reduce((sum,i)=>sum+i.unitCents*i.quantity,0),discount=Math.round(subtotal*(COUPONS[coupon]||0)/100),gift=input.gift?990:0;
  return {items,coupon,subtotal,discount,gift,total:subtotal-discount+gift};
}
export function configuration(env){
  // This branch may never activate production payments. TEST keys were supplied
  // explicitly for this preview; APP_USR test credentials require a separate,
  // verified sandbox migration rather than assuming a prefix means sandbox.
  const enabled=env.VERCEL_ENV==='preview'&&/^TEST-/.test(env.MERCADO_PAGO_ACCESS_TOKEN||'')&&/^TEST-/.test(env.MERCADO_PAGO_PUBLIC_KEY||'');
  return {enabled,integration:'orders',sandbox:true,shippingEnabled:enabled,publicKey:enabled?env.MERCADO_PAGO_PUBLIC_KEY:undefined,freeShippingThreshold:29900,shippingSimulation:true};
}
const mac=(env,data)=>createHmac('sha256',env.MERCADO_PAGO_ACCESS_TOKEN).update('sillocta-orders-preview-v1\0'+data).digest('base64url');
function seal(env,claims){const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return body+'.'+mac(env,body);}
function unseal(env,token,kind,owner,now){
  if(typeof token!=='string'||token.length>5000)fail('Reabra a sacola e tente novamente.',401);
  const [body,signature,...rest]=token.split('.'),expected=mac(env,body),a=Buffer.from(signature||''),b=Buffer.from(expected);
  if(rest.length||a.length!==b.length||!timingSafeEqual(a,b))fail('Autorização inválida.',401);
  let claims;try{claims=JSON.parse(Buffer.from(body,'base64url').toString());}catch{fail('Autorização inválida.',401);}
  if(claims.kind!==kind||claims.owner!==owner||claims.expiresAt<now)fail('A sessão ou cotação expirou. Reabra a sacola.',401);
  return claims;
}
const ownerOf=(request,env)=>{const session=request.headers.get('cookie')?.match(/(?:^|;\s*)sl_checkout_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!session)fail('Reabra a sacola para iniciar a sessão.',401);return mac(env,'owner:'+session);};
function sameOrigin(request){if(request.headers.get('origin')!==new URL(request.url).origin)fail('Origem inválida.',403);}
async function readBody(request){if(!request.headers.get('content-type')?.startsWith('application/json'))fail('Envie dados JSON.');const raw=await request.text();if(raw.length>24000)fail('Pedido muito grande.',413);try{const value=JSON.parse(raw);if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}catch{fail('Dados inválidos.');}}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff',...headers}});
function customerData(value){
  const c={};for(const k of ['nome','fone','email','cep','logradouro','numero','bairro','cidade','uf']){c[k]=String(value?.[k]||'').trim();if(c[k].length>150)fail('Confira os dados de entrega.');}
  c.cep=c.cep.replace(/\D/g,'');c.uf=c.uf.toUpperCase();
  if(c.nome.length<3||!/^\d{10,11}$/.test(c.fone.replace(/\D/g,''))||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)||!/^\d{8}$/.test(c.cep)||!c.logradouro||!c.numero||!c.bairro||!c.cidade||!UF.includes(c.uf))fail('Confira nome, telefone, e-mail e endereço.');
  return c;
}
function cpf(value){const s=String(value||'').replace(/\D/g,'');if(!/^\d{11}$/.test(s))fail('Informe um CPF com 11 números.');return s;}
export function providerBody(input,cart,customer,externalReference){
  let payment,payer={email:input.method==='cartao'?'test@testuser.com':'test_user_br@testuser.com'};
  if(input.method==='cartao'){
    const card=input.card||{};
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(card.token||'')||!['credit_card','debit_card'].includes(card.type)||!/^[a-zA-Z0-9_-]{1,60}$/.test(card.id||'')||!Number.isInteger(card.installments)||card.installments<1||card.installments>12)fail('Confira os dados do cartão no formulário do Mercado Pago.');
    payer.identification={type:'CPF',number:cpf(card.identification?.number)};
    payment={amount:money(cart.total),payment_method:{id:card.id,type:card.type,token:card.token,installments:card.installments}};
  }else if(input.method==='pix')payment={amount:money(cart.total),payment_method:{id:'pix',type:'bank_transfer'},expiration_time:'PT30M'};
  else if(input.method==='boleto'){
    const names=customer.nome.split(/\s+/);payer={...payer,first_name:names.shift(),last_name:names.join(' ')||customer.nome,identification:{type:'CPF',number:cpf(input.cpf)},address:{zip_code:customer.cep,street_name:customer.logradouro,street_number:customer.numero,neighborhood:customer.bairro,city:customer.cidade,state:customer.uf}};
    payment={amount:money(cart.total),payment_method:{id:'boleto',type:'ticket'},expiration_time:'P3D'};
  }else fail('Escolha Pix, cartão ou boleto.');
  return {type:'online',processing_mode:'automatic',external_reference:externalReference,total_amount:money(cart.total),payer,transactions:{payments:[payment]}};
}
export function safeTicketUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&['www.mercadopago.com.br','mercadopago.com.br','www.mercadopago.com','mercadopago.com'].includes(u.hostname)?u.href:null;}catch{return null;}}
export function normalizeOrder(data,expected){
  if(!ORD.test(data.id||'')||data.id!==expected.id||data.external_reference!==expected.reference||cents(data.total_amount)!==expected.total||String(data.user_id)!==expected.seller||data.country_code!=='BRA'||data.type!=='online')fail('Não foi possível validar o pedido recebido.',502,'invalid_provider_response');
  const payments=data.transactions?.payments;if(!Array.isArray(payments)||payments.length!==1||cents(payments[0].amount)!==expected.total)fail('Não foi possível validar o valor do pagamento.',502);
  const p=payments[0],m=p.payment_method||{};
  // QR generation, a callback or a URL never proves settlement.
  const approved=data.status==='processed'&&data.status_detail==='accredited'&&p.status==='processed'&&p.status_detail==='accredited'&&cents(data.total_paid_amount)===expected.total;
  const rejected=['failed','canceled','cancelled','expired'].includes(data.status)||['failed','canceled','cancelled','expired'].includes(p.status);
  const refunded=['refunded','charged_back'].includes(data.status)||['refunded','charged_back'].includes(p.status);
  const state=refunded?'refunded':approved?'approved':rejected?'rejected':'pending';
  const qr=typeof m.qr_code==='string'&&m.qr_code.length<=6000?m.qr_code:null;
  const image=typeof m.qr_code_base64==='string'&&m.qr_code_base64.length<500000&&/^[a-zA-Z0-9+/=\r\n]+$/.test(m.qr_code_base64)?m.qr_code_base64:null;
  const line=typeof m.digitable_line==='string'&&/^[\d .-]{30,100}$/.test(m.digitable_line)?m.digitable_line:null;
  return {orderId:data.id,state,totalCents:expected.total,method:expected.method,qrCode:qr,qrImage:image,ticketUrl:safeTicketUrl(m.ticket_url),digitableLine:line};
}
async function provider(path,env,options,fetcher){
  let response;try{response=await fetcher('https://api.mercadopago.com/v1/orders'+path,{...options,headers:{authorization:'Bearer '+env.MERCADO_PAGO_ACCESS_TOKEN,'content-type':'application/json',...options.headers},signal:AbortSignal.timeout(12000)});}catch{fail('A resposta demorou. Tente consultar ou repetir o mesmo pagamento.',503,'provider_unavailable');}
  let data;try{data=await response.json();}catch{fail('O Mercado Pago não respondeu. Tente novamente.',503,'provider_unavailable');}
  if(!response.ok){
    // Neither credentials, card tokens, payer data nor full provider errors enter logs.
    console.error('mercado_pago_orders_http',response.status);
    if([401,403].includes(response.status))fail('As credenciais de teste não foram aceitas pela API Orders. Confira as credenciais de Testes da aplicação.',503,'credentials_rejected');
    if(response.status===429)fail('Aguarde um instante antes de tentar novamente.',429,'provider_rate_limit');
    if(response.status===409)fail('Este pagamento já foi enviado ou foi alterado. Consulte o pedido antes de tentar novamente.',409,'idempotency_conflict');
    if(response.status>=500)fail('O Mercado Pago está indisponível. Repita o mesmo pagamento em instantes.',503,'provider_unavailable');
    fail('O Mercado Pago recusou os dados de teste. Confira o cartão, CPF e configuração da aplicação.',422,'provider_validation');
  }return data;
}
const recent=new Map();
function throttle(owner,now){const key=owner+':'+Math.floor(now/60000),n=(recent.get(key)||0)+1;recent.set(key,n);if(recent.size>1000)for(const k of recent.keys())if(!k.endsWith(':'+Math.floor(now/60000)))recent.delete(k);if(n>20)fail('Aguarde um instante antes de tentar novamente.',429);}
export async function handle(request,env,{fetcher=fetch,now=Date.now()}={}){
  try{
    const action=new URL(request.url).pathname.split('/').at(-1),config=configuration(env);
    if(action==='config'){
      if(request.method!=='GET')return json({error:'Método inválido.'},405,{allow:'GET'});
      let cookie={};if(config.enabled&&!request.headers.get('cookie')?.match(/(?:^|;\s*)sl_checkout_session=[a-f0-9]{64}(?:;|$)/))cookie={'set-cookie':'sl_checkout_session='+randomBytes(32).toString('hex')+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800'};
      return json(config,200,cookie);
    }
    if(!config.enabled)fail('Pagamentos disponíveis apenas na prévia com credenciais de teste.',503,'checkout_disabled');
    if(request.method!=='POST')return json({error:'Método inválido.'},405,{allow:'POST'});
    sameOrigin(request);const owner=ownerOf(request,env);throttle(owner,now);const input=await readBody(request);
    if(action==='quote'){
      const cart=canonicalCart(input),cep=String(input.cep||'').replace(/\D/g,'');if(!/^\d{8}$/.test(cep))fail('Informe um CEP com 8 números.');
      const expiresAt=now+600000,quoteId=seal(env,{kind:'quote',owner,cart,cep,expiresAt});
      return json({quoteId,expiresAt,options:[{id:'sandbox',name:'Entrega simulada · sem postagem',priceCents:0,days:null}],totalCents:cart.total,sandbox:true});
    }
    if(action==='order'){
      if(!UUID.test(input.requestKey||''))fail('Identificação do pedido inválida.');
      const cart=canonicalCart(input),customer=customerData(input.customer),quote=unseal(env,input.quoteId,'quote',owner,now);
      if(JSON.stringify(cart)!==JSON.stringify(quote.cart)||customer.cep!==quote.cep||input.serviceId!=='sandbox')fail('A sacola ou endereço mudou. Atualize a entrega.',409);
      const key=mac(env,'attempt:'+owner+':'+input.requestKey),reference='sl_test_'+key.slice(0,40),body=providerBody(input,cart,customer,reference);
      const data=await provider('',env,{method:'POST',headers:{'X-Idempotency-Key':key},body:JSON.stringify(body)},fetcher);
      const expected={id:data.id,reference,total:cart.total,seller:String(data.user_id||''),method:input.method};
      if(!/^\d+$/.test(expected.seller))fail('Não foi possível validar o vendedor.',502);
      const result=normalizeOrder(data,expected),receipt=seal(env,{kind:'order',owner,...expected,expiresAt:now+604800000});
      return json({...result,receipt,sandbox:true});
    }
    if(action==='status'){
      const expected=unseal(env,input.receipt,'order',owner,now);if(!ORD.test(expected.id))fail('Pedido inválido.');
      const data=await provider('/'+expected.id,env,{method:'GET'},fetcher);return json({...normalizeOrder(data,expected),receipt:input.receipt,sandbox:true});
    }
    return json({error:'Rota não encontrada.'},404);
  }catch(error){return json({error:error.status?error.message:'Não foi possível concluir. Tente novamente.',code:error.code||'server_error'},error.status||500);}
}
