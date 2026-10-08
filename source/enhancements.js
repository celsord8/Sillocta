'use strict';
const PRODUCTS=JSON.parse(document.getElementById('sillocta-products').textContent);
const WA_NUMBER='5585991857074';
const CUPONS={BEMVINDO10:10,SILLOCTA15:15,PROMO20:20};
const paidOrders=[];
const paymentFlow={enabled:false,shippingKey:'',quote:null,selected:'',busy:false,sequence:0,timer:null,controller:null,error:'',attempt:null};
let cart=[],activeTab='m',lastFocused=null,toastTimer,cepRequest=0,revealObserver,lastRenderedTotal=null;
const buyFeedback=new WeakMap();
let whatsappOpening=false,whatsappResetTimer;
let cepTimer,cepController,cepPromise,cepInputCode='',cepResolvedCode='',cepPendingCode='',cepMessage='',cepBusy=false;
const cepCache=new Map(),cepAutofilled={};
window._checkout={pagamento:'pix'};window._giftWrap=false;window._couponCode='';window._couponPct=0;window._orderObs='';
const byId=id=>document.getElementById(id);
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const motion=()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const catalogState={mode:'all',brand:'',price:'',available:false,savedOnly:false,sort:'curated'};
let catalogLastSort='curated';
const favoriteIds=new Set();
try{const saved=JSON.parse(localStorage.getItem('sillocta-favorites-v1')||'[]');if(Array.isArray(saved))saved.forEach(id=>{if(PRODUCTS.some(p=>p.id===id))favoriteIds.add(id);});}catch{}
function syncFavoriteButtons(){
  document.querySelectorAll('[data-favorite-id]').forEach(button=>{const p=PRODUCTS.find(p=>p.id===Number(button.dataset.favoriteId));if(!p)return;const saved=favoriteIds.has(p.id);button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',`${saved?'Remover':'Salvar'} ${p.name} ${saved?'dos':'nos'} favoritos`);});
  const count=byId('catalog-favorite-count');if(count)count.textContent=String(favoriteIds.size);
  const menuCount=byId('menu-favorite-count');if(menuCount)menuCount.textContent=String(favoriteIds.size);
}
function toggleFavorite(id){
  const p=PRODUCTS.find(p=>p.id===id);if(!p)return false;
  const focused=document.activeElement,wasSaved=favoriteIds.has(id);if(wasSaved)favoriteIds.delete(id);else favoriteIds.add(id);
  try{localStorage.setItem('sillocta-favorites-v1',JSON.stringify([...favoriteIds]));}catch{}
  syncFavoriteButtons();applyCatalogFilters();
  if(wasSaved&&catalogState.savedOnly&&focused?.closest?.('.card'))byId('catalog-saved')?.focus({preventScroll:true});
  toast(`${p.name} ${wasSaved?'removido dos':'salvo nos'} favoritos`);return false;
}
function syncCatalogControls(){
  for(const [id,key] of [['catalog-brand','brand'],['catalog-price','price'],['catalog-sort','sort']])if(byId(id))byId(id).value=catalogState[key];
  if(byId('catalog-available'))byId('catalog-available').checked=catalogState.available;
  byId('catalog-saved')?.setAttribute('aria-pressed',String(catalogState.savedOnly));
}
function syncCatalogBrands(gender){
  const select=byId('catalog-brand');if(!select)return;
  const brands=[...new Set(PRODUCTS.filter(p=>!gender||p.gender===gender).map(p=>p.brand))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(!brands.includes(catalogState.brand))catalogState.brand='';
  const scope=gender||'all';
  if(select.dataset.catalogScope!==scope){
    select.innerHTML='<option value="">Todas as marcas</option>'+brands.map(brand=>`<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`).join('');
    select.dataset.catalogScope=scope;
  }
  select.value=catalogState.brand;
}
function applyCatalogFilters(){
  if(!byId('catalog-query'))return;
  const gender=document.body.classList.contains('collection-view')?activeTab:'';
  syncCatalogBrands(gender);
  const products=SilloctaProductPages.filterProducts(PRODUCTS,{...catalogState,query:byId('catalog-query').value,gender,favorites:[...favoriteIds]});
  const order=new Map(products.map((p,i)=>[p.id,i])),ids=new Set(order.keys());
  document.querySelectorAll('.perfume-grid .card').forEach(card=>{card.hidden=!ids.has(Number(card.dataset.productId));});
  if(catalogLastSort!==catalogState.sort){
    document.querySelectorAll('.perfume-grid').forEach(grid=>{
      [...grid.querySelectorAll('.card')].sort((a,b)=>{const pa=PRODUCTS.find(p=>p.id===Number(a.dataset.productId)),pb=PRODUCTS.find(p=>p.id===Number(b.dataset.productId));return catalogState.sort==='curated'?pa.id-pb.id:(catalogState.sort==='price-desc'?-1:1)*(pa.prices['5']-pb.prices['5'])||pa.id-pb.id;}).forEach(card=>grid.appendChild(card));
    });catalogLastSort=catalogState.sort;
  }
  for(const id of ['sec-masculino','sec-feminino']){const section=byId(id);if(section)section.hidden=(gender&&gender!==(id==='sec-masculino'?'m':'f'))||![...section.querySelectorAll('.card')].some(c=>!c.hidden);}
  const scope=gender?` na coleção ${gender==='m'?'masculina':'feminina'}`:'';
  byId('catalog-status').textContent=`${products.length} ${products.length===1?'perfume':'perfumes'}${scope}${catalogState.brand?' · '+catalogState.brand:''}${catalogState.savedOnly?' · favoritos':''}${catalogState.mode==='new'?' · novidades':catalogState.mode==='niche'?' · nicho':catalogState.mode==='designer'?' · designer':''}`;
  byId('catalog-empty').hidden=products.length>0;
  const message=byId('catalog-empty-copy');if(message)message.textContent=catalogState.savedOnly&&!favoriteIds.size?'Você ainda não salvou perfumes. Toque no coração para criar sua seleção.':'Nenhum perfume corresponde à sua seleção. Experimente ajustar os filtros.';
  syncCatalogControls();
}
function updateCatalogFilters(source=''){
  if(!byId('catalog-query'))return;
  catalogState.brand=byId('catalog-brand').value;catalogState.price=byId('catalog-price').value;catalogState.sort=byId('catalog-sort').value;catalogState.available=byId('catalog-available').checked;applyCatalogFilters();
  if(['brand','price','sort','available'].includes(source))scrollToCatalogResults();
}
function toggleSavedCatalog(){catalogState.savedOnly=!catalogState.savedOnly;applyCatalogFilters();scrollToCatalogResults();return false;}
function openFavorites(){
  if(navigateToCatalog('catalog-search','saved'))return false;
  closeCart();closeMobileMenu();resetCatalogVisibility();exitCollectionView();catalogState.savedOnly=true;applyCatalogFilters();scrollToSectionLux('catalog-search');byId('catalog-saved')?.focus({preventScroll:true});return false;
}
function initializeCatalogTools(){
  syncFavoriteButtons();applyCatalogFilters();
}
function checkoutControlIcon(name){
  const paths={
    whatsapp:'<path d="m3 21 1.65-3.8a9 9 0 1 1 3.4 2.9L3 21Z"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    minus:'<path d="M6 12h12"/>',plus:'<path d="M6 12h12M12 6v12"/>',
    gift:'<path d="M12 8v13M3 8h18v4H3zM5 12v9h14v-9"/><path d="M12 8H8a2.5 2.5 0 1 1 2.5-2.5L12 8Zm0 0h4a2.5 2.5 0 1 0-2.5-2.5L12 8Z"/>',
    qrcode:'<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h-3zM21 15v6h-3M12 3v3M12 9v3H3M9 12v3M12 18v3M18 12h3"/>',
    card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    barcode:'<path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14"/>'
  };
  return `<svg class="sl-control-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||''}</svg>`;
}
function syncCouponButton(input){
  input.value=input.value.toUpperCase();const button=byId('checkout-coupon-btn');if(!button)return;
  const applied=!!window._couponPct&&input.value.trim()===window._couponCode;
  button.disabled=applied;button.textContent=applied?'Aplicado ✓':'Aplicar';
}
function resetWhatsAppButton(){
  clearTimeout(whatsappResetTimer);whatsappOpening=false;if(paymentFlow.enabled)return;
  const button=byId('checkout-finalize-btn');if(!button)return;
  button.disabled=false;button.removeAttribute('aria-busy');const label=button.querySelector('span');if(label)label.textContent='Finalizar pelo WhatsApp';
}
function openWhatsAppCheckout(){
  if(whatsappOpening)return;const url='https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(buildOrderMessage());
  whatsappOpening=true;const button=byId('checkout-finalize-btn');if(button){button.disabled=true;button.setAttribute('aria-busy','true');const label=button.querySelector('span');if(label)label.textContent='Abrindo WhatsApp…';}
  whatsappResetTimer=setTimeout(resetWhatsAppButton,1500);
  try{window.location.assign(url);}catch{resetWhatsAppButton();byId('checkout-error').textContent='Não foi possível abrir o WhatsApp. Seus dados foram mantidos; tente novamente.';}
}
function parsePrice(v){return Number(String(v).replace(/[^\d,]/g,'').replace(',','.'))||0;}
function getTotals(){const subtotal=cart.reduce((s,i)=>s+Math.round(parsePrice(i.preco)*100)*i.qty,0);const discount=Math.round(subtotal*(window._couponPct||0)/100);return {subtotal,discount,gift:window._giftWrap?990:0,total:subtotal-discount+(window._giftWrap?990:0),freeShipping:subtotal>=29900};}
function dismissToast(){const node=byId('sl-toast');clearTimeout(toastTimer);node.classList.remove('visible');node.inert=true;}
function scheduleToastDismiss(){clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(!byId('sl-toast').contains?.(document.activeElement))dismissToast();},5500);}
function toast(message,cartAction=false){const node=byId('sl-toast');node.innerHTML=`<span class="sl-toast-copy">${escapeHtml(message)}</span>${cartAction?'<button type="button" class="sl-toast-action" onclick="openCart();return false;">Ver sacola</button>':''}`;node.inert=false;node.classList.add('visible');scheduleToastDismiss();}
function persistBag(){try{localStorage.setItem('sillocta-original-bag-v1',JSON.stringify({items:cart.map(i=>({pid:i.pid,vol:i.vol,qty:i.qty})),coupon:window._couponCode,gift:window._giftWrap,paidOrders:paidOrders.slice(-30)}));}catch{}const counter=byId('cc'),count=cart.reduce((n,i)=>n+i.qty,0);if(Number(counter.textContent)!==count){counter.classList.remove('sl-bag-updated');requestAnimationFrame(()=>counter.classList.add('sl-bag-updated'));}counter.textContent=count;byId('header-bag-button')?.setAttribute('aria-label',`Abrir sacola com ${count} ${count===1?'item':'itens'}`);const menuCount=byId('menu-bag-count');if(menuCount){menuCount.textContent=count;byId('menu-bag-link').setAttribute('aria-label',`Minha sacola, ${count} ${count===1?'item':'itens'}`);}const shortcut=byId('sl-bag-shortcut');if(shortcut){shortcut.hidden=count===0;shortcut.setAttribute('aria-label',`Abrir sacola com ${count} ${count===1?'item':'itens'}`);byId('sl-bag-count').textContent=count;}document.body?.classList.toggle('sl-has-bag',count>0);}
function lockPage(){const open=byId('cart-drawer').classList.contains('open')||byId('mobile-menu-drawer').classList.contains('open')||byId('footer-info-overlay').classList.contains('open');document.body.classList.toggle('sl-modal-open',open);document.documentElement?.classList.toggle('sl-modal-open',open);document.body.style.overflow=open?'hidden':'';document.body.classList.toggle('sl-paused',document.hidden);}
function setPanel(id,open){const panel=byId(id),wasOpen=panel.classList.contains('open');panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',String(!open));panel.inert=!open;lockPage();if(open){lastFocused=document.activeElement;requestAnimationFrame(()=>panel.querySelector('button,input,a,[tabindex="0"]')?.focus({preventScroll:true}));}else if(wasOpen&&lastFocused?.isConnected)lastFocused.focus({preventScroll:true});}
function openCart(){const origin=document.activeElement,fromToast=!!origin?.closest?.('#sl-toast'),fromMenu=!!origin?.closest?.('#mobile-menu-drawer');dismissToast();closeMobileMenu();closeFooterInfo();renderCart();setPanel('cart-drawer',true);lastFocused=fromToast?byId('sl-bag-shortcut'):fromMenu?byId('header-bag-button'):origin;syncCheckoutViewport();byId('cart-drawer').scrollTop=0;byId('cart-overlay').classList.add('open');byId('cart-overlay').setAttribute('aria-hidden','false');byId('wa-float').style.opacity='0';byId('wa-float').style.pointerEvents='none';}
function closeCart(){setPanel('cart-drawer',false);byId('cart-overlay').classList.remove('open');byId('cart-overlay').setAttribute('aria-hidden','true');byId('wa-float').style.opacity='';byId('wa-float').style.pointerEvents='';return false;}
function syncMenuState(){const detail=currentProduct();const current=detail?detail.gender:document.body.classList.contains('collection-view')?activeTab:'all';for(const key of ['all','m','f']){const link=byId('menu-collection-'+key);if(link){const on=key===current;link.classList.toggle('is-current',on);link.setAttribute('aria-current',on?'page':'false');}}}
function openMobileMenu(){closeCart();closeFooterInfo();syncMenuState();setPanel('mobile-menu-drawer',true);lastFocused=byId('menu-trigger');byId('menu-trigger').setAttribute('aria-expanded','true');byId('mobile-menu-overlay').classList.add('open');}
function closeMobileMenu(){setPanel('mobile-menu-drawer',false);byId('menu-trigger')?.setAttribute('aria-expanded','false');byId('mobile-menu-overlay').classList.remove('open');return false;}
function updateIndicators(){for(const [gender,word] of [['m','masc'],['f','fem']]){if(!byId('img-'+word))continue;const on=activeTab===gender;byId('img-'+word).style.opacity=on?'.95':'.55';byId('sel-'+word+'-label').style.color=on?'#D4AF37':'rgba(255,255,255,.7)';byId('sel-'+word+'-bar').style.width=on?'36px':'0';byId('sel-'+word+'-bar').style.opacity=on?'1':'0';byId('sel-'+word+'-btn').setAttribute('aria-pressed',String(on));}}
let collectionNavigation=0;
function scrollToCatalogTarget(resolveTarget){
  const navigation=++collectionNavigation;
  // Measure after collection visibility and overlay changes have been painted.
  // Absolute page coordinates avoid stacking scroll-padding and scroll-margin.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(navigation!==collectionNavigation)return;
    const banner=resolveTarget();
    if(!banner||!banner.getClientRects().length)return;
    const header=document.querySelector('header.glass');
    const headerBottom=Math.max(0,header?.getBoundingClientRect().bottom||0);
    const top=Math.max(0,window.scrollY+banner.getBoundingClientRect().top-headerBottom);
    window.scrollTo({top,behavior:motion()?'smooth':'instant'});
  }));
}
function scrollToCollectionBanner(gender){scrollToCatalogTarget(()=>byId(gender==='m'?'parallax-hero':'parallax-fem'));}
function scrollToCatalogResults(){
  scrollToCatalogTarget(()=>{
    const card=document.querySelector('.perfume-grid .card:not([hidden])');
    if(!card)return byId('catalog-empty');
    return byId(card.closest('#sec-masculino')?'parallax-hero':'parallax-fem');
  });
}
function scrollToSectionLux(id){closeCart();closeMobileMenu();if(['hero','shop','sec-masculino','sec-feminino','catalog-search','colecao-selector'].includes(id)&&navigateToCatalog(id))return false;if(['sec-masculino','sec-feminino'].includes(id)){scrollToCollectionBanner(id==='sec-masculino'?'m':'f');return false;}byId(id)?.scrollIntoView({behavior:motion()?'smooth':'auto',block:'start'});return false;}
function headerBrandHomeLux(){closeCart();closeMobileMenu();if(navigateToCatalog())return false;exitCollectionView();window.scrollTo({top:0,behavior:motion()?'smooth':'auto'});return false;}
function scrollToFooterLux(){return scrollToSectionLux('site-footer');}
function goToCartLux(){openCart();return false;}
function switchTab(gender){if(!['m','f'].includes(gender))return;activeTab=gender;updateIndicators();}
function enterCollectionView(gender){if(!['m','f'].includes(gender))return false;closeCart();closeMobileMenu();if(navigateToCatalog(gender==='m'?'sec-masculino':'sec-feminino'))return false;switchTab(gender);document.body.classList.add('collection-view');document.body.classList.toggle('collection-m',gender==='m');document.body.classList.toggle('collection-f',gender==='f');syncMenuState();applyCatalogFilters();const section=byId('catalog-search');section.classList.remove('sl-collection-enter');requestAnimationFrame(()=>section.classList.add('sl-collection-enter'));scrollToCollectionBanner(gender);return false;}
function handleCollectionSelector(gender){if(navigateToCatalog(gender==='m'?'sec-masculino':'sec-feminino'))return false;byId('catalog-query').value='';resetCatalogVisibility();return enterCollectionView(gender);}
function exitCollectionView(){document.body.classList.remove('collection-view','collection-m','collection-f');for(const id of ['sec-masculino','sec-feminino'])if(byId(id))byId(id).hidden=false;syncMenuState();applyCatalogFilters();return false;}
function showAllCollections(){if(navigateToCatalog('shop'))return false;byId('catalog-query').value='';resetCatalogVisibility();exitCollectionView();return scrollToSectionLux('shop');}
function continueShoppingSafely(){closeCart();const detail=currentProduct();if(detail)return handleCollectionSelector(detail.gender);const target=document.body.classList.contains('collection-view')?(activeTab==='m'?'sec-masculino':'sec-feminino'):'colecao-selector';return scrollToSectionLux(target);}
const continueShoppingLux=continueShoppingSafely;
function syncCatalogQuantity(card){
  const output=card.querySelector('.qty-val');if(!output)return;
  const quantity=Math.max(1,Math.min(99,Number(output.textContent)||1));output.textContent=quantity;
  const minus=card.querySelector('[onclick="changeQty(this,-1)"]'),plus=card.querySelector('[onclick="changeQty(this,1)"]');
  if(minus)minus.disabled=quantity<=1;if(plus)plus.disabled=quantity>=99;
}
function changeQty(btn,delta){
  if(btn.disabled||![-1,1].includes(delta))return;
  const card=btn.closest('.card'),el=card.querySelector('.qty-val');
  el.textContent=Math.max(1,Math.min(99,(Number(el.textContent)||1)+delta));syncCatalogQuantity(card);
  el.classList.remove('sl-count-pop');requestAnimationFrame(()=>el.classList.add('sl-count-pop'));
  if(btn.disabled&&document.activeElement===btn)card.querySelector('[onclick="changeQty(this,'+(delta<0?'1':'-1')+')"]')?.focus({preventScroll:true});
}
function setVol(btn,newPrice,oldPrice){const card=btn.closest('.card');card.querySelectorAll('.vbtn').forEach(v=>{const selected=v===btn;v.classList.toggle('on',selected);v.setAttribute('aria-pressed',String(selected));});card.dataset.volume=btn.dataset.ml|| (btn.textContent.includes('10')?'10':'5');const price=card.querySelector('.price-cur');price.textContent='R$ '+newPrice;card.querySelector('.price-old').textContent='R$ '+oldPrice;price.classList.remove('sl-price-change');requestAnimationFrame(()=>price.classList.add('sl-price-change'));}
function makeItem(pid,vol,qty){const p=PRODUCTS.find(p=>p.id===pid);const volume=String(vol).replace(/\D/g,'');if(!p?.available||!p.prices[volume]||!Number.isInteger(qty)||qty<1||qty>99)throw Error('Seleção inválida');return {id:`p${pid}v${volume}`,pid,marca:p.brand,nome:p.name,tipo:p.type,vol:volume+'ML',preco:brl(p.prices[volume]),qty};}
function addItem(pid,volume,qty){const item=makeItem(pid,volume,qty);const old=cart.find(i=>i.id===item.id);if(old)old.qty=Math.min(99,old.qty+qty);else cart.push(item);persistBag();renderCart();return getTotals();}
function buy(btn){const card=btn.closest('.card'),pid=Number(card.dataset.productId),qty=Number(card.querySelector('.qty-val').textContent)||1;addItem(pid,card.dataset.volume,qty);card.querySelector('.qty-val').textContent='1';card.classList.add('sl-added');btn.dataset.idleLabel ||= btn.textContent;clearTimeout(buyFeedback.get(btn));btn.textContent='Adicionado ✓';buyFeedback.set(btn,setTimeout(()=>{btn.textContent=btn.dataset.idleLabel;card.classList.remove('sl-added');},1600));const p=PRODUCTS.find(p=>p.id===pid);toast(`${p.name} · ${card.dataset.volume} ml adicionado à sacola`,true);return false;}
function removeItem(id){cart=cart.filter(i=>i.id!==id);persistBag();renderCart();}
function changeCartQty(id,delta){const item=cart.find(i=>i.id===id);if(!item)return;item.qty=Math.max(1,Math.min(99,item.qty+delta));persistBag();renderCart();}
function syncCheckoutField(key,value){window._checkout[key]=value;if(key==='cep'){scheduleCepCheckout(value);syncPaymentShipping();}else if(Object.hasOwn(cepAutofilled,key))delete cepAutofilled[key];}
function syncCheckoutObs(value){window._orderObs=value;}
function maskPhone(value){const d=value.replace(/\D/g,'').slice(0,11);return d.length>6?`(${d.slice(0,2)}) ${d.slice(2,d.length-4)}-${d.slice(-4)}`:d.length>2?`(${d.slice(0,2)}) ${d.slice(2)}`:d;}
function maskCEP(value){const d=value.replace(/\D/g,'').slice(0,8);return d.length>5?d.slice(0,5)+'-'+d.slice(5):d;}
function selectCheckoutPayment(mode){if(!['pix','cartao','boleto'].includes(mode))return false;window._checkout.pagamento=mode;document.querySelectorAll('.sl-pay-action').forEach(btn=>{const on=btn.dataset.pay===mode;btn.classList.toggle('is-on',on);btn.setAttribute('aria-pressed',String(on));});return false;}
function applyCoupon(){const code=(byId('coupon-input').value||'').trim().toUpperCase();if(!code){window._couponCode='';window._couponPct=0;persistBag();renderCart();return false;}if(!CUPONS[code]){window._couponCode='';window._couponPct=0;persistBag();renderCart();byId('coupon-input').value=code;byId('coupon-msg').textContent='Cupom inválido. Confira o código.';byId('coupon-msg').style.color='#ffb3a7';return false;}window._couponCode=code;window._couponPct=CUPONS[code];persistBag();renderCart();return false;}
function toggleGift(){window._giftWrap=!window._giftWrap;persistBag();renderCart();return false;}
function setCheckoutFieldError(input,message){input.setAttribute('aria-invalid',String(!!message));input.closest('.sl-field').classList.toggle('is-invalid',!!message);const note=byId('field-error-'+input.name);if(note){note.textContent=message;note.hidden=!message;}}
function renderCart(){
  const drawer=byId('cart-drawer'),scroll=drawer.scrollTop,focusId=document.activeElement?.id,focusKey=document.activeElement?.dataset?.focusKey,hadCartFocus=!!document.activeElement?.closest?.('#cart-drawer');
  const totals=getTotals(),changed=lastRenderedTotal!==null&&lastRenderedTotal!==totals.total;lastRenderedTotal=totals.total;
  window._couponDiscount=totals.discount/100;_renderCartLayout();persistBag();
  document.querySelectorAll('#cart-items input[oninput*="syncCheckoutField"]').forEach(input=>{
    input.addEventListener('input',()=>{input.setCustomValidity('');setCheckoutFieldError(input,'');byId('checkout-error').textContent='';});
    input.addEventListener('invalid',event=>{event.preventDefault();setCheckoutFieldError(input,input.validationMessage);});
  });
  if(cart.length){
    byId('checkout-finalize-btn').onclick=finalizeOrder;
    selectCheckoutPayment(window._checkout.pagamento||'pix');
    updateCepUI();
    updatePaymentCheckout();
    if(changed)byId('checkout-summary').classList.add('sl-summary-updated');
  }
  const restore=focusId?byId(focusId):focusKey&&/^[a-z\d-]+$/i.test(focusKey)?document.querySelector(`[data-focus-key="${focusKey}"]`):null;
  const restored=restore&&!restore.disabled?restore:restore?.closest?.('.sl-qty')?.querySelector?.('button:not([disabled])')||(hadCartFocus?drawer.querySelector('button:not([disabled]),a,input'):null);
  restored?.focus({preventScroll:true});drawer.scrollTop=scroll;
  if(changed&&drawer.classList.contains('open'))byId('checkout-announcement').textContent=`${totals.freeShipping?'Total':'Total sem frete'}: ${brl(totals.total)}`;
}
function updateCepUI(message=cepMessage,busy=cepBusy){cepMessage=message;cepBusy=busy;const note=byId('cep-status'),input=byId('checkout-cep');if(note)note.textContent=message;if(input)input.setAttribute('aria-busy',String(busy));}
function prepareCepCode(code){if(code===cepInputCode)return;cepInputCode=code;cepRequest++;cepController?.abort();cepPendingCode='';cepResolvedCode='';for(const [key,value] of Object.entries(cepAutofilled)){if(window._checkout[key]===value){window._checkout[key]='';const input=byId('checkout-'+key);if(input)input.value='';}delete cepAutofilled[key];}updateCepUI('',false);}
function scheduleCepCheckout(value){clearTimeout(cepTimer);const code=String(value).replace(/\D/g,'');prepareCepCode(code);if(code.length!==8)return;cepTimer=setTimeout(()=>lookupCepCheckout(value),300);}
async function fetchCepAddress(code,signal){
  const providers=[{url:`https://viacep.com.br/ws/${code}/json/`,map:d=>({logradouro:d.logradouro,bairro:d.bairro,cidade:d.localidade,uf:d.uf})},{url:`https://brasilapi.com.br/api/cep/v2/${code}`,map:d=>({logradouro:d.street,bairro:d.neighborhood,cidade:d.city,uf:d.state})}];let notFound=0;
  for(const provider of providers){if(signal.aborted)throw Error('CANCELLED');const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,4000);signal.addEventListener('abort',cancel,{once:true});try{const response=await fetch(provider.url,{signal:controller.signal});if(response.status===404){notFound++;continue;}if(!response.ok)throw Error('SERVICE');const data=await response.json();if(data.erro){notFound++;continue;}const address=provider.map(data);if(!address.cidade||!address.uf)throw Error('SERVICE');return Object.fromEntries(Object.entries(address).map(([key,value])=>[key,String(value||'').trim().slice(0,key==='uf'?2:150)]));}catch(error){if(signal.aborted)throw Error('CANCELLED');}finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}}
  throw Error(notFound===providers.length?'NOT_FOUND':'SERVICE');
}
async function lookupCepCheckout(value){
  clearTimeout(cepTimer);const code=String(value).replace(/\D/g,'');prepareCepCode(code);if(code.length!==8||code===cepResolvedCode)return;if(code===cepPendingCode&&cepPromise)return cepPromise;
  const ticket=cepRequest,snapshot={...window._checkout};cepController=new AbortController();const signal=cepController.signal;cepPendingCode=code;updateCepUI('Buscando endereço…',true);
  cepPromise=(async()=>{try{const data=cepCache.get(code)||await fetchCepAddress(code,signal);if(ticket!==cepRequest||signal.aborted)return;cepCache.set(code,data);if(cepCache.size>30)cepCache.delete(cepCache.keys().next().value);for(const [key,value] of Object.entries(data)){if(value&&window._checkout[key]===snapshot[key]){window._checkout[key]=value;cepAutofilled[key]=value;const input=byId('checkout-'+key);if(input){input.value=value;input.setCustomValidity('');setCheckoutFieldError(input,'');}}}cepResolvedCode=code;updateCepUI(data.logradouro&&data.bairro?'Endereço encontrado. Confira os dados e informe o número.':'Cidade e UF encontradas. Complete o logradouro, bairro e número.',false);}catch(error){if(ticket===cepRequest&&!signal.aborted)updateCepUI(error.message==='NOT_FOUND'?'CEP não encontrado. Confira os oito dígitos.':'Não foi possível consultar agora. Você pode preencher o endereço manualmente.',false);}finally{if(ticket===cepRequest){cepPendingCode='';cepPromise=null;}}})();return cepPromise;
}
function buildOrderMessage(){const C=window._checkout,t=getTotals(),lines=['Olá! Quero confirmar meu pedido Sillocta.','',...cart.map(i=>`${i.qty} × ${i.marca} ${i.nome} | ${i.vol} | ${brl(Math.round(parsePrice(i.preco)*100)*i.qty)}`),'',`Subtotal: ${brl(t.subtotal)}`];if(t.discount)lines.push(`Cupom ${window._couponCode} (${window._couponPct}%): − ${brl(t.discount)}`);if(t.gift)lines.push('Embrulho para presente: R$ 9,90');lines.push(`Frete: ${t.freeShipping?'Grátis':'A confirmar no atendimento'}`,`${t.freeShipping?'Total':'Total sem frete'}: ${brl(t.total)}`,'',`Nome: ${C.nome}`,`Telefone: ${C.fone}`);if(C.email)lines.push(`E-mail: ${C.email}`);lines.push(`Endereço: ${C.logradouro}, ${C.numero}${C.complemento?' · '+C.complemento:''}`,`Bairro: ${C.bairro}`,`Cidade: ${C.cidade} / ${C.uf}`,`CEP: ${C.cep}`,`Pagamento: ${{pix:'PIX',cartao:'Cartão',boleto:'Boleto'}[C.pagamento]||'PIX'}`);if(window._orderObs)lines.push(`Observações: ${window._orderObs}`);lines.push('','Aguardo confirmação de disponibilidade, entrega e pagamento.');return lines.join('\n');}
function finalizeOrder(event){event?.preventDefault();if(!cart.length||whatsappOpening)return false;const C=window._checkout;let firstInvalid=null;for(const input of document.querySelectorAll('#cart-items .sl-field input')){C[input.name]=input.value.trim();if(input.required&&!input.value.trim())input.setCustomValidity('Preencha este campo.');else if(input.name==='fone'&&!/^\d{10,11}$/.test(input.value.replace(/\D/g,'')))input.setCustomValidity('Informe o telefone com DDD.');else if(input.name==='cep'&&!/^\d{8}$/.test(input.value.replace(/\D/g,'')))input.setCustomValidity('Informe um CEP com 8 números.');else if(input.name==='uf'&&!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(input.value.toUpperCase()))input.setCustomValidity('Informe uma UF válida.');else input.setCustomValidity('');const valid=input.checkValidity();setCheckoutFieldError(input,valid?'':input.validationMessage);if(!valid&&!firstInvalid)firstInvalid=input;}if(firstInvalid){byId('checkout-error').textContent='Confira os campos indicados para continuar.';firstInvalid.focus({preventScroll:true});firstInvalid.scrollIntoView({behavior:motion()?'smooth':'auto',block:'center'});return false;}if(paymentFlow.enabled){submitOnlineOrder();return false;}openWhatsAppCheckout();return false;}
const checkout=finalizeOrder;
function aviseMe(name){window.open('https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent('Olá! Gostaria de saber quando '+name+' estará disponível novamente.'),'_blank','noopener');return false;}
function askForKits(){window.open('https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent('Olá! Gostaria de conhecer as opções de kits de decants.'),'_blank','noopener');}
function resetCatalogVisibility(){Object.assign(catalogState,{mode:'all',brand:'',price:'',available:false,savedOnly:false,sort:'curated'});if(byId('catalog-query'))byId('catalog-query').value='';syncCatalogControls();applyCatalogFilters();}
function clearSearch(){if(navigateToCatalog('shop'))return false;resetCatalogVisibility();toast('Filtros removidos');return false;}
function openSearch(){if(navigateToCatalog('catalog-search'))return;exitCollectionView();byId('catalog-search').hidden=false;scrollToSectionLux('catalog-search');byId('catalog-query').focus({preventScroll:true});}
function filterCatalog(mode){if(navigateToCatalog('catalog-search',mode))return;catalogState.mode=['new','niche','designer'].includes(mode)?mode:'all';exitCollectionView();byId('catalog-search').hidden=false;applyCatalogFilters();scrollToSectionLux('catalog-search');}
function checkoutField(key,label,C,options={}){
  const type=options.type||'text',mask=key==='fone'?'this.value=maskPhone(this.value);':key==='cep'?'this.value=maskCEP(this.value);':key==='uf'?'this.value=this.value.toUpperCase();':'';
  const autocomplete={nome:'name',fone:'tel',email:'email',cep:'postal-code',logradouro:'address-line1',cidade:'address-level2',uf:'address-level1',complemento:'address-line2'}[key]||'off';
  const optional=key==='complemento'||key==='email'&&!paymentFlow.enabled,max=key==='uf'?2:key==='fone'?15:key==='cep'?9:key==='nome'?100:150;
  return `<div class="sl-field ${options.full?'sl-field-full':''}"><label class="sl-label" for="checkout-${key}">${label}${optional?'<span class="sl-optional">Opcional</span>':''}</label><input id="checkout-${key}" name="${key}" class="sl-input" type="${type}" value="${C[key]||''}" placeholder="${options.placeholder||''}" maxlength="${max}" autocomplete="${autocomplete}" ${optional?'':'required'} ${key==='cep'?'inputmode="numeric"':''} aria-describedby="field-error-${key}${key==='cep'?' cep-status':''}" oninput="${mask}syncCheckoutField('${key}',this.value)" ${key==='cep'?'onblur="lookupCepCheckout(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}"':''}><span id="field-error-${key}" class="sl-field-error" hidden></span></div>`;
}
function _renderCartLayout(){
  const el=byId('cart-items'),footer=byId('cart-footer');footer.innerHTML='';
  if(!cart.length){el.innerHTML=`<div class="sl-empty-bag"><i class="fas fa-shopping-bag" aria-hidden="true"></i><h2>Sua sacola está vazia</h2><p>Encontre sua próxima fragrância na coleção.</p><button type="button" class="sl-cta-secondary" data-continue-shopping="1">Explorar coleção</button></div>`;return;}
  const C=Object.fromEntries(Object.entries(window._checkout).map(([k,v])=>[k,escapeHtml(v)])),t=getTotals();
  const coupon=escapeHtml(window._couponCode||''),gift=window._giftWrap,faltaFrete=Math.max(0,29900-t.subtotal);
  const itemsHtml=cart.map(i=>{
    const p=PRODUCTS.find(p=>p.id===i.pid),image=productImage(p);
    return `<article class="sl-checkout-item"><div class="sl-checkout-thumb"><img src="${escapeHtml(image)}" alt="" width="72" height="90" decoding="async"></div><div class="sl-item-detail"><p class="sl-checkout-brand">${escapeHtml(i.marca)}</p><h3 class="sl-checkout-name">${escapeHtml(i.nome)}</h3><p class="sl-checkout-meta">${escapeHtml(i.tipo)} · ${i.vol.replace('ML',' ml')}</p><div class="sl-item-controls"><div class="sl-qty" role="group" aria-label="Quantidade de ${escapeHtml(i.nome)} ${i.vol}"><button type="button" data-focus-key="minus-${i.id}" onclick="changeCartQty('${i.id}',-1)" aria-label="Diminuir quantidade de ${escapeHtml(i.nome)}" ${i.qty<=1?'disabled':''}>${checkoutControlIcon('minus')}</button><span>${i.qty}</span><button type="button" data-focus-key="plus-${i.id}" onclick="changeCartQty('${i.id}',1)" aria-label="Aumentar quantidade de ${escapeHtml(i.nome)}" ${i.qty>=99?'disabled':''}>${checkoutControlIcon('plus')}</button></div><strong class="sl-item-price">${brl(Math.round(parsePrice(i.preco)*100)*i.qty)}</strong></div></div><button type="button" class="sl-remove" data-focus-key="remove-${i.id}" onclick="removeItem('${i.id}')" aria-label="Remover ${escapeHtml(i.nome)} ${i.vol} da sacola"><svg class="sl-close-icon" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg></button></article>`;
  }).join('');
  const payments={pix:['qrcode','PIX'],cartao:['card','Cartão'],boleto:['barcode','Boleto']};
  el.innerHTML=`<div class="sl-checkout-wrap">
    <div class="sl-checkout-intro"><span class="sl-checkout-service"><i class="fab fa-whatsapp" aria-hidden="true"></i> Atendimento pelo WhatsApp</span><p>Confira sua seleção e os dados de entrega.</p></div>
    <section class="sl-checkout-block" aria-labelledby="checkout-items-title"><h2 id="checkout-items-title" class="sl-checkout-kicker">Sua seleção</h2>${itemsHtml}</section>
    <section class="sl-checkout-block" aria-labelledby="checkout-extras-title"><h2 id="checkout-extras-title" class="sl-checkout-kicker">Cupom e presente</h2><label class="sl-label" for="coupon-input">Código do cupom</label><div class="sl-inline"><input id="coupon-input" class="sl-input" type="text" autocomplete="off" placeholder="Digite seu código" value="${coupon}" aria-describedby="coupon-msg" oninput="syncCouponButton(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();applyCoupon();}"><button type="button" class="sl-coupon-btn" id="checkout-coupon-btn" onclick="return applyCoupon()" ${window._couponPct?'disabled':''}>${window._couponPct?'Aplicado ✓':'Aplicar'}</button></div><p id="coupon-msg" class="sl-coupon-message ${window._couponPct?'is-success':''}" role="status">${window._couponPct?`${coupon} aplicado · ${window._couponPct}% de desconto`:'Tem um cupom? Aplique antes de enviar o pedido.'}</p><button type="button" class="sl-gift-wrap" data-focus-key="gift-wrap" role="switch" aria-checked="${!!gift}" aria-label="Embrulho para presente por R$ 9,90" onclick="return toggleGift()"><span class="sl-gift-copy">${checkoutControlIcon('gift')}<span><span class="sl-gift-title">Embrulho para presente</span><span class="sl-gift-description">Papel especial e fita dourada · R$ 9,90</span></span></span><span id="gift-toggle" class="sl-gift-toggle" aria-hidden="true"><span></span></span></button></section>
    <section class="sl-checkout-block" aria-labelledby="checkout-contact-title"><h2 id="checkout-contact-title" class="sl-checkout-kicker">Seus dados</h2><div class="sl-grid">${checkoutField('nome','Nome completo',C,{full:true,placeholder:'Seu nome'})}${checkoutField('fone','Telefone com DDD',C,{type:'tel',placeholder:'(00) 00000-0000'})}${checkoutField('email','E-mail',C,{type:'email',placeholder:'voce@email.com'})}</div></section>
    <section class="sl-checkout-block" aria-labelledby="checkout-address-title"><h2 id="checkout-address-title" class="sl-checkout-kicker">Entrega</h2><p class="sl-field-note">O CEP busca seu endereço. Confira os dados e informe o número. O prazo e o frete são confirmados pelo atendimento.</p><div class="sl-grid">${checkoutField('cep','CEP',C,{placeholder:'00000-000'})}${checkoutField('numero','Número',C,{placeholder:'Número ou S/N'})}${checkoutField('logradouro','Logradouro',C,{full:true,placeholder:'Rua ou avenida'})}${checkoutField('complemento','Complemento',C,{full:true,placeholder:'Apartamento, bloco ou referência'})}${checkoutField('bairro','Bairro',C,{full:true,placeholder:'Seu bairro'})}${checkoutField('cidade','Cidade',C,{placeholder:'Sua cidade'})}${checkoutField('uf','UF',C,{placeholder:'PE'})}</div><p id="cep-status" class="sl-field-note" role="status"></p></section>
    <section class="sl-checkout-block" aria-labelledby="checkout-payment-title"><h2 id="checkout-payment-title" class="sl-checkout-kicker">Pagamento</h2><div class="sl-pay-grid" role="group" aria-label="Preferência de pagamento">${Object.entries(payments).map(([mode,[icon,label]])=>`<button type="button" onclick="selectCheckoutPayment('${mode}')" class="sl-pay-btn sl-pay-action ${window._checkout.pagamento===mode?'is-on':''}" data-pay="${mode}" aria-pressed="${window._checkout.pagamento===mode}"><span class="sl-option-check" aria-hidden="true">✓</span>${checkoutControlIcon(icon)}<span>${label}</span></button>`).join('')}</div><p class="sl-field-note">Escolha sua preferência. O pagamento será confirmado no atendimento.</p></section>
    <section class="sl-checkout-block" aria-labelledby="checkout-observations-title"><h2 id="checkout-observations-title" class="sl-checkout-kicker">Observações <span class="sl-optional">Opcional</span></h2><label class="sl-sr-only" for="order-obs">Observações do pedido</label><textarea id="order-obs" class="sl-textarea" maxlength="1000" placeholder="Algo que devemos saber sobre seu pedido?" oninput="syncCheckoutObs(this.value)">${escapeHtml(window._orderObs||'')}</textarea></section>
    <section id="checkout-summary" class="sl-checkout-block sl-order-summary" aria-labelledby="checkout-summary-title"><h2 id="checkout-summary-title" class="sl-checkout-kicker">Resumo do pedido</h2><div class="sl-summary"><div class="sl-summary-row"><span>Produtos</span><strong>${brl(t.subtotal)}</strong></div>${t.discount?`<div class="sl-summary-row sl-discount-row"><span>Desconto <small>${coupon}</small></span><strong>− ${brl(t.discount)}</strong></div>`:''}<div class="sl-summary-row"><span>Embalagem para presente</span><strong>${t.gift?brl(t.gift):'Não selecionada'}</strong></div><div class="sl-summary-row"><span>Frete</span><strong>${t.freeShipping?'Grátis':'A confirmar'}</strong></div><div class="sl-summary-row total"><span>${t.freeShipping?'Total':'Total sem frete'}</span><strong id="checkout-total">${brl(t.total)}</strong></div></div><p class="sl-shipping-note">${t.freeShipping?'Frete grátis aplicado ao pedido.':`Faltam ${brl(faltaFrete)} em produtos para frete grátis. O valor de entrega será confirmado no WhatsApp.`}</p></section>
    <div class="sl-checkout-actions"><p id="checkout-error" class="sl-error" role="alert"></p><button type="button" id="checkout-finalize-btn" class="sl-cta sl-checkout-primary" aria-describedby="checkout-submit-note">${checkoutControlIcon('whatsapp')}<span>Finalizar pelo WhatsApp</span></button><p id="checkout-submit-note" class="sl-note">Seu pedido será enviado ao atendimento para confirmar entrega e pagamento.</p><button type="button" class="sl-cta-secondary" onclick="return continueShoppingSafely()">Continuar comprando</button></div>
  </div>`;
}


// Hosted checkout is activated only after server credentials and shipping are configured.
function paymentCartData(){return {items:cart.map(i=>({pid:i.pid,volume:i.vol.replace('ML',''),quantity:i.qty})),coupon:window._couponCode||'',gift:!!window._giftWrap};}
function paymentShippingKey(){return JSON.stringify({...paymentCartData(),cep:String(window._checkout.cep||'').replace(/\D/g,'')});}
async function paymentApi(path,options={}){let response;try{response=await fetch('/api/checkout/'+path,{...options,credentials:'same-origin',headers:{'content-type':'application/json',...options.headers},signal:options.signal||AbortSignal.timeout(15000)});}catch(error){if(error.name==='AbortError')throw error;throw Error('Não foi possível conectar. Seus dados foram mantidos; tente novamente.');}const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível continuar. Tente novamente.');return data;}
function syncPaymentShipping(){
  if(!paymentFlow.enabled)return;
  const key=paymentShippingKey();if(key===paymentFlow.shippingKey)return;
  paymentFlow.shippingKey=key;paymentFlow.sequence++;paymentFlow.controller?.abort();clearTimeout(paymentFlow.timer);
  paymentFlow.quote=null;paymentFlow.selected='';paymentFlow.error='';paymentFlow.busy=false;
  renderPaymentShipping();
  if(cart.length&&String(window._checkout.cep||'').replace(/\D/g,'').length===8)paymentFlow.timer=setTimeout(()=>loadPaymentShipping(),550);
}
async function loadPaymentShipping(){
  clearTimeout(paymentFlow.timer);const cep=String(window._checkout.cep||'').replace(/\D/g,'');if(cep.length!==8||!cart.length||paymentFlow.busy)return;
  const ticket=++paymentFlow.sequence,key=paymentShippingKey();paymentFlow.controller?.abort();paymentFlow.controller=new AbortController();const controller=paymentFlow.controller,timer=setTimeout(()=>controller.abort(),15000);
  paymentFlow.busy=true;paymentFlow.error='';renderPaymentShipping();
  try{const quote=await paymentApi('quote',{method:'POST',body:JSON.stringify({...paymentCartData(),cep}),signal:controller.signal});if(ticket!==paymentFlow.sequence||key!==paymentShippingKey())return;paymentFlow.quote=quote;paymentFlow.selected=quote.options.length===1?quote.options[0].id:'';}
  catch(error){if(ticket===paymentFlow.sequence){paymentFlow.quote=null;paymentFlow.error=error.name==='AbortError'?'A consulta demorou. Tente calcular a entrega novamente.':error.message;}}
  finally{clearTimeout(timer);if(ticket===paymentFlow.sequence){paymentFlow.busy=false;renderPaymentShipping();}}
}
function selectPaymentShipping(id){if(!paymentFlow.quote?.options.some(o=>o.id===id))return;paymentFlow.selected=id;renderPaymentShipping();}
function renderPaymentShipping(){
  if(!paymentFlow.enabled||!cart.length)return;
  const region=byId('checkout-shipping-options');if(!region)return;
  const cep=String(window._checkout.cep||'').replace(/\D/g,''),options=paymentFlow.quote?.options||[];
  region.innerHTML=`<h2 class="sl-checkout-kicker">Forma de entrega</h2><div class="sl-shipping-options" role="group" aria-label="Selecione a entrega">${options.map(o=>`<button type="button" class="sl-shipping-choice ${paymentFlow.selected===o.id?'is-on':''}" aria-pressed="${paymentFlow.selected===o.id}" onclick="selectPaymentShipping('${escapeHtml(o.id)}')"><span class="sl-option-check" aria-hidden="true">✓</span><span class="sl-shipping-copy"><strong>${escapeHtml(o.name)}</strong><small>${o.days?`Estimativa da transportadora: ${o.days} dias úteis após postagem`:'Prazo informado no acompanhamento do pedido'}</small></span><strong>${o.priceCents?brl(o.priceCents):'Grátis'}</strong></button>`).join('')}</div><p class="sl-field-note" role="status">${escapeHtml(paymentFlow.busy?'Consultando entrega…':paymentFlow.error||(!options.length?'Informe o CEP para consultar a entrega.':'Selecione a entrega para conferir o total.'))}</p>${cep.length===8&&!paymentFlow.busy?'<button type="button" class="sl-cta-secondary sl-recalculate" onclick="loadPaymentShipping()">Calcular entrega novamente</button>':''}`;
  region.setAttribute('aria-busy',String(paymentFlow.busy));
  const t=getTotals(),chosen=options.find(o=>o.id===paymentFlow.selected),summary=byId('checkout-summary'),rows=summary?.querySelectorAll('.sl-summary-row');
  if(rows){const freight=rows[rows.length-2];freight.querySelector('strong').textContent=chosen?(chosen.priceCents?brl(chosen.priceCents):'Grátis'):'Selecione a entrega';rows[rows.length-1].querySelector('span').textContent=chosen?'Total':'Total sem frete';byId('checkout-total').textContent=brl(t.total+(chosen?.priceCents||0));summary.querySelector('.sl-shipping-note').textContent=t.freeShipping?'Frete grátis aplicado ao pedido.':chosen?'Entrega incluída no total.':`Faltam ${brl(Math.max(0,29900-t.subtotal))} em produtos para frete grátis.`;}
  const button=byId('checkout-finalize-btn');if(button){button.setAttribute('aria-disabled',String(!!paymentFlow.submitting));button.querySelector('span').textContent=paymentFlow.submitting?'Preparando pagamento…':'Pagar com Mercado Pago';}
}
function updatePaymentCheckout(){
  if(!paymentFlow.enabled||!cart.length)return;
  const intro=byId('cart-items').querySelector('.sl-checkout-service');intro.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i> Checkout seguro';
  const payment=byId('checkout-payment-title').closest('section');payment.innerHTML='<h2 class="sl-checkout-kicker">Pagamento</h2><p class="sl-field-note">Você escolhe a forma de pagamento no ambiente seguro do Mercado Pago. As opções disponíveis aparecem na finalização.</p>';
  const address=byId('checkout-address-title').closest('section');if(!byId('checkout-shipping-options'))address.insertAdjacentHTML('afterend','<section id="checkout-shipping-options" class="sl-checkout-block" aria-label="Entrega"></section>');
  const button=byId('checkout-finalize-btn');button.href='#';button.innerHTML='<i class="fas fa-lock" aria-hidden="true"></i><span>Pagar com Mercado Pago</span>';
  button.parentElement.querySelector('.sl-note').textContent='Seu pedido será confirmado após a aprovação do pagamento.';
  const email=byId('checkout-email');if(email){email.required=true;email.closest('.sl-field').querySelector('.sl-optional')?.remove();}
  syncPaymentShipping();renderPaymentShipping();
}
async function submitOnlineOrder(){
  if(paymentFlow.submitting)return;
  const quote=paymentFlow.quote,serviceId=paymentFlow.selected;
  if(!quote||quote.expiresAt<Date.now()||!serviceId){byId('checkout-error').textContent=quote&&quote.expiresAt<Date.now()?'A cotação expirou. Atualize a entrega.':'Selecione a forma de entrega para continuar.';byId('checkout-shipping-options')?.scrollIntoView({behavior:motion()?'smooth':'auto',block:'center'});if(!quote||quote.expiresAt<Date.now())loadPaymentShipping();return;}
  const payload={...paymentCartData(),customer:{...window._checkout,observacoes:window._orderObs||''},quoteId:quote.quoteId,serviceId},fingerprint=JSON.stringify(payload);
  if(paymentFlow.attempt?.fingerprint!==fingerprint)paymentFlow.attempt={fingerprint,requestKey:crypto.randomUUID()};
  paymentFlow.submitting=true;byId('checkout-error').textContent='';renderPaymentShipping();
  try{const result=await paymentApi('order',{method:'POST',body:JSON.stringify({...payload,requestKey:paymentFlow.attempt.requestKey})});const u=new URL(result.checkoutUrl);if(u.protocol!=='https:'||!['mercadopago.com.br','www.mercadopago.com.br'].includes(u.hostname)||u.port||u.username||u.password||!u.pathname.startsWith('/checkout/'))throw Error('Não foi possível validar o link de pagamento.');
    // Do not discard a customer edit made while the network request was in progress.
    const current=JSON.stringify({...paymentCartData(),customer:{...window._checkout,observacoes:window._orderObs||''},quoteId:paymentFlow.quote?.quoteId,serviceId:paymentFlow.selected});if(current!==fingerprint)throw Error('Você alterou o pedido. Confira os dados antes de continuar.');
    window.location.assign(u.href);
  }catch(error){byId('checkout-error').textContent=error.message;}
  finally{paymentFlow.submitting=false;renderPaymentShipping();}
}
function showPaymentStatus(orderId){
  openFooterInfo('como');byId('footer-info-kicker').textContent='Seu pedido';byId('footer-info-title').textContent='Conferindo pagamento';byId('footer-info-subtitle').textContent='Aguarde a confirmação do Mercado Pago.';byId('footer-info-body').innerHTML='<p class="sl-field-note" role="status">Consultando o pedido…</p>';byId('footer-info-actions').innerHTML='<button type="button" class="footer-info-btn secondary" onclick="closeFooterInfo()">Continuar navegando</button>';
  let tries=0;
  const check=async()=>{try{const result=await paymentApi('status?id='+encodeURIComponent(orderId)),approved=result.status==='approved',pending=['created','pending'].includes(result.status);
    byId('footer-info-title').textContent=approved?'Pagamento aprovado':pending?'Pagamento pendente':['refunded','partially_refunded'].includes(result.status)?'Pedido atualizado':'Pagamento não concluído';
    byId('footer-info-subtitle').textContent=approved?'Recebemos a confirmação do Mercado Pago.':pending?'O pedido será confirmado assim que o Mercado Pago aprovar o pagamento.':'Consulte o atendimento para acompanhar seu pedido.';
    byId('footer-info-body').innerHTML=`<div class="footer-info-card"><h4>Total do pedido</h4><p>${brl(result.totalCents)}</p><p>Referência: ${escapeHtml(orderId)}</p></div>`;
    byId('footer-info-actions').innerHTML=`${pending&&result.checkoutUrl?`<a class="footer-info-btn primary" href="${escapeHtml(result.checkoutUrl)}">Continuar pagamento</a>`:''}<button type="button" class="footer-info-btn secondary" onclick="closeFooterInfo()">Continuar navegando</button><a class="footer-info-btn secondary" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Olá! Quero acompanhar meu pedido Sillocta '+orderId)}" target="_blank" rel="noopener">Atendimento</a>`;
    if(approved&&!paidOrders.includes(orderId)){for(const paid of result.items){const item=cart.find(i=>i.pid===paid.pid&&i.vol===paid.volume+'ML');if(item)item.qty=Math.max(0,item.qty-paid.quantity);}cart=cart.filter(i=>i.qty>0);paidOrders.push(orderId);persistBag();renderCart();}
    if(pending&&++tries<12&&!document.hidden&&byId('footer-info-overlay').classList.contains('open'))setTimeout(check,5000);
  }catch(error){byId('footer-info-title').textContent='Confirmação indisponível';byId('footer-info-subtitle').textContent=error.message;byId('footer-info-actions').innerHTML=`<button type="button" class="footer-info-btn primary" onclick="showPaymentStatus('${orderId}')">Consultar novamente</button><button type="button" class="footer-info-btn secondary" onclick="closeFooterInfo()">Fechar</button>`;}};
  check();
}


(function(){
  var CONTENT = {
    sobre: {
      kicker: 'Sobre a Sillocta',
      title: 'Curadoria rara. Presença memorável.',
      subtitle: 'A Sillocta seleciona fragrâncias com intenção: decants impecáveis, linguagem elegante e uma experiência pensada para quem valoriza assinatura olfativa.',
      body: [
        {title:'O que entregamos', html:'<p>Uma coleção curada para revelar, comparar e encontrar a fragrância certa com praticidade e um acabamento de marca premium.</p>'},
        {title:'Nossa postura', html:'<p>Transparência, refinamento e consistência. O objetivo é aproximar você de perfumes extraordinários sem fricção e sem ruído visual.</p>'},
        {title:'Nossa promessa', html:'<p>Que cada interação com a Sillocta soe como casa de luxo: direta, bonita e confiável.</p>'}
      ],
      actions:[{label:'Explorar coleção', kind:'secondary', action:'shop'},{label:'WhatsApp', kind:'primary', href:'https://wa.me/5585991857074'}]
    },
    como: {
      kicker: 'Como funciona',
      title: 'Escolha. Finalize. Receba com elegância.',
      subtitle: 'Escolha os decants, revise a sacola e envie o pedido ao atendimento.',
      body: [
        {title:'1. Você escolhe', html:'<p>Vá navegando pela curadoria e monte o pedido com volumes e quantidades do seu jeito.</p>'},
        {title:'2. Entrega e pagamento', html:'<p>O CEP preenche o endereço na sacola. O atendimento confirma o frete, o prazo e a forma de pagamento pelo WhatsApp antes de concluir a compra.</p>'},
        {title:'3. Confirmação e envio', html:'<p>Após a confirmação do pedido e do pagamento, o atendimento informa a preparação e compartilha o código de rastreio quando houver postagem.</p>'}
      ],
      actions:[{label:'Montar pedido', kind:'primary', action:'shop'},{label:'Abrir WhatsApp', kind:'secondary', href:'https://wa.me/5585991857074'}]
    },
    autenticidade: {
      kicker: 'Autenticidade',
      title: 'Original no aroma, rigoroso no processo.',
      subtitle: 'A confiança nasce da origem, do cuidado no fracionamento e da apresentação limpa do produto.',
      body: [
        {title:'Curadoria', html:'<p>Trabalhamos com fragrâncias escolhidas pela força olfativa, performance e coerência com a proposta da maison.</p>'},
        {title:'Manipulação', html:'<p>Cada etapa é tratada com cuidado técnico e assepsia, para preservar a experiência e a integridade do perfume.</p>'},
        {title:'Comunicação', html:'<p>Se você quer saber mais sobre origem, perfil olfativo ou indicação de uso, o atendimento responde com objetividade.</p>'}
      ],
      actions:[{label:'Falar no WhatsApp', kind:'primary', href:'https://wa.me/5585991857074'},{label:'Ver coleção', kind:'secondary', action:'shop'}]
    },
    trocas: {
      kicker: 'Trocas e devoluções',
      title: 'Clareza primeiro. Solução depois.',
      subtitle: 'Quando existe um ponto de atenção, a resposta precisa ser objetiva, humana e rápida.',
      body: [
        {title:'Análise do caso', html:'<p>Recebemos a informação, entendemos o contexto e orientamos os próximos passos com clareza.</p>'},
        {title:'Tratativa', html:'<p>Se houver avaria, divergência ou qualquer problema no recebimento, o caminho é resolver com respeito e agilidade.</p>'},
        {title:'Canal ideal', html:'<p>O WhatsApp é o jeito mais eficiente de encaminhar o caso com fotos, pedido e uma breve descrição do ocorrido.</p>'}
      ],
      actions:[{label:'Solicitar atendimento', kind:'primary', href:'https://wa.me/5585991857074'},{label:'Fechar', kind:'secondary', action:'close'}]
    },
    rastreio: {
      kicker: 'Rastrear pedido',
      title: 'Seu pedido, acompanhado de perto.',
      subtitle: 'Da confirmação ao envio, a comunicação segue objetiva para que você saiba em que etapa está.',
      body: [
        {title:'Após a confirmação', html:'<p>Assim que o pedido é aprovado, a preparação entra no fluxo operacional e você é informado quando o envio é concluído.</p>'},
        {title:'Código de rastreio', html:'<p>Quando houver postagem, o código é compartilhado para acompanhamento do trajeto.</p>'},
        {title:'Consulta rápida', html:'<p>Se quiser verificar o status agora, envie seu nome e número do pedido pelo WhatsApp.</p>'}
      ],
      actions:[{label:'Consultar no WhatsApp', kind:'primary', href:'https://wa.me/5585991857074'},{label:'Voltar à home', kind:'secondary', action:'home'}]
    }
  };
  function q(id){ return document.getElementById(id); }
  function closeModal(){
    var o=q('footer-info-overlay');
    if(!o) return false;
    o.classList.remove('open');
    o.setAttribute('aria-hidden','true');
    document.body.classList.remove('footer-info-open');
    return false;
  }
  function goShop(){ closeModal(); var t=document.getElementById('shop') || document.getElementById('hero'); if(t && t.scrollIntoView) t.scrollIntoView({behavior:'smooth', block:'start'}); return false; }
  function goHome(){ closeModal(); var t=document.getElementById('hero') || document.getElementById('shop'); if(t && t.scrollIntoView) t.scrollIntoView({behavior:'smooth', block:'start'}); return false; }
  function renderActions(actions){
    return actions.map(function(btn){
      if(btn.href) return '<a class="footer-info-btn '+btn.kind+'" href="'+btn.href+'" target="_blank" rel="noopener noreferrer">'+btn.label+'</a>';
      if(btn.action==='shop') return '<button class="footer-info-btn '+btn.kind+'" onclick="return footerInfoGoShop()">'+btn.label+'</button>';
      if(btn.action==='home') return '<button class="footer-info-btn '+btn.kind+'" onclick="return footerInfoGoHome()">'+btn.label+'</button>';
      return '<button class="footer-info-btn '+btn.kind+'" onclick="return closeFooterInfo()">'+btn.label+'</button>';
    }).join('');
  }
  window.closeFooterInfo = closeModal;
  window.footerInfoGoShop = goShop;
  window.footerInfoGoHome = goHome;
  window.openFooterInfo = function(key){
    var data = CONTENT[key];
    if(key==='como'&&paymentFlow.enabled)data={kicker:'Como funciona',title:'Escolha. Finalize. Receba com elegância.',subtitle:'Monte sua seleção, confira a entrega e finalize com segurança.',body:[{title:'1. Sua seleção',html:'<p>Escolha fragrâncias, volumes e quantidades e confira os itens na sacola.</p>'},{title:'2. Entrega e pagamento',html:'<p>Informe seu CEP, selecione a entrega e conclua o pagamento no Mercado Pago.</p>'},{title:'3. Confirmação',html:'<p>Seu pedido é confirmado após a aprovação do pagamento. O atendimento acompanha a preparação e a entrega.</p>'}],actions:[{label:'Montar pedido',kind:'primary',action:'shop'},{label:'Atendimento',kind:'secondary',href:'https://wa.me/5585991857074'}]};
    if(!data) return false;
    q('footer-info-kicker').textContent = data.kicker;
    q('footer-info-title').textContent = data.title;
    q('footer-info-subtitle').textContent = data.subtitle;
    q('footer-info-body').innerHTML = data.body.map(function(item){ return '<div class="footer-info-card"><h4>'+item.title+'</h4>'+item.html+'</div>'; }).join('');
    q('footer-info-actions').innerHTML = renderActions(data.actions);
    q('footer-info-overlay').classList.add('open');
    q('footer-info-overlay').setAttribute('aria-hidden','false');
    document.body.classList.add('footer-info-open');
    return false;
  };
  document.addEventListener('click', function(e){ if(e.target === q('footer-info-overlay')) closeModal(); }, true);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeModal(); });
  var c=q('footer-info-close'); if(c) c.onclick = closeModal;
})();
// Perfume detail pages use the same catalog, bag and checkout controller.
const localHomeTitle=document.title;
const localHomeDescription=document.querySelector('meta[name="description"]')?.content||'';
let productButtonTimer;
function currentProduct(){return PRODUCTS.find(p=>p.id===Number(byId('product-page')?.dataset.productId))||null;}
function isStandaloneStorefront(){return window.location.protocol==='file:'||document.body.hasAttribute('data-sillocta-standalone');}
function productImage(p){return document.querySelector(`.card[data-product-id="${p.id}"] .img-box img`)?.getAttribute('src')||'/'+p.image;}
function removeLocalProduct(){
  if(!document.body.classList.contains('sl-local-product'))return;
  clearTimeout(productButtonTimer);byId('product-page')?.remove();document.body.classList.remove('sl-local-product','sl-detail-view');
  document.title=localHomeTitle;const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=localHomeDescription;
  syncMenuState();
}
function navigateToCatalog(section='',mode=''){
  if(!currentProduct())return false;
  if(!isStandaloneStorefront()){
    const query=['new','niche','designer','saved'].includes(mode)?'?catalog='+mode:'';
    window.location.assign('/'+query+(section?'#'+section:''));return true;
  }
  const url=new URL(window.location.href);url.hash=section;history.pushState({},'',url.href);removeLocalProduct();return false;
}
function updateProductSelection(){
  const p=currentProduct(),page=byId('product-page');if(!p||!page)return;
  const volume=page.dataset.volume,quantity=Number(byId('product-quantity')?.textContent)||1;
  byId('product-price').textContent=brl(p.prices[volume]);byId('product-old-price').textContent=brl(p.oldPrices[volume]);
  if(byId('product-total'))byId('product-total').textContent=brl(p.prices[volume]*quantity);
  for(const [id,disabled] of [['product-minus',quantity<=1],['product-plus',quantity>=99]])if(byId(id))byId(id).disabled=disabled;
}
function selectProductVolume(button){
  const p=currentProduct(),volume=button.dataset.productVolume;if(!p?.available||!p.prices[volume])return;
  byId('product-page').dataset.volume=volume;
  byId('product-page').querySelectorAll('[data-product-volume]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  updateProductSelection();
}
function changeProductQuantity(delta){
  if(!currentProduct()?.available||![-1,1].includes(delta))return;
  const output=byId('product-quantity'),focused=document.activeElement;output.textContent=Math.max(1,Math.min(99,(Number(output.textContent)||1)+delta));updateProductSelection();
  if(focused?.disabled&&['product-minus','product-plus'].includes(focused.id))byId(focused.id==='product-minus'?'product-plus':'product-minus').focus({preventScroll:true});
}
function addProductToBag(button){
  const p=currentProduct();if(!p?.available||button.disabled)return false;
  const volume=byId('product-page').dataset.volume,quantity=Number(byId('product-quantity').textContent)||1;
  const existing=cart.find(i=>i.id===`p${p.id}v${volume}`),actual=Math.min(quantity,99-(existing?.qty||0));
  if(actual<=0){toast('Você já tem 99 unidades deste decant na sacola.',true);return false;}
  addItem(p.id,volume,actual);byId('product-quantity').textContent='1';updateProductSelection();
  button.disabled=true;button.querySelector('span').textContent='Adicionado à sacola';clearTimeout(productButtonTimer);
  productButtonTimer=setTimeout(()=>{if(button.isConnected){button.disabled=false;button.querySelector('span').textContent='Adicionar à sacola';}},1400);
  toast(`${p.name} · ${volume} ml adicionado à sacola${actual<quantity?' (limite de 99 unidades)':''}`,true);return false;
}
function askProductAvailability(){const p=currentProduct();if(p&&!p.available)return aviseMe(p.brand+' '+p.name);return false;}
function syncLocalProductRoute(){
  const hash=window.location.hash.slice(1);
  if(hash.startsWith('perfume/')){
    const p=PRODUCTS.find(p=>SilloctaProductPages.path(p)==='/'+hash);if(!p){removeLocalProduct();exitCollectionView();toast('Este perfume não foi encontrado. Explore a coleção.');return;}
    closeCart();closeMobileMenu();closeFooterInfo();removeLocalProduct();exitCollectionView();
    byId('smooth-content').insertAdjacentHTML('afterbegin',SilloctaProductPages.render(p,{image:productImage(p),homeHref:'',products:PRODUCTS,imageFor:productImage,standalone:true}));
    document.body.classList.add('sl-local-product','sl-detail-view');document.title=p.name+' · '+p.brand+' | Sillocta';
    const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=SilloctaProductPages.description(p);
    syncMenuState();syncFavoriteButtons();window.scrollTo({top:0,behavior:'instant'});return;
  }
  const wasProduct=!!currentProduct();removeLocalProduct();
  if(['sec-masculino','sec-feminino'].includes(hash))handleCollectionSelector(hash==='sec-masculino'?'m':'f');
  else if(wasProduct){exitCollectionView();window.scrollTo({top:0,behavior:'instant'});}
}
function initializeProductPages(){
  if(isStandaloneStorefront()){
    document.querySelectorAll('.sl-product-image-link,.sl-product-name-link').forEach(link=>link.setAttribute('href','#'+link.getAttribute('href').slice(1)));
    document.addEventListener('click',event=>{const link=event.target.closest('[data-product-back]');if(link&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();handleCollectionSelector(link.dataset.productBack);}});
    window.addEventListener('hashchange',syncLocalProductRoute);window.addEventListener('popstate',syncLocalProductRoute);syncLocalProductRoute();
  }else if(!currentProduct()){
    const mode=new URL(window.location.href).searchParams.get('catalog');
    if(mode==='saved')openFavorites();
    else if(['new','niche','designer'].includes(mode))filterCatalog(mode);
    else if(window.location.hash==='#catalog-search')openSearch();
    else if(['#sec-masculino','#sec-feminino'].includes(window.location.hash))handleCollectionSelector(window.location.hash==='#sec-masculino'?'m':'f');
  }
}
// Accessibility and animation lifecycle, without overlapping input guards.
const originalOpenInfo=openFooterInfo,originalCloseInfo=closeFooterInfo;
openFooterInfo=function(type){const origin=document.activeElement,fromMenu=!!origin?.closest?.('#mobile-menu-drawer');closeCart();closeMobileMenu();byId('footer-info-overlay').inert=false;const result=originalOpenInfo(type);lastFocused=fromMenu?byId('menu-trigger'):origin;requestAnimationFrame(()=>byId('footer-info-close').focus());lockPage();return result;};
closeFooterInfo=function(){const wasOpen=byId('footer-info-overlay').classList.contains('open'),result=originalCloseInfo();byId('footer-info-overlay').inert=true;lockPage();if(wasOpen&&lastFocused?.isConnected)lastFocused.focus({preventScroll:true});return result;};
byId('cart-overlay').onclick=()=>closeCart();
byId('catalog-query')?.addEventListener('input',updateCatalogFilters);
for(const id of ['sel-masc-btn','sel-fem-btn'])byId(id)?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handleCollectionSelector(id==='sel-masc-btn'?'m':'f');}});
document.addEventListener('click',e=>{if(e.target.closest('[data-continue-shopping]'))continueShoppingSafely();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCart();closeMobileMenu();closeFooterInfo();}if(e.key!=='Tab')return;const panel=[byId('cart-drawer'),byId('mobile-menu-drawer'),byId('footer-info-modal')].find(p=>p.classList.contains('open')||p===byId('footer-info-modal')&&byId('footer-info-overlay').classList.contains('open'));if(!panel)return;const focusable=[...panel.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}});
const brand=document.querySelector('header [onclick="headerBrandHomeLux()"]');if(brand&&brand.tagName!=='BUTTON'){brand.setAttribute('tabindex','0');brand.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();headerBrandHomeLux();}});}
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('.card').forEach(syncCatalogQuantity);
// Pause ambient movement when its section leaves the viewport. The floating
// collection controls retain their approved appearance and native scrolling.
if('IntersectionObserver' in window){
  const ambienceObserver=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>target.classList.toggle('sl-ambient-paused',!isIntersecting)),{rootMargin:'80px 0px'});
  for(const id of ['hero','colecao-selector']){const section=byId(id);if(section)ambienceObserver.observe(section);}
}
byId('sl-toast').addEventListener('focusin',()=>clearTimeout(toastTimer));
byId('sl-toast').addEventListener('focusout',scheduleToastDismiss);
byId('sl-toast').addEventListener('mouseenter',()=>clearTimeout(toastTimer));
byId('sl-toast').addEventListener('mouseleave',scheduleToastDismiss);
if('IntersectionObserver' in window&&motion()){revealObserver=new IntersectionObserver(entries=>entries.forEach(({target,isIntersecting})=>{if(isIntersecting){target.classList.remove('sl-pending');target.classList.add('sl-in');revealObserver.unobserve(target);}}),{threshold:.08,rootMargin:'0px 0px 70px 0px'});document.querySelectorAll('.card').forEach((card,i)=>{card.style.transitionDelay=(i%2)*65+'ms';if(card.getBoundingClientRect().top>window.innerHeight){card.classList.add('sl-pending');revealObserver.observe(card);}});}
reduced.addEventListener?.('change',()=>{if(reduced.matches){revealObserver?.disconnect();document.querySelectorAll('.sl-pending').forEach(n=>n.classList.remove('sl-pending'));}});
let scrollFrame=0;window.addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;document.querySelector('header.glass').classList.toggle('sl-scrolled',window.scrollY>30);if(!motion())return;for(const id of ['parallax-hero','parallax-fem']){const el=byId(id);if(!el)continue;const rect=el.getBoundingClientRect();if(rect.bottom>0&&rect.top<window.innerHeight)el.style.setProperty('--sl-parallax',Math.max(-12,Math.min(12,(rect.top-window.innerHeight*.45)*.03))+'px');}});},{passive:true});
document.addEventListener('visibilitychange',lockPage);
function hidePreloader(){byId('preloader')?.classList.add('hide');setTimeout(()=>{if(byId('preloader'))byId('preloader').hidden=true;},450);}
requestAnimationFrame(()=>requestAnimationFrame(hidePreloader));setTimeout(hidePreloader,1800);
try{const saved=JSON.parse(localStorage.getItem('sillocta-original-bag-v1')||'{}');if(Array.isArray(saved.paidOrders))paidOrders.push(...saved.paidOrders.filter(id=>typeof id==='string').slice(-30));for(const item of saved.items||[]){try{const valid=makeItem(item.pid,item.vol,item.qty);const old=cart.find(i=>i.id===valid.id);if(old)old.qty=Math.min(99,old.qty+valid.qty);else cart.push(valid);}catch{}}if(CUPONS[saved.coupon]){window._couponCode=saved.coupon;window._couponPct=CUPONS[saved.coupon];}window._giftWrap=saved.gift===true;}catch{}
initializeCatalogTools();updateIndicators();syncMenuState();persistBag();renderCart();
initializeProductPages();
if(document.modelContext?.registerTool){for(const tool of [{name:'read_sillocta_collection',description:'Read available Sillocta perfumes and prices in BRL cents.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({products:PRODUCTS})},{name:'stage_sillocta_bag',description:'Add a perfume to the visible bag without sending an order.',inputSchema:{type:'object',properties:{id:{type:'integer'},volume:{type:'string',enum:['5','10']},quantity:{type:'integer',minimum:1,maximum:99}},required:['id','volume','quantity'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{const totals=addItem(input.id,input.volume,input.quantity);openCart();return {items:cart.map(i=>({id:i.pid,volume:i.vol,quantity:i.qty})),totals};}}])try{Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});}catch{}}
// Keep scroll and focus consistent for every existing information-modal exit.
byId('footer-info-close').onclick=()=>closeFooterInfo();
byId('footer-info-overlay').addEventListener('click',e=>{if(e.target===byId('footer-info-overlay'))closeFooterInfo();});
window.footerInfoGoShop=function(){closeFooterInfo();return scrollToSectionLux('shop');};
window.footerInfoGoHome=function(){closeFooterInfo();return headerBrandHomeLux();};

function syncCheckoutViewport(){const view=window.visualViewport;if(!view||!byId('cart-drawer').classList.contains('open'))return;byId('cart-drawer').style.setProperty('--sl-checkout-height',Math.round(view.height)+'px');byId('cart-drawer').style.setProperty('--sl-checkout-top',Math.round(view.offsetTop)+'px');}
window.visualViewport?.addEventListener('resize',syncCheckoutViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',syncCheckoutViewport,{passive:true});
window.addEventListener('resize',syncCheckoutViewport,{passive:true});

(async()=>{
  if(isStandaloneStorefront()||!['http:','https:'].includes(window.location?.protocol))return;
  try{const config=await paymentApi('config');paymentFlow.enabled=config.enabled===true;if(paymentFlow.enabled){renderCart();const id=new URL(window.location.href).searchParams.get('sillocta_order');if(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id||''))showPaymentStatus(id);}}
  catch{} // The established WhatsApp checkout remains available when online checkout is not active.
})();

window.addEventListener('pageshow',resetWhatsAppButton);
