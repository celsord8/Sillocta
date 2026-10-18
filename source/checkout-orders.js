/* Checkout presentation is independent from payment availability. Card data stays inside Mercado Pago's SDK. */
(function(){
    const state={availability:'loading',rendering:false,config:null,sdk:null,mp:null,controller:null,cardMount:null,tokenizing:false,renderedRegion:null,renderedMethod:null,generation:0,chain:Promise.resolve(),result:null,attempt:null,attemptQuoteExpires:0,poll:null,countdown:null,clockOffset:0,expiryChecked:null};
  const receiptKey='sillocta-orders-test-receipt',uncertainKey='sillocta-orders-test-uncertain',historyKey='sillocta-orders-test-history';
  const securityIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M12 3l7 3v6c0 4-4 7-7 9-3-2-7-5-7-9V6l7-3z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M8.5 12l2.2 2.2 4.8-4.8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function securityInfo(){return '<details class="sl-checkout-security"><summary>'+securityIcon+'<span>Pagamento processado pelo Mercado Pago</span><span class="sl-security-more" aria-hidden="true">+</span></summary><div class="sl-security-content">'+(location.protocol==='https:'?'<p><strong>Conexão HTTPS</strong> · Os dados são transmitidos por uma conexão criptografada.</p>':'')+'<p><strong>Dados do cartão</strong> · Número e código de segurança são enviados pelo formulário seguro do Mercado Pago. A Sillocta recebe um token para processar o pagamento.</p><p><strong>Mercado Pago · PCI DSS</strong> · O processador de pagamentos é certificado neste padrão de segurança. <a href="https://www.mercadopago.com.br/developers/pt/docs/adobe-commerce/resources/security/pci" target="_blank" rel="noopener noreferrer">Consultar documentação do Mercado Pago</a>.</p></div></details>';}
  const disclosures=new Map();
  function optionalFields(container,key,title,hasValue){
    const details=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('div');
    details.className='sl-checkout-optional';details.id='sillocta-optional-'+key;
    summary.innerHTML='<span>'+title+'</span><span class="sl-optional">Opcional</span><span class="sl-disclosure-mark" aria-hidden="true">+</span>';
    const heading=container.querySelector('.sl-checkout-kicker');
    if(heading){summary.id=heading.id;heading.remove();}
    content.className='sl-optional-content';while(container.firstChild)content.appendChild(container.firstChild);
    details.open=!!hasValue||disclosures.get(key)===true;
    details.addEventListener('toggle',()=>{if(details.isConnected)disclosures.set(key,details.open);});
    details.append(summary,content);container.appendChild(details);
    return details;
  }
  function polishCheckoutStructure(payment,address){
    const wrap=byId('cart-items').querySelector('.sl-checkout-wrap');if(!wrap||wrap.dataset.polished)return;
    wrap.dataset.polished='true';
    const field=key=>byId('checkout-'+key).closest('.sl-field');
    const contact=byId('checkout-contact-title').closest('section'),contactGrid=contact.querySelector('.sl-grid');
    contactGrid.classList.add('sl-contact-fields');['nome','email','fone'].forEach(key=>contactGrid.appendChild(field(key)));
    const addressGrid=address.querySelector('.sl-grid');addressGrid.classList.add('sl-address-fields');
    ['cep','logradouro','numero'].forEach(key=>addressGrid.appendChild(field(key)));
    const complement=document.createElement('div');complement.className='sl-address-complement';complement.appendChild(field('complemento'));addressGrid.appendChild(complement);
    optionalFields(complement,'complemento','Adicionar complemento',window._checkout.complemento);
    addressGrid.appendChild(field('bairro'));
    const city=document.createElement('div');city.className='sl-city-fields';city.append(field('cidade'),field('uf'));addressGrid.appendChild(city);
    wrap.querySelectorAll('.sl-field input[required]').forEach(input=>{
      const label=input.closest('.sl-field').querySelector('label'),marker=document.createElement('span');
      marker.className='sl-required';marker.textContent='Obrigatório';label.appendChild(marker);
    });
    ['checkout-contact-title','checkout-address-title','checkout-payment-title'].forEach((id,index)=>{
      const heading=byId(id),number=document.createElement('span');number.className='sl-checkout-step';number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');heading.prepend(number);
    });
    const extras=byId('checkout-extras-title').closest('section'),notes=byId('checkout-observations-title').closest('section');
    optionalFields(extras,'extras','Cupom e presente',window._couponPct||window._giftWrap);extras.classList.add('sl-optional-block');
    optionalFields(notes,'observacoes','Observações do pedido',window._orderObs);notes.classList.add('sl-optional-block');
    wrap.insertBefore(extras,payment);wrap.insertBefore(notes,payment);
    payment.insertBefore(byId('checkout-summary'),byId('sillocta-payment-form'));
    payment.insertBefore(wrap.querySelector('.sl-checkout-actions'),byId('sillocta-checkout-security'));
    installCheckoutConvenience(wrap);
  }
  const originalRender=renderCart,originalSelect=selectCheckoutPayment,originalClose=closeCart;
  window.paymentApi=async function(path,options={}){
    let response;try{response=await fetch('/api/checkout/'+path,{...options,credentials:'same-origin',headers:{'content-type':'application/json',...options.headers},signal:options.signal||AbortSignal.timeout(25000)});}catch{throw Object.assign(Error('A conexão demorou. Seus dados foram mantidos.'),{code:'provider_unavailable'});}
    let data;try{data=await response.json();}catch{throw Object.assign(Error('Não foi possível confirmar a resposta. Repita o mesmo envio.'),{code:'provider_unavailable'});}if(!response.ok)throw Object.assign(Error(data.error||'Não foi possível continuar.'),{code:data.code,status:response.status});return data;
  };
  const stored=key=>{try{return sessionStorage.getItem(key);}catch{return null;}};
  const save=(key,value)=>{try{value?sessionStorage.setItem(key,value):sessionStorage.removeItem(key);}catch{}};
  const draftKey='sillocta-checkout-draft-v1',detailsKey='sillocta-checkout-details-v1';
  const customerKeys=['nome','email','fone','cep','logradouro','numero','complemento','bairro','cidade','uf'];
  const cleanCustomer=value=>Object.fromEntries(customerKeys.filter(key=>typeof value?.[key]==='string').map(key=>[key,value[key].slice(0,150)]));
  function saveDraft(){save(draftKey,JSON.stringify({expires:Date.now()+7200000,customer:cleanCustomer(window._checkout)}));}
  try{const draft=JSON.parse(stored(draftKey)||'null');if(draft?.expires>Date.now())Object.assign(window._checkout,cleanCustomer(draft.customer));else save(draftKey,null);}catch{save(draftKey,null);}
  const originalSync=window.syncCheckoutField;
  if(originalSync)window.syncCheckoutField=function(key,value){originalSync(key,value);saveDraft();};
  function fieldMessage(input){
    if(input.required&&!input.value.trim())return ({nome:'Informe seu nome completo.',email:'Informe seu e-mail.',fone:'Informe seu telefone com DDD.',cep:'Informe seu CEP.',logradouro:'Informe a rua ou avenida.',numero:'Informe o número ou S/N.',bairro:'Informe seu bairro.',cidade:'Informe sua cidade.',uf:'Informe a UF.'})[input.name]||'Preencha este campo.';
    if(input.name==='email'&&input.validity?.typeMismatch)return 'Informe um e-mail válido, como nome@exemplo.com.';
    if(input.name==='fone'&&!/^\d{10,11}$/.test(input.value.replace(/\D/g,'')))return 'Informe o telefone com DDD e 10 ou 11 números.';
    if(input.name==='cep'&&!/^\d{8}$/.test(input.value.replace(/\D/g,'')))return 'Informe um CEP com 8 números.';
    if(input.name==='uf'&&!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(input.value.toUpperCase()))return 'Informe uma UF válida.';
    return '';
  }
  function validateField(input){input.setCustomValidity('');const message=fieldMessage(input);input.setCustomValidity(message);const valid=input.checkValidity();setCheckoutFieldError(input,valid?'':message||'Confira este campo.');return valid;}
  function deliveryTime(option){return option?.daysRange?option.daysRange[0]+' a '+option.daysRange[1]+' dias úteis após a postagem':'Prazo a confirmar';}
  let stickyObserver;
  function syncCompactSummary(){
    const bar=byId('sillocta-compact-summary');if(!bar)return;
    const quote=checkoutQuote(),action=byId(window._checkout.pagamento==='cartao'?'sillocta-card-submit':'checkout-finalize-btn');
    const amount=byId('sillocta-compact-total');if(amount)amount.textContent=brl(quote?quote.totalCents:getTotals().total);
    const label=byId('sillocta-compact-label');if(label)label.textContent=quote?'Total com frete':'Total sem frete';
    const button=byId('sillocta-compact-action');if(button){button.textContent='Continuar';button.disabled=!!(state.tokenizing||paymentFlow.submitting||state.attempt);}
    bar.hidden=!!state.result||!paymentFlow.enabled||!cart.length;
    stickyObserver?.disconnect();
    if(action&&typeof IntersectionObserver==='function'){stickyObserver=new IntersectionObserver(entries=>{bar.classList.toggle('sl-action-visible',entries[0].isIntersecting);},{root:byId('cart-drawer'),threshold:0});stickyObserver.observe(action);}
  }
  function installCheckoutConvenience(wrap){
    const intro=wrap.querySelector('.sl-checkout-intro');intro.insertAdjacentHTML('beforeend','<p class="sl-guest-note">Compra sem cadastro obrigatório.</p>');
    const hints={fone:'Usamos o telefone para assuntos relacionados ao pedido e à entrega.',email:'Confira o e-mail para contato sobre este pedido.'};
    const autofill={nome:'name',email:'email',fone:'tel',cep:'postal-code',logradouro:'address-line1',complemento:'address-line2',cidade:'address-level2',uf:'address-level1'};
    customerKeys.forEach(key=>{const input=byId('checkout-'+key);if(!input)return;if(autofill[key])input.setAttribute('autocomplete','section-sillocta shipping '+autofill[key]);
      input.setAttribute('enterkeyhint',key==='uf'?'done':'next');if(['cep','fone'].includes(key))input.setAttribute('inputmode',key==='fone'?'tel':'numeric');if(key==='email'){input.setAttribute('inputmode','email');input.setAttribute('autocapitalize','none');input.setAttribute('spellcheck','false');}
      input.addEventListener('change',()=>{window.syncCheckoutField(key,input.value);validateField(input);});input.addEventListener('blur',()=>{if(input.value.trim()||input.getAttribute('aria-invalid')==='true')validateField(input);});
      if(hints[key]){input.insertAdjacentHTML('afterend','<small class="sl-context-help" id="help-'+key+'">'+hints[key]+'</small>');input.setAttribute('aria-describedby',input.getAttribute('aria-describedby')+' help-'+key);}
    });
    if(!byId('sillocta-compact-summary')){
      const bar=document.createElement('div');bar.id='sillocta-compact-summary';bar.className='sl-compact-summary';bar.hidden=true;
      bar.innerHTML='<div><span id="sillocta-compact-label">Total sem frete</span><strong id="sillocta-compact-total"></strong></div><button type="button" id="sillocta-compact-action">Continuar</button>';
      byId('cart-drawer').appendChild(bar);
      byId('sillocta-compact-action').addEventListener('click',()=>{if(!validCustomer())return;const target=byId(window._checkout.pagamento==='cartao'?'sillocta-card-submit':'checkout-finalize-btn');const region=byId('checkout-payment-title');(target&&!target.disabled?target:region)?.scrollIntoView({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target?.focus({preventScroll:true});});
    }
    const drawer=byId('cart-drawer');if(!drawer.dataset.convenience){drawer.dataset.convenience='true';const update=()=>{const active=document.activeElement;drawer.classList.toggle('sl-editing',!!active?.closest?.('#cart-drawer')&&active.matches('input,textarea,select,iframe,[contenteditable="true"]'));};drawer.addEventListener('focusin',update);drawer.addEventListener('focusout',()=>setTimeout(update,0));}
    syncCompactSummary();
  }
  function captureDetails(){return {customer:cleanCustomer(window._checkout),items:cart.map(i=>({name:String(i.nome||'').slice(0,150),brand:String(i.marca||'').slice(0,100),volume:String(i.vol||''),quantity:i.qty})),shipping:paymentFlow.quote?.options?.find(o=>o.id===paymentFlow.selected)||null};}
  function orderDetails(result){
    let saved;try{saved=JSON.parse(stored(detailsKey)||'null');}catch{}
    const detail=saved?.receipt===result.receipt&&saved.expires>Date.now()&&Array.isArray(saved.detail?.items)?saved.detail:null;
    const customer=detail?.customer;
    return '<dl class="sl-receipt-overview"><div><dt>Número do pedido</dt><dd>'+escapeHtml(result.orderId)+'</dd></div><div><dt>Pagamento</dt><dd>'+({pix:'Pix',cartao:'Cartão',boleto:'Boleto'}[result.method]||'Pagamento')+'</dd></div></dl>'+(detail?'<details class="sl-result-details"><summary>Itens e endereço de entrega</summary><ul class="sl-receipt-items">'+detail.items.map(i=>'<li>'+escapeHtml(i.quantity+' × '+i.brand+' '+i.name+' · '+i.volume.replace('ML',' ml'))+'</li>').join('')+'</ul>'+(customer?'<p><strong>Destinatário</strong><br>'+escapeHtml(customer.nome||'')+'</p><p><strong>Endereço</strong><br>'+escapeHtml([customer.logradouro,customer.numero,customer.complemento,customer.bairro,customer.cidade,customer.uf,customer.cep].filter(Boolean).join(' · '))+'</p>':'')+(detail.shipping?'<p><strong>'+escapeHtml(detail.shipping.name)+'</strong><br>'+escapeHtml(deliveryTime(detail.shipping))+'</p>':'')+'</details>':'');
  }
  function previousTests(){try{const entries=JSON.parse(stored(historyKey)||'[]');return Array.isArray(entries)?entries.filter(r=>typeof r.receipt==='string'&&typeof r.orderId==='string'):[];}catch{return [];}}
  function rememberTest(result){
    if(!result?.receipt)return true;
    try{const entries=previousTests().filter(r=>r.receipt!==result.receipt);entries.push({receipt:result.receipt,orderId:result.orderId,method:result.method});sessionStorage.setItem(historyKey,JSON.stringify(entries));return true;}catch{error('Não foi possível guardar a consulta do pedido anterior. Consulte esse pagamento antes de iniciar outro pedido.');return false;}
  }
  const error=message=>{if(byId('checkout-error'))byId('checkout-error').textContent=message;if(byId('sillocta-result-feedback'))byId('sillocta-result-feedback').textContent=message;if(window._checkout.pagamento==='cartao'&&byId('sillocta-card-feedback'))byId('sillocta-card-feedback').textContent=message;};
  function acceptResult(result){
    const previous=state.result;
    // A status response may omit already issued instructions. Preserve them only
    // for the same authenticated order, never across a new order or method.
    if(previous?.receipt===result.receipt&&previous.orderId===result.orderId&&previous.method===result.method&&previous.totalCents===result.totalCents&&result.state==='pending'){
      result={...result};
      for(const key of ['digitableLine','ticketUrl','qrCode','qrImage','paymentExpiresAt'])if(result[key]==null&&previous[key]!=null)result[key]=previous[key];
    }
    state.result=result;if(Number.isFinite(result.serverTime))state.clockOffset=result.serverTime-Date.now();
  }
  function checkoutQuote(){
    const quote=paymentFlow.quote;if(!quote||quote.expiresAt<=Date.now())return null;
    const options=quote.options;
    if(!Array.isArray(options))return {...quote,serviceId:'sandbox'}; // Earlier Preview quotes.
    const chosen=options.find(o=>o.id===paymentFlow.selected);if(!chosen)return null;
    return {...quote,serviceId:chosen.id,totalCents:quote.totalCents+chosen.priceCents};
  }
  function paymentStage(active){
    const drawer=byId('cart-drawer'),region=byId('sillocta-payment-result');
    const entering=active&&!drawer?.classList.contains('sl-payment-stage');
    drawer?.classList.toggle('sl-payment-stage',active);
    drawer?.setAttribute('aria-label',active?'Pagamento do pedido':'Sua sacola');
    const heading=byId('cart-drawer-head')?.querySelector('p');if(heading)heading.textContent=active?'Pagamento':'Sua Sacola';
    if(entering&&region){
      region.setAttribute('tabindex','-1');region.focus({preventScroll:true});
      // A separate payment stage replaces scrolling past the address form.
      // Reset both possible scroll containers synchronously, including Safari.
      if(drawer)drawer.scrollTop=0;if(byId('cart-items'))byId('cart-items').scrollTop=0;
    }
  }
  window.selectPaymentShipping=function(id){
    if(state.result||state.tokenizing||paymentFlow.submitting||state.attempt||stored(uncertainKey)){error('Conclua a consulta do pagamento antes de alterar a entrega.');return;}
    if(!paymentFlow.quote?.options?.some(o=>o.id===id))return;
    paymentFlow.selected=id;error('');renderPaymentShipping();
  };
  function syncCardAction(){
    const button=byId('sillocta-card-submit');if(!button||window._checkout.pagamento!=='cartao')return;
    button.hidden=!!state.result;button.disabled=state.tokenizing||paymentFlow.submitting||!state.controller;
    button.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i><span>'+(paymentFlow.submitting?'Enviando pagamento…':state.tokenizing?'Validando cartão…':state.controller?'Pagar com cartão':!paymentFlow.quote?'Informe o CEP para continuar':'Aguardando formulário do cartão')+'</span>';
  }
  function validCustomer(){
    let first=null;for(const input of document.querySelectorAll('#cart-items input[oninput*="syncCheckoutField"]')){
      if(window._checkout[input.name]!==input.value.trim())window.syncCheckoutField(input.name,input.value.trim());
      if(!validateField(input)&&!first)first=input;
    }
    if(first){error('Confira os campos indicados para continuar.');first.focus({preventScroll:true});first.scrollIntoView({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return false;}saveDraft();return true;
  }
  function disposeCard(){
    state.generation++;const old=state.controller;state.controller=null;state.cardMount=null;
    if(old)state.chain=state.chain.then(()=>old.unmount()).catch(()=>{});
    syncCardAction();
  }
  window.renderCart=function(){disposeCard();state.rendering=true;try{originalRender();syncCompactSummary();}finally{state.rendering=false;}};
  window.closeCart=function(){saveDraft();disposeCard();stickyObserver?.disconnect();clearTimeout(state.countdown);return originalClose();};
  window.selectCheckoutPayment=function(mode){if(state.tokenizing){error('Aguarde a validação do cartão.');return false;}if(paymentFlow.submitting||state.attempt&&!state.result){error('Consulte ou repita o pagamento enviado antes de trocar a forma de pagamento.');return false;}if(state.result){if(!state.rendering)error('Este pedido já foi criado. Use “Iniciar outro pedido” para escolher outra forma de pagamento.');return false;}if(!['pix','cartao','boleto'].includes(mode))return false;if(paymentFlow.enabled&&state.renderedRegion===byId('sillocta-payment-form')&&state.renderedMethod===mode)return false;error('');originalSelect(mode);if(paymentFlow.enabled)renderMethod();return false;};
  function cardTimeout(promise,message='O formulário de cartão demorou a carregar. Tente novamente.'){let timer;return Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error(message),{code:'card_timeout'})),20000);})]).finally(()=>clearTimeout(timer));}
  function loadSdk(){
    if(state.sdk)return state.sdk;
    let script;
    const pending=cardTimeout(new Promise((resolve,reject)=>{if(window.MercadoPago)return resolve();script=document.createElement('script');script.src='https://sdk.mercadopago.com/js/v2';script.onload=()=>window.MercadoPago?resolve():reject(Error('O formulário não carregou.'));script.onerror=()=>{console.warn('sillocta_card_initialization','sdk_load_failed');reject(Error('Não foi possível carregar o formulário de cartão.'));};document.head.appendChild(script);}));
    state.sdk=pending;
    pending.catch(()=>{if(state.sdk===pending)state.sdk=null;script?.remove();}).finally(()=>{if(script){script.onload=null;script.onerror=null;}});return pending;
  }
  function cardFailure(container,generation,message){
    if(generation!==state.generation||!container.isConnected)return;
    disposeCard();container.innerHTML='<p class="sl-field-note" role="status">'+escapeHtml(message)+'</p><button type="button" class="sl-cta-secondary" id="sillocta-card-retry">Tentar carregar cartão novamente</button>';
    byId('sillocta-card-retry')?.addEventListener('click',()=>{error('');mountCard();});error(message);
  }
  async function mountCard(){
    const container=byId('sillocta-card-payment'),quote=checkoutQuote();
    if(!container)return;
    const quoteId=quote?quote.quoteId+':'+quote.serviceId:null;
    if(state.cardMount?.container===container&&state.cardMount.quoteId===quoteId)return;
    disposeCard();const generation=state.generation;
    if(state.result||state.attempt||stored(uncertainKey)){container.innerHTML='<p class="sl-field-note" role="status">Consulte o pedido enviado antes de iniciar outro pedido.</p>';return;}
    if(!quoteId){container.innerHTML='<p class="sl-field-note" role="status">'+(paymentFlow.busy?'Calculando o total para abrir o formulário seguro…':'Informe o CEP e escolha a entrega para abrir o formulário de cartão.')+'</p>';return;}
    state.cardMount={container,quoteId};
    const amount=quote.totalCents/100;
    container.innerHTML='<p class="sl-field-note" role="status">Carregando formulário seguro…</p>';
    try{
      await loadSdk();await cardTimeout(state.chain);if(generation!==state.generation||!container.isConnected)return;
      container.innerHTML='';const mp=state.mp||(state.mp=new MercadoPago(state.config.publicKey,{locale:'pt-BR'}));
      const creation=mp.bricks().create('cardPayment','sillocta-card-payment',{
        initialization:{amount,payer:{email:'test@testuser.com'}},
        customization:{visual:{hidePaymentButton:true,style:{theme:'dark',customVariables:{formBackgroundColor:'#100f0d',inputBackgroundColor:'#0c0b0a',textPrimaryColor:'#eee6d8',textSecondaryColor:'#bcb3a5',baseColor:'#cbb477',baseColorFirstVariant:'#ddc791',baseColorSecondVariant:'#a48a51',outlinePrimaryColor:'#5b5241',outlineSecondaryColor:'#cbb477',errorColor:'#e5a49b',successColor:'#b9c7a3',buttonTextColor:'#18140c',borderRadiusSmall:'4px',borderRadiusMedium:'6px',borderRadiusLarge:'6px',formPadding:'18px',inputFocusedBoxShadow:'0 0 0 1px #cbb477'}}},paymentMethods:{maxInstallments:12,types:{included:['credit_card','debit_card']}}},
        callbacks:{onReady:()=>{},onSubmit:(formData,additionalData)=>generation===state.generation&&container.isConnected?submitCard({formData,additionalData}):Promise.resolve(),onError:detail=>{if(generation!==state.generation)return;const codes=['fields_setup_failed','fields_setup_failed_after_3_tries','get_chunk_failed','get_payment_methods_failed','get_identification_types_failed','incorrect_initialization','missing_container_id','missing_amount_property','missing_locale_property','missing_required_callbacks','settings_empty','incomplete_fields','card_token_creation_failed','secure_fields_card_token_creation_failed'];const code=codes.includes(detail?.cause)?detail.cause:'unknown';console.warn('sillocta_card_initialization',code);if(detail?.type==='non_critical')error('Confira os campos indicados no formulário de cartão.');else cardFailure(container,generation,'Não foi possível inicializar o formulário de cartão. Tente carregá-lo novamente.');}}
      }).then(async controller=>{if(controller&&(generation!==state.generation||!container.isConnected)){await controller.unmount();return null;}return controller;});
      state.chain=creation.then(()=>{}).catch(()=>{});
      const controller=await cardTimeout(creation);
      if(!controller){if(generation!==state.generation)return;throw Error('Não foi possível inicializar o formulário de cartão. Tente carregá-lo novamente.');}
      if(generation!==state.generation||!container.isConnected){await controller.unmount();return;}state.controller=controller;syncCardAction();
    }catch(e){cardFailure(container,generation,e.message||'Não foi possível carregar o formulário de cartão.');}
  }
  function renderMethod(){
    if(!paymentFlow.enabled)return;const region=byId('sillocta-payment-form');if(!region)return;
    disposeCard();const mode=window._checkout.pagamento||'pix',button=byId('checkout-finalize-btn');state.renderedRegion=region;state.renderedMethod=mode;
    if(state.result){originalSelect(state.result.method);region.innerHTML='<p class="sl-field-note">Este pedido de '+({pix:'Pix',boleto:'boleto',cartao:'cartão'}[state.result.method]||'pagamento')+' já foi criado. Para escolher outra forma de pagamento, toque em “Iniciar outro pedido”. A consulta deste pedido será mantida.</p>';if(button)button.hidden=true;renderResult();return;}
    region.innerHTML=mode==='cartao'?'<div id="sillocta-card-payment"></div><button type="button" id="sillocta-card-submit" class="sl-cta sl-checkout-primary" disabled aria-describedby="sillocta-card-note"><span>Aguardando formulário do cartão</span></button><p id="sillocta-card-feedback" class="sl-error" role="alert"></p><p id="sillocta-card-note" class="sl-field-note">Preencha os dados do cartão e toque em “Pagar com cartão”.</p>':mode==='boleto'?'<div class="sl-field"><label class="sl-label" for="sillocta-cpf">CPF<span class="sl-required">Obrigatório</span></label><input required id="sillocta-cpf" class="sl-input" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="123.456.789-09" value="'+escapeHtml(window._checkout.cpf||'')+'"><p class="sl-field-note">Você poderá abrir o boleto ou copiar a linha digitável após confirmar os dados.</p></div>':'<p class="sl-field-note">Após confirmar os dados, use o QR Code ou o Pix copia e cola. A confirmação aparece aqui automaticamente.</p>';
    const cpf=byId('sillocta-cpf');if(cpf){cpf.name='cpf';cpf.setAttribute('aria-describedby','field-error-cpf sillocta-cpf-help');cpf.insertAdjacentHTML?.('afterend','<span id="field-error-cpf" class="sl-field-error" hidden></span><small id="sillocta-cpf-help" class="sl-context-help">O CPF do pagador é necessário para emitir o boleto.</small>');cpf.addEventListener('input',e=>{window._checkout.cpf=e.target.value;setCheckoutFieldError(cpf,'');});}
    if(button){button.hidden=mode==='cartao'||!!state.result;button.disabled=paymentFlow.submitting||!!state.attempt;button.onclick=()=>submitOnlineOrder();button.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i><span>'+ (paymentFlow.submitting?'Enviando pagamento…':mode==='boleto'?'Gerar boleto':'Gerar Pix')+'</span>';}
    if(byId('sillocta-card-submit')){byId('sillocta-card-submit').onclick=()=>submitOnlineOrder();byId('sillocta-card-feedback').textContent=byId('checkout-error')?.textContent||'';}
    if(mode==='cartao'){mountCard();syncCardAction();}renderResult();syncCompactSummary();
    if(region.animate&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)region.animate([{opacity:.45},{opacity:1}],{duration:160,easing:'ease-out'});
  }
  window.updatePaymentCheckout=function(){
    if(!cart.length)return;
    byId('cart-drawer')?.classList.add('sl-orders-checkout');
    const intro=byId('cart-items').querySelector('.sl-checkout-service');intro.innerHTML=securityIcon+'<span>Finalização do pedido</span>';
    const payment=byId('checkout-payment-title').closest('section');payment.querySelector('.sl-field-note').textContent='Selecione a forma de pagamento para continuar.';
    const choices={pix:['qrcode','Pix','QR Code ou copia e cola'],cartao:['card','Cartão','Crédito e débito'],boleto:['barcode','Boleto','Código para pagamento']},grid=payment.querySelector('.sl-pay-grid');
    grid.setAttribute('aria-label','Forma de pagamento');
    grid.innerHTML=Object.entries(choices).map(([mode,[icon,label,description]])=>'<button type="button" onclick="selectCheckoutPayment(\''+mode+'\')" class="sl-pay-btn sl-pay-action '+(window._checkout.pagamento===mode?'is-on':'')+'" data-pay="'+mode+'" aria-label="'+label+'" aria-describedby="sillocta-pay-description-'+mode+'" aria-pressed="'+(window._checkout.pagamento===mode)+'"'+(!paymentFlow.enabled?' disabled':'')+'><span class="sl-option-check" aria-hidden="true">✓</span>'+checkoutControlIcon(icon)+'<span class="sl-payment-choice-copy"><span class="sl-payment-choice-name">'+label+'</span><small id="sillocta-pay-description-'+mode+'">'+description+'</small></span></button>').join('');
    if(!byId('sillocta-payment-form'))payment.insertAdjacentHTML('beforeend','<div id="sillocta-payment-form" class="sl-payment-form"></div><div id="sillocta-payment-result" class="sl-payment-result" aria-live="polite"></div>');
    if(!byId('sillocta-checkout-security'))payment.insertAdjacentHTML('beforeend','<div id="sillocta-checkout-security">'+(paymentFlow.enabled?securityInfo():'')+'</div>');
    const address=byId('checkout-address-title').closest('section');address.querySelector('.sl-field-note').textContent='Informe seu CEP, confira o endereço e escolha a forma de entrega abaixo.';
    if(!byId('checkout-shipping-options'))address.insertAdjacentHTML('afterend','<section id="checkout-shipping-options" class="sl-checkout-block" aria-label="Forma de entrega"></section>');
    byId('checkout-submit-note').textContent='Seus dados de pagamento são processados pelo Mercado Pago.';
    const email=byId('checkout-email');email.required=true;email.closest('.sl-field').querySelector('.sl-optional')?.remove();
    polishCheckoutStructure(payment,address);
    if(!paymentFlow.enabled){
      const loading=state.availability==='loading',button=byId('checkout-finalize-btn');
      payment.querySelector('.sl-field-note').textContent=loading?'Verificando disponibilidade do pagamento…':'O pagamento online está indisponível no momento. O atendimento pode ajudar a concluir sua compra.';
      byId('sillocta-payment-form').innerHTML='';
      address.querySelector('.sl-field-note').textContent='Confira seu endereço. As condições de entrega serão confirmadas pelo atendimento.';
      byId('sillocta-checkout-security').innerHTML='<details class="sl-checkout-security"><summary>'+securityIcon+'<span>Conexão criptografada por HTTPS</span><span class="sl-security-more" aria-hidden="true">+</span></summary><div class="sl-security-content"><p>Seus dados são transmitidos por uma conexão criptografada. Nenhum dado de cartão é solicitado enquanto o pagamento online estiver indisponível.</p></div></details>';
      byId('checkout-shipping-options').innerHTML='<h2 class="sl-checkout-kicker">Forma de entrega</h2><p class="sl-field-note">Consulte as opções e os prazos com o atendimento.</p>';
      button.disabled=loading;button.hidden=false;button.onclick=finalizeOrder;
      button.innerHTML=checkoutControlIcon('whatsapp')+'<span>'+(loading?'Verificando pagamento…':'Continuar com atendimento')+'</span>';
      byId('checkout-submit-note').textContent='Os dados da seleção serão enviados ao WhatsApp. Entrega e pagamento serão confirmados pelo atendimento.';
      const rows=byId('checkout-summary').querySelectorAll('.sl-summary-row');
      rows[rows.length-2].querySelector('strong').textContent='A confirmar';rows[rows.length-1].querySelector('span').textContent='Total sem frete';
      byId('checkout-summary').querySelector('.sl-shipping-note').textContent='O frete será confirmado pelo atendimento antes de concluir a compra.';
      return;
    }
    syncPaymentShipping();renderPaymentShipping();renderMethod();
  };
  window.renderPaymentShipping=function(){
    const region=byId('checkout-shipping-options');if(!region)return;
    const quote=paymentFlow.quote,ready=quote&&quote.expiresAt>Date.now(),options=ready?quote.options||[]:[];
    if(options.length&&!options.some(o=>o.id===paymentFlow.selected))paymentFlow.selected=options[0].id;
    const chosen=options.find(o=>o.id===paymentFlow.selected),total=checkoutQuote();
    region.innerHTML='<h2 class="sl-checkout-kicker">Forma de entrega</h2><p class="sl-field-note" role="status">'+escapeHtml(paymentFlow.busy?'Consultando opções de entrega…':paymentFlow.error|| (ready?'Escolha a melhor opção para você.':'Informe o CEP para consultar as opções.'))+'</p><div class="sl-shipping-options" role="group" aria-label="Selecione a entrega">'+options.map((o,i)=>'<button type="button" id="sillocta-delivery-'+i+'" class="sl-shipping-choice '+(chosen?.id===o.id?'is-on':'')+'" aria-pressed="'+(chosen?.id===o.id)+'"'+(state.result||state.tokenizing||paymentFlow.submitting||state.attempt?' disabled':'')+'><span class="sl-option-check" aria-hidden="true">✓</span><span class="sl-shipping-copy"><strong>'+escapeHtml(o.name)+'</strong><small>'+escapeHtml(o.daysRange?o.daysRange[0]+' a '+o.daysRange[1]+' dias úteis após postagem':'Prazo a confirmar')+'</small></span><strong>'+(o.priceCents?brl(o.priceCents):'Grátis')+'</strong></button>').join('')+'</div>'+(options.length&&paymentFlow.quote?.shippingSimulation===false?'<p class="sl-delivery-preview">Cotação do Melhor Envio com embalagem estimada.</p>':'');
    options.forEach((o,i)=>byId('sillocta-delivery-'+i)?.addEventListener('click',()=>selectPaymentShipping(o.id)));
    region.setAttribute('aria-busy',String(paymentFlow.busy));
    const summary=byId('checkout-summary'),rows=summary?.querySelectorAll('.sl-summary-row');if(rows){rows[rows.length-2].querySelector('strong').textContent=chosen?(chosen.priceCents?brl(chosen.priceCents):'Grátis'):'A calcular';rows[rows.length-1].querySelector('span').textContent=total?'Total':'Total sem frete';byId('checkout-total').textContent=brl(total?total.totalCents:getTotals().total);summary.querySelector('.sl-shipping-note').textContent=chosen?chosen.name+' · '+deliveryTime(chosen)+'.':'O valor da entrega será incluído após a consulta do CEP.';}
    syncCompactSummary();
    if(window._checkout.pagamento==='cartao')mountCard();
  };
  async function submitCard(suppliedData){
    if(state.tokenizing||paymentFlow.submitting||state.result||state.attempt)return;
    if(!validCustomer())return;
    const quote=checkoutQuote();if(!quote){error('Atualize a entrega antes de pagar com cartão.');loadPaymentShipping();return;}
    const controller=state.controller,generation=state.generation;
    if(!controller){error('O formulário seguro do cartão ainda não está disponível. Tente carregá-lo novamente.');return;}
    state.tokenizing=true;error('');syncCardAction();
    try{
      const validationTimeout='A validação do cartão demorou. Confira os dados e tente novamente.';
      const formData=suppliedData?.formData??await cardTimeout(controller.getFormData(),validationTimeout),additionalData=suppliedData?.additionalData??await cardTimeout(controller.getAdditionalData(),validationTimeout);
      if(generation!==state.generation||controller!==state.controller||window._checkout.pagamento!=='cartao')return;
      const current=checkoutQuote();if(current?.quoteId!==quote.quoteId||current?.serviceId!==quote.serviceId||current?.totalCents!==quote.totalCents){error('O total mudou. Confira o valor e tente novamente.');return;}
      if(!formData?.token||!['credit_card','debit_card'].includes(additionalData?.paymentTypeId)){error('Confira os campos do cartão e tente novamente.');return;}
      await submitOnlineOrder({token:formData.token,id:formData.payment_method_id,type:additionalData.paymentTypeId,installments:Number(formData.installments),identification:formData.payer?.identification});
    }catch(e){if(generation===state.generation)error(e.code==='card_timeout'?'A validação do cartão demorou. Confira os dados e tente novamente.':'Não foi possível validar o cartão. Confira número, validade, código de segurança e CPF.');}
    finally{state.tokenizing=false;syncCardAction();}
  }
  window.submitOnlineOrder=async function(card){
    if(paymentFlow.submitting||state.result)return;
    if(state.attempt||stored(uncertainKey)){error('Este pagamento já foi enviado. Consulte ou repita o envio antes de iniciar outro pedido.');return;}
    if(!validCustomer())return;
    const quote=checkoutQuote();
    if(!quote){error('Atualize a entrega antes de continuar.');loadPaymentShipping();return;}
    const method=window._checkout.pagamento||'pix';if(method==='cartao'&&!card)return submitCard();
    if(method==='boleto'&&!/^\d{11}$/.test(String(window._checkout.cpf||'').replace(/\D/g,''))){error('Informe um CPF com 11 números.');const input=byId('sillocta-cpf');if(input){setCheckoutFieldError(input,'Informe um CPF com 11 números.');input.focus();}return;}
    state.attempt={...paymentCartData(),customer:{...window._checkout},quoteId:quote.quoteId,serviceId:quote.serviceId,requestKey:crypto.randomUUID(),method,...(card?{card}:{}),cpf:window._checkout.cpf};
    state.attemptDetails=captureDetails();
    state.attemptQuoteExpires=quote.expiresAt;
    await sendAttempt();
  };
  async function sendAttempt(){
    if(!state.attempt||paymentFlow.submitting)return;paymentFlow.submitting=true;save(uncertainKey,'1');error('');renderMethod();
    try{
      // An uncertain attempt must keep its original price and idempotency key.
      // Requoting here could silently change the amount after a lost response.
      if(state.attemptQuoteExpires<Date.now())throw Error('A cotação expirou. Confira este pedido no Mercado Pago antes de iniciar outro pagamento.');
      const result=await paymentApi('order',{method:'POST',body:JSON.stringify(state.attempt)});save(detailsKey,JSON.stringify({receipt:result.receipt,expires:Date.now()+86400000,detail:state.attemptDetails}));acceptResult(result);state.attempt=null;state.attemptDetails=null;save(uncertainKey,null);save(receiptKey,result.receipt);disposeCard();schedulePoll();
    }
    catch(e){error(e.message);if(e.status===400||['credentials_rejected','provider_validation'].includes(e.code)){state.attempt=null;save(uncertainKey,null);}else{disposeCard();}}
    finally{paymentFlow.submitting=false;renderMethod();}
  }
  function schedulePoll(){clearTimeout(state.poll);if(state.result?.state==='pending')state.poll=setTimeout(()=>refreshStatus(),10000);}
  async function refreshStatus(){
    const receipt=state.result?.receipt;if(!receipt)return;
    try{const result=await paymentApi('status',{method:'POST',body:JSON.stringify({receipt})});if(state.result?.receipt!==receipt)return;acceptResult(result);error('');}catch(e){if(state.result?.receipt!==receipt)return;error(e.message);}
    renderResult();schedulePoll();
  }
  async function recoverStatus(){
    const receipt=stored(receiptKey);if(!receipt)return;
    try{acceptResult(await paymentApi('status',{method:'POST',body:JSON.stringify({receipt})}));save(uncertainKey,null);error('');renderMethod();schedulePoll();}catch(e){error(e.message);}
  }
  function resetTest(){if(paymentFlow.submitting||state.attempt||stored(uncertainKey))return;if(!rememberTest(state.result))return;clearTimeout(state.poll);state.result=null;state.attempt=null;save(receiptKey,null);save(uncertainKey,null);error('');renderMethod();}
  function renderResult(){
    clearTimeout(state.countdown);
    const region=byId('sillocta-payment-result');if(!region)return;
    if(!state.result){
      paymentStage(false);
      region.innerHTML=paymentFlow.submitting?'<p role="status">Enviando pagamento…</p>':state.attempt?'<p>Não foi possível confirmar a resposta. Repita o mesmo envio para evitar um pedido duplicado.</p><button type="button" class="sl-cta-secondary" id="sillocta-retry">Repetir o mesmo envio</button>':stored(uncertainKey)?'<p>Há um envio sem resposta desta sessão. Confira o pedido no Mercado Pago antes de iniciar outro pedido.</p>'+(stored(receiptKey)?'<button type="button" class="sl-cta-secondary" id="sillocta-recover">Consultar pedido salvo</button>':''):'';
      byId('sillocta-retry')?.addEventListener('click',sendAttempt);byId('sillocta-recover')?.addEventListener('click',recoverStatus);if(stored(uncertainKey)&&!state.attempt&&!paymentFlow.submitting){const btn=byId('checkout-finalize-btn');if(btn)btn.disabled=true;disposeCard();}return;
    }
    const r=state.result,pix=r.method==='pix',boleto=r.method==='boleto',pending=r.state==='pending',elapsed=pending&&Number.isFinite(r.paymentExpiresAt)&&r.paymentExpiresAt<=Date.now()+state.clockOffset;
    const boletoReady=boleto&&!!(r.digitableLine||r.ticketUrl);
    const labels={approved:'Pagamento aprovado',pending:pix?'Pague com Pix':boleto?(boletoReady?'Seu boleto está pronto':'Boleto em emissão'):'Pagamento em análise',expired:'Prazo de pagamento encerrado',rejected:'Pagamento não aprovado',refunded:'Pagamento estornado'};
    const code=pix?r.qrCode:boleto?r.digitableLine:null;
    const codeField=code?'<label class="sl-label sl-code-label" for="sillocta-payment-code">'+(pix?'Pix copia e cola':'Linha digitável')+'</label><textarea id="sillocta-payment-code" class="sl-textarea sl-payment-code" readonly aria-describedby="sillocta-code-note">'+escapeHtml(code)+'</textarea>':'';
    const copyButton=code?'<button type="button" class="sl-cta-secondary sl-result-primary" id="sillocta-copy-code">'+(pix?'Copiar código Pix':'Copiar linha digitável')+'</button>':'';
    syncCompactSummary();
    region.innerHTML='<div class="sl-result-top"><span class="sl-result-method">'+(pix?'Pix':boleto?'Boleto':'Cartão')+'</span></div><h3 id="sillocta-result-title">'+(elapsed?'Prazo de pagamento encerrado':labels[r.state]||'Pagamento recebido')+'</h3><div class="sl-result-amount"><span>Valor do pedido</span><strong>'+brl(r.totalCents)+'</strong></div>'+
      (pending&&pix&&Number.isFinite(r.paymentExpiresAt)?'<div class="sl-pix-deadline"><span id="sillocta-countdown-label">Este Pix expira em</span><strong id="sillocta-countdown" role="timer" aria-live="off"></strong></div>':'')+
      (pending&&boleto&&Number.isFinite(r.paymentExpiresAt)?'<div class="sl-boleto-due"><span>Vencimento</span><strong>'+escapeHtml(new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeZone:'America/Sao_Paulo'}).format(r.paymentExpiresAt))+'</strong></div>':'')+
      (pending?'<div id="sillocta-payment-instructions"'+(elapsed?' hidden':'')+'>'+
        (boleto?'<p class="sl-result-caption">'+(boletoReady?(code?'Pague pelo aplicativo do banco usando a linha digitável. ':'')+(r.ticketUrl?'Toque em “Abrir boleto” para salvar ou imprimir.':'Salve a linha digitável para pagar dentro do prazo.'): 'O Mercado Pago está preparando o boleto. O código e o link aparecerão aqui automaticamente. Não é necessário gerar outro pedido.')+'</p>':'')+
        (pix&&r.qrImage?'<div class="sl-qr-wrap"><img class="sl-pix-qr" alt="QR Code para pagamento via Pix" src="data:image/png;base64,'+r.qrImage+'"><span>Escaneie pelo aplicativo do banco</span></div>':'')+
        (code?(pix?copyButton+'<details class="sl-pix-code-details"><summary>Ver código Pix</summary>'+codeField+'</details>':codeField+copyButton)+'<p id="sillocta-code-note" class="sl-result-caption">'+(pix?'Copie o código e pague no aplicativo do seu banco. A confirmação será exibida aqui.':'Use a linha digitável na opção de pagamento de boletos do seu banco.')+'</p>':'')+
        (r.ticketUrl?'<a class="sl-cta-secondary '+(boleto&&!code?'sl-result-primary':pix?'sl-result-provider-link':'')+'" href="'+escapeHtml(r.ticketUrl)+'" target="_blank" rel="noopener noreferrer">'+(boleto?'Abrir boleto':pix?'Ver pagamento no Mercado Pago':'Ver pagamento')+'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 3h7v7M21 3l-10 10M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg></a>':'')+
        (boleto?'<p class="sl-result-caption">Após o pagamento, aguardamos a confirmação do banco. Gerar o boleto não confirma o pedido.</p>':'')+'</div>':'')+
      (pending?'<div class="sl-confirmation-status" role="status"><span class="sl-status-dot" aria-hidden="true"></span><span id="sillocta-confirmation-text">'+(elapsed?'O prazo terminou. Estamos conferindo a situação do pagamento.':boleto&&!boletoReady?'Aguardando emissão do boleto':boleto?'Aguardando confirmação do banco':'Aguardando confirmação do pagamento')+'</span></div><button type="button" class="sl-cta-secondary sl-result-check" id="sillocta-refresh">'+(boleto&&!boletoReady?'Consultar emissão do boleto':'Já paguei · verificar')+'</button>':'<p class="sl-result-caption">'+(r.state==='approved'?'Recebemos a confirmação do Mercado Pago.':r.state==='expired'?'Consulte o pedido antes de gerar outro pagamento.':'Confira a situação antes de iniciar outro pagamento.')+'</p>')+
      '<p id="sillocta-result-feedback" class="sl-error" role="alert">'+escapeHtml(byId('checkout-error')?.textContent||'')+'</p>'+orderDetails(r)+'<p class="sl-result-next">'+(r.state==='approved'?'Pagamento confirmado. Guarde o número do pedido para acompanhar o atendimento. O prazo da entrega começa após a postagem.':pending?'Próximo passo: conclua o pagamento e aguarde a confirmação nesta página.':'Consulte a situação deste pedido antes de iniciar outro pagamento.')+'</p><div class="sl-result-footer"><button type="button" class="sl-cta-secondary" id="sillocta-continue">Continuar navegando</button><button type="button" class="sl-cta-secondary" id="sillocta-new-test">Iniciar outro pedido</button>'+(pending?'<p>'+(boleto?'Salve a linha digitável ou o boleto antes de iniciar outro pedido.':'Conclua ou confira este pagamento antes de iniciar outro pedido.')+'</p>':'')+'</div>'+securityInfo();
    byId('sillocta-copy-code')?.addEventListener('click',async()=>{if(r.receipt!==state.result?.receipt)return;if(Number.isFinite(r.paymentExpiresAt)&&r.paymentExpiresAt<=Date.now()+state.clockOffset){error('O prazo deste código terminou. Consulte a situação do pagamento.');return;}try{await navigator.clipboard.writeText(code);if(r.receipt===state.result?.receipt&&byId('sillocta-copy-code'))byId('sillocta-copy-code').textContent='Código copiado ✓';}catch{byId('sillocta-payment-code')?.select();error('Selecione e copie o código.');}});
    byId('sillocta-refresh')?.addEventListener('click',async()=>{const button=byId('sillocta-refresh');button.disabled=true;button.textContent='Verificando…';await refreshStatus();});byId('sillocta-new-test')?.addEventListener('click',resetTest);
    byId('sillocta-continue')?.addEventListener('click',()=>closeCart());
    const button=byId('checkout-finalize-btn');if(button)button.hidden=true;
    if(pending&&pix&&Number.isFinite(r.paymentExpiresAt))updateCountdown();
    paymentStage(true);
  }
  function updateCountdown(){
    clearTimeout(state.countdown);const r=state.result,node=byId('sillocta-countdown');if(!node||r?.state!=='pending'||r.method!=='pix')return;
    const remaining=Math.max(0,Math.ceil((r.paymentExpiresAt-Date.now()-state.clockOffset)/1000));
    node.textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
    if(remaining===0){
      byId('sillocta-payment-instructions').hidden=true;byId('sillocta-result-title').textContent='Prazo de pagamento encerrado';byId('sillocta-countdown-label').textContent='Tempo encerrado';byId('sillocta-confirmation-text').textContent='O prazo terminou. Estamos conferindo a situação do pagamento.';
      if(state.expiryChecked!==r.receipt){state.expiryChecked=r.receipt;refreshStatus();}return;
    }
    state.countdown=setTimeout(updateCountdown,1000);
  }
  (async()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    try{
      state.config=await paymentApi('config');paymentFlow.enabled=state.config.enabled===true&&state.config.integration==='orders';
      state.availability=paymentFlow.enabled?'ready':'unavailable';
      if(!paymentFlow.enabled){renderCart();return;}
      const receipt=stored(receiptKey);if(receipt){try{acceptResult(await paymentApi('status',{method:'POST',body:JSON.stringify({receipt})}));save(uncertainKey,null);schedulePoll();}catch(e){if(e.status===401){save(receiptKey,null);save(uncertainKey,null);}else save(uncertainKey,'1');}}
      renderCart();
    }catch{paymentFlow.enabled=false;state.availability='unavailable';renderCart();}
  })();
  window.addEventListener('pagehide',()=>{saveDraft();disposeCard();stickyObserver?.disconnect();clearTimeout(state.poll);clearTimeout(state.countdown);});
})();
