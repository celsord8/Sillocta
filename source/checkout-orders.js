/* Sandbox-only Checkout Transparente. Card data stays inside Mercado Pago's SDK. */
(function(){
    const state={config:null,sdk:null,mp:null,controller:null,cardMount:null,tokenizing:false,renderedRegion:null,renderedMethod:null,generation:0,chain:Promise.resolve(),result:null,attempt:null,attemptQuoteExpires:0,poll:null,countdown:null,clockOffset:0,expiryChecked:null};
  const receiptKey='sillocta-orders-test-receipt',uncertainKey='sillocta-orders-test-uncertain',historyKey='sillocta-orders-test-history';
  const originalRender=renderCart,originalSelect=selectCheckoutPayment,originalClose=closeCart;
  window.paymentApi=async function(path,options={}){
    let response;try{response=await fetch('/api/checkout/'+path,{...options,credentials:'same-origin',headers:{'content-type':'application/json',...options.headers},signal:options.signal||AbortSignal.timeout(25000)});}catch{throw Object.assign(Error('A conexão demorou. Seus dados foram mantidos.'),{code:'provider_unavailable'});}
    let data;try{data=await response.json();}catch{throw Object.assign(Error('Não foi possível confirmar a resposta. Repita o mesmo envio.'),{code:'provider_unavailable'});}if(!response.ok)throw Object.assign(Error(data.error||'Não foi possível continuar.'),{code:data.code,status:response.status});return data;
  };
  const stored=key=>{try{return sessionStorage.getItem(key);}catch{return null;}};
  const save=(key,value)=>{try{value?sessionStorage.setItem(key,value):sessionStorage.removeItem(key);}catch{}};
  function previousTests(){try{const entries=JSON.parse(stored(historyKey)||'[]');return Array.isArray(entries)?entries.filter(r=>typeof r.receipt==='string'&&typeof r.orderId==='string'):[];}catch{return [];}}
  function rememberTest(result){
    if(!result?.receipt)return true;
    try{const entries=previousTests().filter(r=>r.receipt!==result.receipt);entries.push({receipt:result.receipt,orderId:result.orderId,method:result.method});sessionStorage.setItem(historyKey,JSON.stringify(entries));return true;}catch{error('Não foi possível guardar a consulta do pedido anterior. Consulte esse pagamento antes de iniciar outro teste.');return false;}
  }
  const error=message=>{if(byId('checkout-error'))byId('checkout-error').textContent=message;if(byId('sillocta-result-feedback'))byId('sillocta-result-feedback').textContent=message;if(window._checkout.pagamento==='cartao'&&byId('sillocta-card-feedback'))byId('sillocta-card-feedback').textContent=message;};
  function acceptResult(result){state.result=result;if(Number.isFinite(result.serverTime))state.clockOffset=result.serverTime-Date.now();}
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
      input.setCustomValidity(input.name==='fone'&&!/^\d{10,11}$/.test(input.value.replace(/\D/g,''))?'Informe o telefone com DDD.':input.name==='cep'&&!/^\d{8}$/.test(input.value.replace(/\D/g,''))?'Informe um CEP com 8 números.':input.name==='uf'&&!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(input.value.toUpperCase())?'Informe uma UF válida.':'');
      const valid=input.checkValidity();setCheckoutFieldError(input,valid?'':input.validationMessage);if(!valid&&!first)first=input;
    }
    if(first){error('Confira os campos indicados para continuar.');first.focus({preventScroll:true});first.scrollIntoView({block:'center',behavior:'smooth'});return false;}return true;
  }
  function disposeCard(){
    state.generation++;const old=state.controller;state.controller=null;state.cardMount=null;
    if(old)state.chain=state.chain.then(()=>old.unmount()).catch(()=>{});
    syncCardAction();
  }
  window.renderCart=function(){disposeCard();originalRender();};
  window.closeCart=function(){disposeCard();clearTimeout(state.countdown);return originalClose();};
  window.selectCheckoutPayment=function(mode){if(state.tokenizing){error('Aguarde a validação do cartão.');return false;}if(paymentFlow.submitting||state.attempt&&!state.result){error('Consulte ou repita o pagamento enviado antes de trocar a forma de pagamento.');return false;}if(state.result){error('Este pedido já foi criado. Use “Iniciar outro teste” para escolher outra forma de pagamento.');return false;}if(!['pix','cartao','boleto'].includes(mode))return false;if(paymentFlow.enabled&&state.renderedRegion===byId('sillocta-payment-form')&&state.renderedMethod===mode)return false;error('');originalSelect(mode);if(paymentFlow.enabled)renderMethod();return false;};
  function cardTimeout(promise){let timer;return Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('O formulário de cartão demorou a carregar. Tente novamente.')),20000);})]).finally(()=>clearTimeout(timer));}
  function loadSdk(){
    if(state.sdk)return state.sdk;
    let script;
    const pending=cardTimeout(new Promise((resolve,reject)=>{if(window.MercadoPago)return resolve();script=document.createElement('script');script.src='https://sdk.mercadopago.com/js/v2';script.onload=()=>window.MercadoPago?resolve():reject(Error('O formulário não carregou.'));script.onerror=()=>reject(Error('Não foi possível carregar o formulário de cartão.'));document.head.appendChild(script);}));
    state.sdk=pending;
    pending.catch(()=>{if(state.sdk===pending)state.sdk=null;script?.remove();}).finally(()=>{if(script){script.onload=null;script.onerror=null;}});return pending;
  }
  async function mountCard(){
    const container=byId('sillocta-card-payment'),quote=checkoutQuote();
    if(!container)return;
    const quoteId=quote?quote.quoteId+':'+quote.serviceId:null;
    if(state.cardMount?.container===container&&state.cardMount.quoteId===quoteId)return;
    disposeCard();const generation=state.generation;
    if(state.result||state.attempt||stored(uncertainKey)){container.innerHTML='<p class="sl-field-note" role="status">Consulte o pedido enviado antes de iniciar outro teste.</p>';return;}
    if(!quoteId){container.innerHTML='<p class="sl-field-note" role="status">'+(paymentFlow.busy?'Calculando o total para abrir o formulário seguro…':'Informe o CEP e toque em “Atualizar total” para abrir o formulário de cartão.')+'</p>';return;}
    state.cardMount={container,quoteId};
    const amount=quote.totalCents/100;
    container.innerHTML='<p class="sl-field-note" role="status">Carregando formulário seguro…</p>';
    try{
      await loadSdk();await cardTimeout(state.chain);if(generation!==state.generation||!container.isConnected)return;
      container.innerHTML='';const mp=state.mp||(state.mp=new MercadoPago(state.config.publicKey,{locale:'pt-BR'}));
      const creation=mp.bricks().create('cardPayment','sillocta-card-payment',{
        initialization:{amount,payer:{email:'test@testuser.com'}},
        customization:{visual:{hidePaymentButton:true,style:{theme:'dark'}},paymentMethods:{maxInstallments:12,types:{included:['credit_card','debit_card']}}},
        callbacks:{onReady:()=>{},onError:detail=>{if(generation!==state.generation)return;const codes=['fields_setup_failed','fields_setup_failed_after_3_tries','get_chunk_failed','get_payment_methods_failed','get_identification_types_failed','incorrect_initialization','missing_container_id','missing_amount_property','missing_locale_property','missing_required_callbacks','settings_empty','incomplete_fields','card_token_creation_failed','secure_fields_card_token_creation_failed'];const code=codes.includes(detail?.cause)?detail.cause:'unknown';console.warn('sillocta_card_initialization',code);error(detail?.type==='non_critical'?'Confira os campos indicados no formulário de cartão.':'Não foi possível inicializar o formulário de cartão. Tente carregá-lo novamente.');}}
      }).then(async controller=>{if(controller&&(generation!==state.generation||!container.isConnected)){await controller.unmount();return null;}return controller;});
      state.chain=creation.then(()=>{}).catch(()=>{});
      const controller=await cardTimeout(creation);
      if(!controller){if(generation!==state.generation)return;throw Error('Não foi possível inicializar o formulário de cartão. Tente carregá-lo novamente.');}
      if(generation!==state.generation||!container.isConnected){await controller.unmount();return;}state.controller=controller;syncCardAction();
    }catch(e){if(generation===state.generation){disposeCard();container.innerHTML='<p class="sl-field-note" role="status">'+escapeHtml(e.message||'Não foi possível carregar o formulário de cartão.')+'</p><button type="button" class="sl-cta-secondary" id="sillocta-card-retry">Tentar carregar cartão novamente</button>';byId('sillocta-card-retry')?.addEventListener('click',()=>{error('');mountCard();});error(e.message);}}
  }
  function renderMethod(){
    if(!paymentFlow.enabled)return;const region=byId('sillocta-payment-form');if(!region)return;
    disposeCard();const mode=window._checkout.pagamento||'pix',button=byId('checkout-finalize-btn');state.renderedRegion=region;state.renderedMethod=mode;
    if(state.result){originalSelect(state.result.method);region.innerHTML='<p class="sl-field-note">Este pedido de '+({pix:'Pix',boleto:'boleto',cartao:'cartão'}[state.result.method]||'teste')+' já foi criado. Para testar outra forma de pagamento, toque em “Iniciar outro teste”. A consulta deste pedido será mantida.</p>';if(button)button.hidden=true;renderResult();return;}
    region.innerHTML=mode==='cartao'?'<div id="sillocta-card-payment"></div><button type="button" id="sillocta-card-submit" class="sl-cta sl-checkout-primary" disabled aria-describedby="sillocta-card-note"><span>Aguardando formulário do cartão</span></button><p id="sillocta-card-feedback" class="sl-error" role="alert"></p><p id="sillocta-card-note" class="sl-field-note">Preencha os dados do cartão e toque em “Pagar com cartão”. Use apenas cartões de teste.</p>':mode==='boleto'?'<div class="sl-field"><label class="sl-label" for="sillocta-cpf">CPF</label><input id="sillocta-cpf" class="sl-input" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="123.456.789-09" value="'+escapeHtml(window._checkout.cpf||'')+'"><p class="sl-field-note">Você poderá abrir o boleto ou copiar a linha digitável após confirmar os dados.</p></div>':'<p class="sl-field-note">Após confirmar os dados, use o QR Code ou o Pix copia e cola. A confirmação aparece aqui automaticamente.</p>';
    byId('sillocta-cpf')?.addEventListener('input',e=>{window._checkout.cpf=e.target.value;});
    if(button){button.hidden=mode==='cartao'||!!state.result;button.disabled=paymentFlow.submitting||!!state.attempt;button.onclick=()=>submitOnlineOrder();button.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i><span>'+ (paymentFlow.submitting?'Enviando pagamento…':mode==='boleto'?'Gerar boleto':'Gerar Pix')+'</span>';}
    if(byId('sillocta-card-submit')){byId('sillocta-card-submit').onclick=()=>submitOnlineOrder();byId('sillocta-card-feedback').textContent=byId('checkout-error')?.textContent||'';}
    if(mode==='cartao'){mountCard();syncCardAction();}renderResult();
  }
  window.updatePaymentCheckout=function(){
    if(!paymentFlow.enabled||!cart.length)return;
    const intro=byId('cart-items').querySelector('.sl-checkout-service');intro.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i> Checkout seguro · Prévia';
    const payment=byId('checkout-payment-title').closest('section');payment.querySelector('.sl-field-note').textContent='Escolha como deseja pagar. O próximo passo aparece aqui automaticamente.';
    if(!byId('sillocta-payment-form'))payment.insertAdjacentHTML('beforeend','<div id="sillocta-payment-form" class="sl-payment-form"></div><div id="sillocta-payment-result" class="sl-payment-result" aria-live="polite"></div>');
    const address=byId('checkout-address-title').closest('section');address.querySelector('.sl-field-note').textContent='Informe seu CEP, confira o endereço e escolha a forma de entrega abaixo.';
    if(!byId('checkout-shipping-options'))address.insertAdjacentHTML('afterend','<section id="checkout-shipping-options" class="sl-checkout-block" aria-label="Forma de entrega"></section>');
    byId('checkout-submit-note').textContent='Seus dados de pagamento são processados pelo Mercado Pago.';
    const email=byId('checkout-email');email.required=true;email.closest('.sl-field').querySelector('.sl-optional')?.remove();
    syncPaymentShipping();renderPaymentShipping();renderMethod();
  };
  window.renderPaymentShipping=function(){
    const region=byId('checkout-shipping-options');if(!region)return;
    const quote=paymentFlow.quote,ready=quote&&quote.expiresAt>Date.now(),options=ready?quote.options||[]:[];
    if(options.length&&!options.some(o=>o.id===paymentFlow.selected))paymentFlow.selected=options[0].id;
    const chosen=options.find(o=>o.id===paymentFlow.selected),total=checkoutQuote();
    region.innerHTML='<h2 class="sl-checkout-kicker">Forma de entrega</h2><p class="sl-field-note" role="status">'+escapeHtml(paymentFlow.busy?'Consultando opções de entrega…':paymentFlow.error|| (ready?'Escolha a melhor opção para você.':'Informe o CEP para consultar as opções.'))+'</p><div class="sl-shipping-options" role="group" aria-label="Selecione a entrega">'+options.map((o,i)=>'<button type="button" id="sillocta-delivery-'+i+'" class="sl-shipping-choice '+(chosen?.id===o.id?'is-on':'')+'" aria-pressed="'+(chosen?.id===o.id)+'"'+(state.result||state.tokenizing||paymentFlow.submitting||state.attempt?' disabled':'')+'><span class="sl-option-check" aria-hidden="true">✓</span><span class="sl-shipping-copy"><strong>'+escapeHtml(o.name)+'</strong><small>'+escapeHtml(o.daysRange?o.daysRange[0]+' a '+o.daysRange[1]+' dias úteis após postagem':'Prazo a confirmar')+'</small></span><strong>'+(o.priceCents?brl(o.priceCents):'Grátis')+'</strong></button>').join('')+'</div>'+(options.length?'<p class="sl-delivery-preview">Valores e prazos demonstrativos nesta prévia. Não há postagem de produtos.</p>':'')+'<button type="button" class="sl-cta-secondary sl-recalculate" id="sillocta-requote"'+(paymentFlow.busy||state.result||state.tokenizing||paymentFlow.submitting||state.attempt?' disabled':'')+'>Recalcular entrega</button>';
    options.forEach((o,i)=>byId('sillocta-delivery-'+i)?.addEventListener('click',()=>selectPaymentShipping(o.id)));
    region.setAttribute('aria-busy',String(paymentFlow.busy));
    byId('sillocta-requote').onclick=()=>loadPaymentShipping();
    const summary=byId('checkout-summary'),rows=summary?.querySelectorAll('.sl-summary-row');if(rows){rows[rows.length-2].querySelector('strong').textContent=chosen?(chosen.priceCents?brl(chosen.priceCents):'Grátis'):'A calcular';rows[rows.length-1].querySelector('span').textContent=total?'Total':'Total sem frete';byId('checkout-total').textContent=brl(total?total.totalCents:getTotals().total);summary.querySelector('.sl-shipping-note').textContent=chosen?chosen.name+' incluída no total.':'O valor da entrega será incluído após a consulta do CEP.';}
    if(window._checkout.pagamento==='cartao')mountCard();
  };
  async function submitCard(){
    if(state.tokenizing||paymentFlow.submitting||state.result||state.attempt)return;
    if(!validCustomer())return;
    const quote=checkoutQuote();if(!quote){error('Atualize a entrega antes de pagar com cartão.');loadPaymentShipping();return;}
    const controller=state.controller,generation=state.generation;
    if(!controller){error('O formulário seguro do cartão ainda não está disponível. Tente carregá-lo novamente.');return;}
    state.tokenizing=true;error('');syncCardAction();
    try{
      const formData=await cardTimeout(controller.getFormData()),additionalData=await controller.getAdditionalData();
      if(generation!==state.generation||controller!==state.controller||window._checkout.pagamento!=='cartao')return;
      const current=checkoutQuote();if(current?.quoteId!==quote.quoteId||current?.serviceId!==quote.serviceId||current?.totalCents!==quote.totalCents){error('O total mudou. Confira o valor e tente novamente.');return;}
      if(!formData?.token||!['credit_card','debit_card'].includes(additionalData?.paymentTypeId)){error('Confira os campos do cartão e tente novamente.');return;}
      await submitOnlineOrder({token:formData.token,id:formData.payment_method_id,type:additionalData.paymentTypeId,installments:Number(formData.installments),identification:formData.payer?.identification});
    }catch{if(generation===state.generation)error('Não foi possível validar o cartão. Confira número, validade, código de segurança e CPF.');}
    finally{state.tokenizing=false;syncCardAction();}
  }
  window.submitOnlineOrder=async function(card){
    if(paymentFlow.submitting||state.result)return;
    if(state.attempt||stored(uncertainKey)){error('Este pagamento já foi enviado. Consulte ou repita o envio antes de iniciar outro teste.');return;}
    if(!validCustomer())return;
    const quote=checkoutQuote();
    if(!quote){error('Atualize a entrega antes de continuar.');loadPaymentShipping();return;}
    const method=window._checkout.pagamento||'pix';if(method==='cartao'&&!card)return submitCard();
    if(method==='boleto'&&!/^\d{11}$/.test(String(window._checkout.cpf||'').replace(/\D/g,''))){error('Informe um CPF de teste com 11 números.');byId('sillocta-cpf')?.focus();return;}
    state.attempt={...paymentCartData(),customer:{...window._checkout},quoteId:quote.quoteId,serviceId:quote.serviceId,requestKey:crypto.randomUUID(),method,...(card?{card}:{}),cpf:window._checkout.cpf};
    state.attemptQuoteExpires=quote.expiresAt;
    await sendAttempt();
  };
  async function sendAttempt(){
    if(!state.attempt||paymentFlow.submitting)return;paymentFlow.submitting=true;save(uncertainKey,'1');error('');renderMethod();
    try{
      if(state.attemptQuoteExpires<Date.now()){
        const quote=await paymentApi('quote',{method:'POST',body:JSON.stringify({...state.attempt,cep:state.attempt.customer.cep})});state.attempt.quoteId=quote.quoteId;state.attemptQuoteExpires=quote.expiresAt;
      }
      const result=await paymentApi('order',{method:'POST',body:JSON.stringify(state.attempt)});acceptResult(result);state.attempt=null;save(uncertainKey,null);save(receiptKey,result.receipt);disposeCard();schedulePoll();
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
  function renderPreviousTests(region){
    const entries=previousTests().filter(r=>r.receipt!==state.result?.receipt);if(!entries.length)return;
    region.innerHTML+='<p>Pedidos de teste anteriores:</p>'+entries.map((r,i)=>'<button type="button" class="sl-cta-secondary" id="sillocta-previous-'+i+'">Consultar '+escapeHtml(r.orderId)+'</button>').join('');
    entries.forEach((r,i)=>byId('sillocta-previous-'+i)?.addEventListener('click',async()=>{
      if(paymentFlow.submitting||state.attempt||stored(uncertainKey)){error('Confirme o envio atual antes de consultar outro pedido.');return;}
      const currentReceipt=state.result?.receipt;
      try{const result=await paymentApi('status',{method:'POST',body:JSON.stringify({receipt:r.receipt})});if(paymentFlow.submitting||state.attempt||stored(uncertainKey)||state.result?.receipt!==currentReceipt)return;if(!rememberTest(state.result))return;acceptResult(result);save(receiptKey,result.receipt);error('');renderMethod();schedulePoll();}catch(e){error(e.message);}
    }));
  }
  function renderResult(){
    clearTimeout(state.countdown);
    const region=byId('sillocta-payment-result');if(!region)return;
    if(!state.result){
      paymentStage(false);
      region.innerHTML=paymentFlow.submitting?'<p role="status">Enviando pagamento de teste…</p>':state.attempt?'<p>Não foi possível confirmar a resposta. Repita o mesmo envio para evitar um pedido duplicado.</p><button type="button" class="sl-cta-secondary" id="sillocta-retry">Repetir o mesmo envio</button>':stored(uncertainKey)?'<p>Há um envio sem resposta desta sessão. Confira o pedido no Mercado Pago antes de iniciar outro teste.</p>'+(stored(receiptKey)?'<button type="button" class="sl-cta-secondary" id="sillocta-recover">Consultar pedido salvo</button>':''):'';
      renderPreviousTests(region);byId('sillocta-retry')?.addEventListener('click',sendAttempt);byId('sillocta-recover')?.addEventListener('click',recoverStatus);if(stored(uncertainKey)&&!state.attempt&&!paymentFlow.submitting){const btn=byId('checkout-finalize-btn');if(btn)btn.disabled=true;disposeCard();}return;
    }
    const r=state.result,pix=r.method==='pix',boleto=r.method==='boleto',pending=r.state==='pending',elapsed=pending&&Number.isFinite(r.paymentExpiresAt)&&r.paymentExpiresAt<=Date.now()+state.clockOffset;
    const labels={approved:'Pagamento aprovado',pending:pix?'Pague com Pix':boleto?'Seu boleto está pronto':'Pagamento em análise',expired:'Prazo de pagamento encerrado',rejected:'Pagamento não aprovado',refunded:'Pagamento estornado'};
    const code=pix?r.qrCode:boleto?r.digitableLine:null;
    const codeField=code?'<label class="sl-label sl-code-label" for="sillocta-payment-code">'+(pix?'Pix copia e cola':'Linha digitável')+'</label><textarea id="sillocta-payment-code" class="sl-textarea sl-payment-code" readonly aria-describedby="sillocta-code-note">'+escapeHtml(code)+'</textarea>':'';
    const copyButton=code?'<button type="button" class="sl-cta-secondary '+(pix?'sl-result-primary':'')+'" id="sillocta-copy-code">'+(pix?'Copiar código Pix':'Copiar linha digitável')+'</button>':'';
    region.innerHTML='<div class="sl-result-top"><span class="sl-result-badge">Demonstração · sem cobrança real</span><span class="sl-result-method">'+(pix?'Pix':boleto?'Boleto':'Cartão')+'</span></div><h3 id="sillocta-result-title">'+(elapsed?'Prazo de pagamento encerrado':labels[r.state]||'Pagamento recebido')+'</h3><div class="sl-result-amount"><span>Valor do pedido</span><strong>'+brl(r.totalCents)+'</strong></div>'+
      (pending&&pix&&Number.isFinite(r.paymentExpiresAt)?'<div class="sl-pix-deadline"><span id="sillocta-countdown-label">Este Pix expira em</span><strong id="sillocta-countdown" role="timer" aria-live="off"></strong></div>':'')+
      (pending&&boleto&&Number.isFinite(r.paymentExpiresAt)?'<div class="sl-boleto-due"><span>Vencimento</span><strong>'+escapeHtml(new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeZone:'America/Sao_Paulo'}).format(r.paymentExpiresAt))+'</strong></div>':'')+
      (pending?'<div id="sillocta-payment-instructions"'+(elapsed?' hidden':'')+'>'+
        (pix&&r.qrImage?'<div class="sl-qr-wrap"><img class="sl-pix-qr" alt="QR Code para o Pix de demonstração" src="data:image/png;base64,'+r.qrImage+'"><span>Escaneie pelo aplicativo do banco</span></div>':'')+
        (code?(pix?copyButton+'<details class="sl-pix-code-details"><summary>Ver código Pix</summary>'+codeField+'</details>':codeField+copyButton)+'<p id="sillocta-code-note" class="sl-result-caption">'+(pix?'No celular, copie o código e use Pix copia e cola no app do banco. A confirmação aparece aqui automaticamente.':'Use a linha digitável na opção de pagamento de boletos do seu banco.')+'</p>':'')+
        (r.ticketUrl?'<a class="sl-cta-secondary '+(boleto?'sl-result-primary':'')+'" href="'+escapeHtml(r.ticketUrl)+'" target="_blank" rel="noopener noreferrer">'+(boleto?'Abrir boleto':pix?'Abrir Pix no Mercado Pago':'Ver pagamento')+'<span aria-hidden="true"> ↗</span></a>':'')+
        (pix?'<ol class="sl-payment-steps"><li>Copie o código ou escaneie o QR Code.</li><li>Confira o valor no aplicativo do banco.</li><li>Volte aqui para acompanhar a confirmação.</li></ol>':boleto?'<p class="sl-result-caption">Após o pagamento, aguardamos a confirmação do banco. Gerar o boleto não confirma o pedido.</p>':'')+'</div>':'')+
      (pending?'<div class="sl-confirmation-status" role="status"><span class="sl-status-dot" aria-hidden="true"></span><span id="sillocta-confirmation-text">'+(elapsed?'O prazo terminou. Estamos conferindo a situação do pagamento.':boleto?'Aguardando confirmação do banco':'Aguardando confirmação do pagamento')+'</span></div><button type="button" class="sl-cta-secondary sl-result-check" id="sillocta-refresh">Já paguei · verificar</button>':'<p class="sl-result-caption">'+(r.state==='approved'?'Recebemos a confirmação do Mercado Pago.':r.state==='expired'?'Consulte o pedido antes de gerar outro pagamento.':'Confira a situação antes de iniciar outro pagamento.')+' Esta é uma simulação; nenhum produto será enviado.</p>')+
      '<p id="sillocta-result-feedback" class="sl-error" role="alert">'+escapeHtml(byId('checkout-error')?.textContent||'')+'</p><details class="sl-result-details"><summary>Detalhes do pedido</summary><p>'+escapeHtml(r.orderId)+'</p>'+(r.shipping?'<p>'+escapeHtml(r.shipping.name)+' · '+(r.shipping.priceCents?brl(r.shipping.priceCents):'Grátis')+'</p>':'')+'</details><div class="sl-result-footer"><button type="button" class="sl-cta-secondary" id="sillocta-continue">Continuar navegando</button><button type="button" class="sl-cta-secondary" id="sillocta-new-test">Iniciar outro teste</button>'+(pending?'<p>O pedido atual continuará disponível para consulta.</p>':'')+'</div>';
    renderPreviousTests(region);
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
      if(!paymentFlow.enabled)return;
      const receipt=stored(receiptKey);if(receipt){try{acceptResult(await paymentApi('status',{method:'POST',body:JSON.stringify({receipt})}));save(uncertainKey,null);schedulePoll();}catch(e){if(e.status===401){save(receiptKey,null);save(uncertainKey,null);}else save(uncertainKey,'1');}}
      renderCart();
    }catch{} // WhatsApp remains available if this Preview has no sandbox configuration.
  })();
  window.addEventListener('pagehide',()=>{disposeCard();clearTimeout(state.poll);clearTimeout(state.countdown);});
})();
