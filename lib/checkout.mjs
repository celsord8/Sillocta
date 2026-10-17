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
  // Orders test keys use APP_USR too. Eligibility is not proof of sandbox:
  // handle verifies the token's test-user identity before exposing this config
  // or creating/reading an order. The official domain is a presentation too;
  // both hosted environments still reject every non-test seller.
  const enabled=['preview','production'].includes(env.VERCEL_ENV)&&/^APP_USR-/.test(env.MERCADO_PAGO_ACCESS_TOKEN||'')&&/^APP_USR-/.test(env.MERCADO_PAGO_PUBLIC_KEY||'');
  return {enabled,integration:'orders',sandbox:true,shippingEnabled:enabled,publicKey:enabled?env.MERCADO_PAGO_PUBLIC_KEY:undefined,freeShippingThreshold:29900,shippingSimulation:!env.MELHOR_ENVIO_TOKEN,packagingEstimated:!!env.MELHOR_ENVIO_TOKEN};
}
// Provisional packed-decant model, explicitly requested for Preview. These are
// package estimates, not measured SKU dimensions. Never purchase labels here.
export function shippingPackages(cart){
  const count=cart.items.reduce((n,i)=>n+i.quantity,0);
  if(count>960)fail('Para esta quantidade, solicite uma cotação ao atendimento.',422,'shipping_capacity');
  const volumes=[];let remaining=count,remainingInsurance=cart.subtotal-cart.discount;
  while(remaining){
    const units=Math.min(remaining,48),[length,width,height,boxGrams]=units<=6?[16,11,6,100]:units<=18?[20,15,10,150]:[25,20,15,250];
    const insurance=remaining===units?remainingInsurance:Math.round((cart.subtotal-cart.discount)*units/count);
    volumes.push({length,width,height,weight:(boxGrams+units*30)/1000,insurance:insurance/100});
    remaining-=units;remainingInsurance-=insurance;
  }
  return volumes;
}
export function shippingOptions(data,cart){
  if(!Array.isArray(data))fail('O serviço de entrega retornou uma resposta inválida.',502,'shipping_invalid_response');
  const unique=new Map();
  for(const service of data){
    if(!service||service.error||!/^[0-9]{1,6}$/.test(String(service.id)))continue;
    const priceCents=cents(service.custom_price??service.price),range=service.custom_delivery_range??service.delivery_range;
    const days=Number(service.custom_delivery_time??service.delivery_time),min=Number(range?.min??days),max=Number(range?.max??days);
    if(priceCents===null||priceCents<=0||!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<min||max>180)continue;
    const carrier=String(service.company?.name||'').trim().slice(0,60),name=String(service.name||'').trim().slice(0,80);if(!carrier||!name)continue;
    const id='me-'+service.id;
    unique.set(id,{id,name:carrier+' · '+name,carrier,priceCents,carrierPriceCents:priceCents,daysRange:[min,max],demo:false,packagingEstimated:true});
  }
  const options=[...unique.values()].sort((a,b)=>a.priceCents-b.priceCents||a.daysRange[1]-b.daysRange[1]).slice(0,8);
  if(!options.length)fail('Não há entrega disponível para este CEP. Confira o endereço ou fale com o atendimento.',422,'shipping_unavailable');
  if(cart.subtotal>=29900)options[0]={...options[0],priceCents:0,freeShipping:true};
  return options;
}
async function shippingRequest(path,env,options,fetcher){
  const {userAgent,...requestOptions}=options;
  let response,data;
  try{response=await fetcher('https://melhorenvio.com.br/api/v2/me'+path,{...requestOptions,headers:{accept:'application/json','content-type':'application/json',authorization:'Bearer '+env.MELHOR_ENVIO_TOKEN,'User-Agent':userAgent||'Sillocta (https://sillocta.vercel.app)'},signal:AbortSignal.timeout(path===''?4000:10000)});data=await response.json();}
  catch{fail('Não foi possível consultar o Melhor Envio agora. Tente recalcular a entrega.',503,'shipping_unavailable');}
  if(!response.ok){
    if([401,403].includes(response.status))fail('O acesso ao Melhor Envio precisa ser conferido. Fale com o atendimento.',503,'shipping_credentials');
    if(response.status===429)fail('Aguarde um instante e recalcule a entrega.',429,'shipping_rate_limit');
    fail('Não foi possível cotar a entrega para este endereço. Confira o CEP e tente novamente.',response.status>=500?503:422,'shipping_unavailable');
  }
  return data;
}
const shippingContacts=new Map();
async function carrierDelivery(cart,cep,env,fetcher,now){
  const origin=String(env.SHIPPING_ORIGIN_CEP||'').replace(/\D/g,'');if(!/^\d{8}$/.test(origin))fail('O CEP de origem da entrega precisa ser configurado.',503,'shipping_configuration');
  const volumes=shippingPackages(cart);
  let email=String(env.MELHOR_ENVIO_CONTACT_EMAIL||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    const key=mac(env,env.MELHOR_ENVIO_TOKEN),cached=shippingContacts.get(key);
    if(cached&&cached.expiresAt>now)email=cached.email;
    else{
      // The registered account email is used only in the provider's required
      // contact header. No account data, email or token enters public responses.
      const account=await shippingRequest('',env,{method:'GET'},fetcher);email=String(account?.email||'');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Configure o e-mail de contato da integração de frete.',503,'shipping_configuration');
      if(shippingContacts.size>20)shippingContacts.clear();shippingContacts.set(key,{email,expiresAt:now+600000});
    }
  }
  const data=await shippingRequest('/shipment/calculate',env,{method:'POST',userAgent:'Sillocta ('+email+')',body:JSON.stringify({from:{postal_code:origin},to:{postal_code:cep},volumes,options:{receipt:false,own_hand:false}})},fetcher);
  return shippingOptions(data,cart);
}
// Preview delivery choices exercise selection and totals; no carrier quote or
// dispatch is implied. Keep the demonstration policy authoritative on server.
export function previewDelivery(cart){
  return [
    {id:'sandbox',name:'Entrega padrão',priceCents:cart.subtotal>=29900?0:1990,daysRange:[5,8],demo:true},
    {id:'sandbox-express',name:'Entrega expressa',priceCents:2990,daysRange:[2,4],demo:true}
  ];
}
async function sandboxSeller(env,fetcher){
  let response,data;
  try{
    response=await fetcher('https://api.mercadolibre.com/users/me',{method:'GET',headers:{authorization:'Bearer '+env.MERCADO_PAGO_ACCESS_TOKEN},signal:AbortSignal.timeout(12000)});
    data=await response.json();
  }catch{fail('Não foi possível verificar a conta de teste. Tente novamente.',503,'sandbox_unverified');}
  if(!response.ok)fail('As credenciais de teste não puderam ser verificadas. Confira as chaves da seção Teste da aplicação Orders.',503,'credentials_rejected');
  const id=String(data?.id||'');
  if(!/^\d{1,20}$/.test(id)||data.country_id!=='BR'||data.site_id!=='MLB'||!Array.isArray(data.tags)||!data.tags.includes('test_user'))fail('Esta prévia aceita somente uma conta brasileira de teste verificada. Confira as credenciais da seção Teste.',503,'sandbox_required');
  return id;
}
const mac=(env,data)=>createHmac('sha256',env.MERCADO_PAGO_ACCESS_TOKEN).update('sillocta-orders-preview-v1\0'+data).digest('base64url');
function seal(env,claims){const body=Buffer.from(JSON.stringify(claims)).toString('base64url');return body+'.'+mac(env,body);}
function unseal(env,token,kind,owner,now){
  if(typeof token!=='string'||token.length>16000)fail('Reabra a sacola e tente novamente.',401);
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
function providerDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;const date=Date.parse(value);return Number.isFinite(date)?date:null;}
export function normalizeOrder(data,expected){
  if(!ORD.test(data.id||'')||data.id!==expected.id||data.external_reference!==expected.reference||cents(data.total_amount)!==expected.total||String(data.user_id)!==expected.seller||data.country_code!=='BRA'||data.type!=='online')fail('Não foi possível validar o pedido recebido.',502,'invalid_provider_response');
  const payments=data.transactions?.payments;if(!Array.isArray(payments)||payments.length!==1||cents(payments[0].amount)!==expected.total)fail('Não foi possível validar o valor do pagamento.',502);
  const p=payments[0],m=p.payment_method||{};
  // QR generation, a callback or a URL never proves settlement.
  const approved=data.status==='processed'&&data.status_detail==='accredited'&&p.status==='processed'&&p.status_detail==='accredited'&&cents(data.total_paid_amount)===expected.total;
  const expired=data.status==='expired'||p.status==='expired';
  const rejected=['failed','canceled','cancelled'].includes(data.status)||['failed','canceled','cancelled'].includes(p.status);
  const refunded=['refunded','charged_back'].includes(data.status)||['refunded','charged_back'].includes(p.status);
  const state=refunded?'refunded':approved?'approved':expired?'expired':rejected?'rejected':'pending';
  const qr=typeof m.qr_code==='string'&&m.qr_code.length<=6000?m.qr_code:null;
  const image=typeof m.qr_code_base64==='string'&&m.qr_code_base64.length<500000&&/^[a-zA-Z0-9+/=\r\n]+$/.test(m.qr_code_base64)?m.qr_code_base64:null;
  const line=typeof m.digitable_line==='string'&&/^[\d .-]{30,100}$/.test(m.digitable_line)?m.digitable_line:null;
  const paymentExpiresAt=['pix','boleto'].includes(expected.method)?providerDate(p.date_of_expiration)||(Number.isFinite(expected.paymentExpiresAt)?expected.paymentExpiresAt:null):null;
  return {orderId:data.id,state,totalCents:expected.total,method:expected.method,qrCode:qr,qrImage:image,ticketUrl:safeTicketUrl(m.ticket_url),digitableLine:line,paymentExpiresAt,shipping:expected.shipping||null};
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
      if(config.enabled){
        try{await sandboxSeller(env,fetcher);}
        catch(error){return json({...config,enabled:false,shippingEnabled:false,publicKey:undefined,code:error.code||'sandbox_unverified'});}
      }
      let cookie={};if(config.enabled&&!request.headers.get('cookie')?.match(/(?:^|;\s*)sl_checkout_session=[a-f0-9]{64}(?:;|$)/))cookie={'set-cookie':'sl_checkout_session='+randomBytes(32).toString('hex')+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800'};
      return json(config,200,cookie);
    }
    if(!config.enabled)fail('O checkout precisa das credenciais de teste APP_USR da integração Orders.',503,'checkout_disabled');
    if(request.method!=='POST')return json({error:'Método inválido.'},405,{allow:'POST'});
    sameOrigin(request);const owner=ownerOf(request,env);throttle(owner,now);const input=await readBody(request);
    if(action==='quote'){
      const cart=canonicalCart(input),cep=String(input.cep||'').replace(/\D/g,'');if(!/^\d{8}$/.test(cep))fail('Informe um CEP com 8 números.');
      const real=!!env.MELHOR_ENVIO_TOKEN,options=real?await carrierDelivery(cart,cep,env,fetcher,now):previewDelivery(cart),expiresAt=now+600000,quoteId=seal(env,{kind:'quote',owner,cart,cep,options,expiresAt});
      return json({quoteId,expiresAt,options,totalCents:cart.total,sandbox:true,shippingSimulation:!real,packagingEstimated:real,shippingProvider:real?'melhor-envio':'demonstration'});
    }
    if(action==='order'){
      if(!UUID.test(input.requestKey||''))fail('Identificação do pedido inválida.');
      const cart=canonicalCart(input),customer=customerData(input.customer),quote=unseal(env,input.quoteId,'quote',owner,now);
      const shipping=(quote.options||[{id:'sandbox',name:'Entrega de demonstração',priceCents:0,demo:true}]).find(o=>o.id===input.serviceId);
      if(JSON.stringify(cart)!==JSON.stringify(quote.cart)||customer.cep!==quote.cep||!shipping)fail('A sacola, endereço ou entrega mudou. Atualize a entrega.',409);
      const total=cart.total+shipping.priceCents;
      const key=mac(env,'attempt:'+owner+':'+input.requestKey),reference='sl_test_'+key.slice(0,40),body=providerBody(input,{...cart,total},customer,reference);
      const seller=await sandboxSeller(env,fetcher);
      const data=await provider('',env,{method:'POST',headers:{'X-Idempotency-Key':key},body:JSON.stringify(body)},fetcher);
      const expected={id:data.id,reference,total,seller,method:input.method,shipping};
      const result=normalizeOrder(data,expected),receipt=seal(env,{kind:'order',owner,...expected,paymentExpiresAt:result.paymentExpiresAt,expiresAt:now+604800000});
      return json({...result,receipt,sandbox:true,serverTime:now});
    }
    if(action==='status'){
      const expected=unseal(env,input.receipt,'order',owner,now);if(!ORD.test(expected.id))fail('Pedido inválido.');
      if(expected.seller!==await sandboxSeller(env,fetcher))fail('O vendedor do pedido não corresponde à conta de teste.',401,'seller_mismatch');
      const data=await provider('/'+expected.id,env,{method:'GET'},fetcher);return json({...normalizeOrder(data,expected),receipt:input.receipt,sandbox:true,serverTime:now});
    }
    return json({error:'Rota não encontrada.'},404);
  }catch(error){return json({error:error.status?error.message:'Não foi possível concluir. Tente novamente.',code:error.code||'server_error'},error.status||500);}
}
