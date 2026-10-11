/* Sandbox-only Checkout Transparente. Card data stays inside Mercado Pago's SDK. */
(function(){
    const state={config:null,sdk:null,mp:null,controller:null,renderedRegion:null,renderedMethod:null,generation:0,chain:Promise.resolve(),result:null,attempt:null,attemptQuoteExpires:0,poll:null};
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
  const error=message=>{if(byId('checkout-error'))byId('checkout-error').textContent=message;};
  function validCustomer(){
    let first=null;for(const input of document.querySelectorAll('#cart-items input[oninput*="syncCheckoutField"]')){
      input.setCustomValidity(input.name==='fone'&&!/^\d{10,11}$/.test(input.value.replace(/\D/g,''))?'Informe o telefone com DDD.':input.name==='cep'&&!/^\d{8}$/.test(input.value.replace(/\D/g,''))?'Informe um CEP com 8 números.':input.name==='uf'&&!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(input.value.toUpperCase())?'Informe uma UF válida.':'');
      const valid=input.checkValidity();setCheckoutFieldError(input,valid?'':input.validationMessage);if(!valid&&!first)first=input;
    }
    if(first){error('Confira os campos indicados para continuar.');first.focus({preventScroll:true});first.scrollIntoView({block:'center',behavior:'smooth'});return false;}return true;
  }
  function disposeCard(){
    state.generation++;const old=state.controller;state.controller=null;
    if(old)state.chain=state.chain.then(()=>old.unmount()).catch(()=>{});
  }
  window.renderCart=function(){disposeCard();originalRender();};
  window.closeCart=function(){disposeCard();return originalClose();};
  window.selectCheckoutPayment=function(mode){if(paymentFlow.submitting||state.attempt&&!state.result){error('Consulte ou repita o pagamento enviado antes de trocar a forma de pagamento.');return false;}if(state.result){error('Este pedido já foi criado. Use “Iniciar outro teste” para escolher outra forma de pagamento.');return false;}if(!['pix','cartao','boleto'].includes(mode))return false;if(paymentFlow.enabled&&state.renderedRegion===byId('sillocta-payment-form')&&state.renderedMethod===mode)return false;error('');originalSelect(mode);if(paymentFlow.enabled)renderMethod();return false;};
  function cardTimeout(promise){let timer;return Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('O formulário de cartão demorou a carregar. Tente novamente.')),20000);})]).finally(()=>clearTimeout(timer));}
  function loadSdk(){
    if(state.sdk)return state.sdk;
    state.sdk=cardTimeout(new Promise((resolve,reject)=>{if(window.MercadoPago)return resolve();const script=document.createElement('script');script.src='https://sdk.mercadopago.com/js/v2';script.onload=()=>window.MercadoPago?resolve():reject(Error('O formulário não carregou.'));script.onerror=()=>reject(Error('Não foi possível carregar o formulário de cartão.'));document.head.appendChild(script);}));
    state.sdk.catch(()=>{state.sdk=null;});return state.sdk;
  }
  async function mountCard(){
    disposeCard();const generation=state.generation,container=byId('sillocta-card-payment');
    if(!container)return;
    if(state.result||state.attempt||stored(uncertainKey)){container.innerHTML='<p class="sl-field-note" role="status">Consulte o pedido enviado antes de iniciar outro teste.</p>';return;}
    if(!paymentFlow.quote||paymentFlow.quote.expiresAt<Date.now()){container.innerHTML='<p class="sl-field-note" role="status">'+(paymentFlow.busy?'Calculando o total para abrir o formulário seguro…':'Informe o CEP e toque em “Atualizar total” para abrir o formulário de cartão.')+'</p>';return;}
    const amount=paymentFlow.quote.totalCents/100;
    container.innerHTML='<p class="sl-field-note" role="status">Carregando formulário seguro…</p>';
    try{
      await loadSdk();await cardTimeout(state.chain);if(generation!==state.generation||!container.isConnected)return;
      container.innerHTML='';const mp=state.mp||(state.mp=new MercadoPago(state.config.publicKey,{locale:'pt-BR'}));
      const creation=mp.bricks().create('cardPayment','sillocta-card-payment',{
        initialization:{amount,payer:{email:'test@testuser.com'}},
        customization:{visual:{style:{theme:'dark'}},paymentMethods:{maxInstallments:12}},
        callbacks:{onReady:()=>{},onError:detail=>{if(generation!==state.generation)return;const codes=['fields_setup_failed','get_payment_methods_failed','get_identification_types_failed','incorrect_initialization','missing_container_id','missing_amount_property','missing_locale_property','missing_required_callbacks','settings_empty'];const code=codes.includes(detail?.cause)?detail.cause:'unknown';console.warn('sillocta_card_initialization',code);error('Não foi possível inicializar o formulário de cartão. Tente carregá-lo novamente.');},onSubmit:async(formData,additionalData)=>{
          if(!validCustomer())throw Error('Confira os dados de contato e entrega.');
          return submitOnlineOrder({token:formData.token,id:formData.payment_method_id,type:additionalData?.paymentTypeId,installments:Number(formData.installments),identification:formData.payer?.identification});
        }}
      }).then(async controller=>{if(controller&&(generation!==state.generation||!container.isConnected)){await controller.unmount();return null;}return controller;});
      state.chain=creation.then(()=>{}).catch(()=>{});
      const controller=await cardTimeout(creation);
      if(!controller){if(generation!==state.generation)return;throw Error('Não foi possível inicializar o formulário de cartão. Tente carregá-lo novamente.');}
      if(generation!==state.generation||!container.isConnected){await controller.unmount();return;}state.controller=controller;
    }catch(e){if(generation===state.generation){disposeCard();container.innerHTML='<p class="sl-field-note" role="status">'+escapeHtml(e.message||'Não foi possível carregar o formulário de cartão.')+'</p><button type="button" class="sl-cta-secondary" id="sillocta-card-retry">Tentar carregar cartão novamente</button>';byId('sillocta-card-retry')?.addEventListener('click',mountCard);error(e.message);}}
  }
  function renderMethod(){
    if(!paymentFlow.enabled)return;const region=byId('sillocta-payment-form');if(!region)return;
    disposeCard();const mode=window._checkout.pagamento||'pix',button=byId('checkout-finalize-btn');state.renderedRegion=region;state.renderedMethod=mode;
    if(state.result){originalSelect(state.result.method);region.innerHTML='<p class="sl-field-note">Este pedido de '+({pix:'Pix',boleto:'boleto',cartao:'cartão'}[state.result.method]||'teste')+' já foi criado. Para testar outra forma de pagamento, toque em “Iniciar outro teste”. A consulta deste pedido será mantida.</p>';if(button)button.hidden=true;renderResult();return;}
    region.innerHTML=mode==='cartao'?'<div id="sillocta-card-payment"></div><p class="sl-field-note">Use apenas cartões de teste do Mercado Pago. Os dados do cartão são processados pelo formulário seguro.</p>':mode==='boleto'?'<div class="sl-field"><label class="sl-label" for="sillocta-cpf">CPF de teste</label><input id="sillocta-cpf" class="sl-input" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="123.456.789-09" value="'+escapeHtml(window._checkout.cpf||'')+'"><p class="sl-field-note">O boleto é gerado para simulação. Nenhuma entrega será realizada.</p></div>':'<p class="sl-field-note">Gere um QR Code e um código Pix copia e cola para testar o fluxo.</p>';
    byId('sillocta-cpf')?.addEventListener('input',e=>{window._checkout.cpf=e.target.value;});
    if(button){button.hidden=mode==='cartao'||!!state.result;button.disabled=paymentFlow.submitting||!!state.attempt;button.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i><span>'+ (paymentFlow.submitting?'Enviando pagamento…':mode==='boleto'?'Gerar boleto de teste':'Gerar Pix de teste')+'</span>';}
    if(mode==='cartao')mountCard();renderResult();
  }
  window.updatePaymentCheckout=function(){
    if(!paymentFlow.enabled||!cart.length)return;
    const intro=byId('cart-items').querySelector('.sl-checkout-service');intro.innerHTML='<i class="fas fa-flask" aria-hidden="true"></i> Ambiente de teste · Mercado Pago';
    const payment=byId('checkout-payment-title').closest('section');payment.querySelector('.sl-field-note').textContent='Escolha a forma de pagamento. Esta prévia usa credenciais de teste e não envia produtos.';
    if(!byId('sillocta-payment-form'))payment.insertAdjacentHTML('beforeend','<div id="sillocta-payment-form" class="sl-payment-form"></div><div id="sillocta-payment-result" class="sl-payment-result" aria-live="polite"></div>');
    const address=byId('checkout-address-title').closest('section');if(!byId('checkout-shipping-options'))address.insertAdjacentHTML('afterend','<section id="checkout-shipping-options" class="sl-checkout-block" aria-label="Entrega de teste"></section>');
    byId('checkout-submit-note').textContent='Simulação de compra: pagamento de teste e entrega sem postagem.';
    const email=byId('checkout-email');email.required=true;email.closest('.sl-field').querySelector('.sl-optional')?.remove();
    syncPaymentShipping();renderPaymentShipping();renderMethod();
  };
  window.renderPaymentShipping=function(){
    const region=byId('checkout-shipping-options');if(!region)return;
    const quote=paymentFlow.quote,ready=quote&&quote.expiresAt>Date.now();
    region.innerHTML='<h2 class="sl-checkout-kicker">Entrega de teste</h2><p class="sl-field-note" role="status">'+escapeHtml(paymentFlow.busy?'Calculando o total…':paymentFlow.error|| (ready?'Entrega simulada gratuita. Não haverá postagem de produtos.':'Informe o CEP para calcular o total de teste.'))+'</p><button type="button" class="sl-cta-secondary sl-recalculate" id="sillocta-requote">Atualizar total</button>';
    byId('sillocta-requote').onclick=()=>loadPaymentShipping();
    const summary=byId('checkout-summary'),rows=summary?.querySelectorAll('.sl-summary-row');if(rows){rows[rows.length-2].querySelector('strong').textContent='Simulada · R$ 0,00';rows[rows.length-1].querySelector('span').textContent='Total de teste';byId('checkout-total').textContent=brl(ready?quote.totalCents:getTotals().total);summary.querySelector('.sl-shipping-note').textContent='Total validado no servidor. Entrega simulada, sem postagem.';}
    if(window._checkout.pagamento==='cartao'&&!state.controller)mountCard();
  };
  window.submitOnlineOrder=async function(card){
    if(paymentFlow.submitting||state.result)return;
    if(state.attempt||stored(uncertainKey)){error('Este pagamento já foi enviado. Consulte ou repita o envio antes de iniciar outro teste.');return;}
    if(!validCustomer())return;
    const quote=paymentFlow.quote;
    if(!quote||quote.expiresAt<Date.now()){error('Atualize o total antes de continuar.');loadPaymentShipping();return;}
    const method=window._checkout.pagamento||'pix';if(method==='cartao'&&!card){error('Conclua o formulário seguro do cartão.');return;}
    if(method==='boleto'&&!/^\d{11}$/.test(String(window._checkout.cpf||'').replace(/\D/g,''))){error('Informe um CPF de teste com 11 números.');byId('sillocta-cpf')?.focus();return;}
    state.attempt={...paymentCartData(),customer:{...window._checkout},quoteId:quote.quoteId,serviceId:'sandbox',requestKey:crypto.randomUUID(),method,...(card?{card}:{}),cpf:window._checkout.cpf};
    state.attemptQuoteExpires=quote.expiresAt;
    await sendAttempt();
  };
  async function sendAttempt(){
    if(!state.attempt||paymentFlow.submitting)return;paymentFlow.submitting=true;save(uncertainKey,'1');error('');renderMethod();
    try{
      if(state.attemptQuoteExpires<Date.now()){
        const quote=await paymentApi('quote',{method:'POST',body:JSON.stringify({...state.attempt,cep:state.attempt.customer.cep})});state.attempt.quoteId=quote.quoteId;state.attemptQuoteExpires=quote.expiresAt;
      }
      const result=await paymentApi('order',{method:'POST',body:JSON.stringify(state.attempt)});state.result=result;state.attempt=null;save(uncertainKey,null);save(receiptKey,result.receipt);disposeCard();schedulePoll();
    }
    catch(e){error(e.message);if(['credentials_rejected','provider_validation'].includes(e.code)){state.attempt=null;save(uncertainKey,null);}else{disposeCard();}}
    finally{paymentFlow.submitting=false;renderMethod();}
  }
  function schedulePoll(){clearTimeout(state.poll);if(state.result?.state==='pending')state.poll=setTimeout(()=>refreshStatus(),10000);}
  async function refreshStatus(){
    const receipt=state.result?.receipt;if(!receipt)return;
    try{const result=await paymentApi('status',{method:'POST',body:JSON.stringify({receipt})});if(state.result?.receipt!==receipt)return;state.result=result;error('');}catch(e){if(state.result?.receipt!==receipt)return;error(e.message);}
    renderResult();schedulePoll();
  }
  async function recoverStatus(){
    const receipt=stored(receiptKey);if(!receipt)return;
    try{state.result=await paymentApi('status',{method:'POST',body:JSON.stringify({receipt})});save(uncertainKey,null);error('');renderMethod();schedulePoll();}catch(e){error(e.message);}
  }
  function resetTest(){if(paymentFlow.submitting||state.attempt||stored(uncertainKey))return;if(!rememberTest(state.result))return;clearTimeout(state.poll);state.result=null;state.attempt=null;save(receiptKey,null);save(uncertainKey,null);error('');renderMethod();}
  function renderPreviousTests(region){
    const entries=previousTests().filter(r=>r.receipt!==state.result?.receipt);if(!entries.length)return;
    region.innerHTML+='<p>Pedidos de teste anteriores:</p>'+entries.map((r,i)=>'<button type="button" class="sl-cta-secondary" id="sillocta-previous-'+i+'">Consultar '+escapeHtml(r.orderId)+'</button>').join('');
    entries.forEach((r,i)=>byId('sillocta-previous-'+i)?.addEventListener('click',async()=>{
      if(paymentFlow.submitting||state.attempt||stored(uncertainKey)){error('Confirme o envio atual antes de consultar outro pedido.');return;}
      const currentReceipt=state.result?.receipt;
      try{const result=await paymentApi('status',{method:'POST',body:JSON.stringify({receipt:r.receipt})});if(paymentFlow.submitting||state.attempt||stored(uncertainKey)||state.result?.receipt!==currentReceipt)return;if(!rememberTest(state.result))return;state.result=result;save(receiptKey,result.receipt);error('');renderMethod();schedulePoll();}catch(e){error(e.message);}
    }));
  }
  function renderResult(){
    const region=byId('sillocta-payment-result');if(!region)return;
    if(!state.result){
      region.innerHTML=paymentFlow.submitting?'<p role="status">Enviando pagamento de teste…</p>':state.attempt?'<p>Não foi possível confirmar a resposta. Repita o mesmo envio para evitar um pedido duplicado.</p><button type="button" class="sl-cta-secondary" id="sillocta-retry">Repetir o mesmo envio</button>':stored(uncertainKey)?'<p>Há um envio sem resposta desta sessão. Confira o pedido no Mercado Pago antes de iniciar outro teste.</p>'+(stored(receiptKey)?'<button type="button" class="sl-cta-secondary" id="sillocta-recover">Consultar pedido salvo</button>':''):'';
      renderPreviousTests(region);byId('sillocta-retry')?.addEventListener('click',sendAttempt);byId('sillocta-recover')?.addEventListener('click',recoverStatus);if(stored(uncertainKey)&&!state.attempt&&!paymentFlow.submitting){const btn=byId('checkout-finalize-btn');if(btn)btn.disabled=true;disposeCard();}return;
    }
    const r=state.result,labels={approved:'Pagamento de teste aprovado',pending:'Aguardando pagamento de teste',rejected:'Pagamento de teste não aprovado',refunded:'Pagamento de teste estornado'};
    region.innerHTML='<h3>'+labels[r.state]+'</h3><p>'+escapeHtml(r.orderId)+' · '+brl(r.totalCents)+'</p>'+
      (r.state==='pending'&&r.qrImage?'<img class="sl-pix-qr" alt="QR Code do Pix de teste" src="data:image/png;base64,'+r.qrImage+'">':'')+
      (r.state==='pending'&&(r.qrCode||r.digitableLine)?'<label class="sl-label" for="sillocta-payment-code">'+(r.qrCode?'Pix copia e cola':'Linha digitável')+'</label><textarea id="sillocta-payment-code" class="sl-textarea" readonly>'+escapeHtml(r.qrCode||r.digitableLine)+'</textarea><button type="button" class="sl-cta-secondary" id="sillocta-copy-code">Copiar código</button>':'')+
      (r.state==='pending'&&r.ticketUrl?'<a class="sl-cta-secondary" href="'+escapeHtml(r.ticketUrl)+'" target="_blank" rel="noopener noreferrer">Abrir '+(r.method==='boleto'?'boleto':'pagamento')+' de teste</a>':'')+
      (r.state==='pending'?'<button type="button" class="sl-cta-secondary" id="sillocta-refresh">Consultar pagamento</button><p>Um novo teste não cancela este pedido. Sua consulta continuará disponível.</p>':'<p>Simulação concluída. Nenhum produto será enviado.</p>')+'<button type="button" class="sl-cta-secondary" id="sillocta-new-test">Iniciar outro teste</button>';
    renderPreviousTests(region);
    byId('sillocta-copy-code')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(r.qrCode||r.digitableLine);byId('sillocta-copy-code').textContent='Código copiado';}catch{byId('sillocta-payment-code').select();error('Selecione e copie o código.');}});
    byId('sillocta-refresh')?.addEventListener('click',refreshStatus);byId('sillocta-new-test')?.addEventListener('click',resetTest);
    const button=byId('checkout-finalize-btn');if(button)button.hidden=true;
  }
  (async()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    try{
      state.config=await paymentApi('config');paymentFlow.enabled=state.config.enabled===true&&state.config.integration==='orders';
      if(!paymentFlow.enabled)return;
      const receipt=stored(receiptKey);if(receipt){try{state.result=await paymentApi('status',{method:'POST',body:JSON.stringify({receipt})});save(uncertainKey,null);schedulePoll();}catch(e){if(e.status===401){save(receiptKey,null);save(uncertainKey,null);}else save(uncertainKey,'1');}}
      renderCart();
    }catch{} // WhatsApp remains available if this Preview has no sandbox configuration.
  })();
  window.addEventListener('pagehide',()=>{disposeCard();clearTimeout(state.poll);});
})();
