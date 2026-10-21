/* Curated discovery and browser-local navigation. No customer data leaves the browser. */
(function(root){
  'use strict';
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const questions=[
    {key:'gender',title:'Qual coleção você quer descobrir?',options:[['m','Masculino','Explore as fragrâncias da coleção masculina.'],['f','Feminino','Explore as fragrâncias da coleção feminina.']]},
    {key:'occasion',title:'Em que momento você quer usar?',options:[['daily','No dia a dia','Trabalho, passeios e rotina.'],['evening','Em momentos especiais','Encontros, jantares e saídas à noite.'],['versatile','Em diferentes momentos','Uma assinatura para alternar ocasiões.']]},
    {key:'presence',title:'Que presença você procura?',options:[['light','Leve e delicada','Uma sensação fresca e suave.'],['balanced','Equilibrada','Um meio-termo entre frescor e envolvimento.'],['bold','Marcante e envolvente','Acordes mais quentes, doces ou profundos.']]},
    {key:'family',title:'Que notas mais atraem você?',options:[['fresh','Frescas e aromáticas','Cítricos, lavanda e facetas luminosas.'],['floral','Florais','Rosa, jasmim e flores brancas.'],['sweet','Doces e gourmand','Baunilha, caramelo, mel e acordes cremosos.'],['woody','Amadeiradas e especiadas','Madeiras, tabaco, couro e especiarias.'],['discover','Quero descobrir','Prefiro explorar a seleção da curadoria.']]}
  ];
  // Editorial impressions of the olfactory composition, not measured projection or longevity.
  const curation={
    1:['balanced','daily','versatile'],2:['bold','evening'],3:['bold','evening','versatile'],4:['bold','evening','versatile'],
    5:['balanced','daily','versatile'],6:['balanced','daily','versatile'],7:['bold','evening'],8:['balanced','daily','versatile'],
    9:['balanced','daily','versatile'],10:['balanced','evening','versatile'],11:['balanced','daily','versatile'],12:['balanced','daily','versatile'],
    13:['bold','evening','versatile'],14:['light','daily'],15:['balanced','daily','versatile'],16:['bold','evening'],
    17:['bold','evening'],18:['bold','evening'],19:['bold','evening'],20:['balanced','evening','versatile'],
    21:['light','daily'],22:['balanced','daily','versatile'],23:['balanced','daily','versatile'],24:['balanced','daily','versatile'],
    25:['bold','evening'],26:['balanced','daily','versatile']
  };
  const families={
    fresh:/citr|aromatic|fresco|bergamota|lavanda|neroli|mandarina|laranja/,
    floral:/floral|flor|rosa|jasmim|violeta|iris|peonia|tuberosa|fresia|ylang/,
    sweet:/gourmand|baunilha|caramelo|mel|cacau|marshmallow|fava tonka/,
    woody:/amadeirado|especiado|couro|tabaco|betula|patchouli|sandalo|incenso|cardamomo|acafrao/
  };
  function cleanAnswers(input={}){
    const result={};for(const question of questions)if(question.options.some(option=>option[0]===input?.[question.key]))result[question.key]=input[question.key];return result;
  }
  function recommend(products,input){
    const answers=cleanAnswers(input);
    if(questions.some(question=>!answers[question.key]))return [];
    return products.filter(product=>product.available&&product.gender===answers.gender).map(product=>{
      const tags=curation[product.id]||['balanced','versatile'];
      const pattern=families[answers.family],matchingNotes=pattern?product.notes.filter(note=>pattern.test(normalize(note))):[];
      const familyMatch=!pattern||pattern.test(normalize(product.profile+' '+product.notes.join(' ')));
      const presenceMatch=tags[0]===answers.presence,occasionMatch=tags.includes(answers.occasion);
      const score=(familyMatch?8:0)+(presenceMatch?4:0)+(occasionMatch?3:0);
      const reasons=[];
      if(pattern&&familyMatch)reasons.push(matchingNotes.length?'Notas em destaque: '+matchingNotes.slice(0,2).join(' e ')+'.':'Perfil '+product.profile.toLowerCase()+' na direção que você escolheu.');
      if(occasionMatch)reasons.push(answers.occasion==='daily'?'Uma sugestão da curadoria para a rotina.':answers.occasion==='evening'?'Uma sugestão da curadoria para momentos especiais.':'Uma sugestão da curadoria para diferentes momentos.');
      if(presenceMatch)reasons.push({light:'Composição de facetas mais leves e delicadas.',balanced:'Composição que equilibra frescor e envolvimento.',bold:'Composição de facetas quentes e envolventes.'}[answers.presence]);
      if(!reasons.length)reasons.push('Uma alternativa para explorar o perfil '+product.profile.toLowerCase()+'.');
      return {product,score,matchingNotes,reasons:reasons.slice(0,2),familyMatch};
    }).filter(match=>match.familyMatch).sort((a,b)=>b.score-a.score||a.product.id-b.product.id).slice(0,3);
  }
  function cleanSnapshot(input,products){
    if(!input||typeof input!=='object'||!Number.isFinite(input.savedAt)||Date.now()-input.savedAt>7200000||input.savedAt>Date.now()+60000)return null;
    const state=input.state||{},allowed=(value,list,fallback)=>list.includes(value)?value:fallback;
    const selection=Array.isArray(input.selections)?input.selections.filter(item=>products.some(p=>p.id===item?.id)&&['5','10'].includes(item.volume)&&Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=99):[];
    return {savedAt:input.savedAt,query:String(input.query||'').slice(0,120),scrollY:Math.max(0,Math.min(100000,Number(input.scrollY)||0)),gender:allowed(input.gender,['m','f'],''),state:{volume:allowed(state.volume,['5','10'],'5'),mode:allowed(state.mode,['all','new','niche','designer'],'all'),brand:products.some(p=>p.brand===state.brand)?state.brand:'',price:allowed(state.price,['','under50','50to100','100plus'],''),sort:allowed(state.sort,['curated','price-asc','price-desc'],'curated'),available:state.available===true,savedOnly:state.savedOnly===true},selections:selection.map(({id,volume,quantity})=>({id,volume,quantity}))};
  }
  async function shareProduct(data,services={}){
    if(typeof services.share==='function'){
      try{await services.share(data);return 'shared';}catch(error){if(error.name==='AbortError')return 'cancelled';}
    }
    if(typeof services.copy==='function'){
      try{await services.copy(data.url);return 'copied';}catch{}
    }
    return 'manual';
  }
  const api={questions,curation,cleanAnswers,recommend,cleanSnapshot,shareProduct,preserveFilterPosition:true};root.SilloctaDiscovery=api;
  if(typeof document==='undefined')return;
  const products=JSON.parse(document.getElementById('sillocta-products')?.textContent||'[]');
  const pages=root.SilloctaProductPages;if(!pages||!products.length)return;
  const byId=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
  const reduced=root.matchMedia('(prefers-reduced-motion: reduce)');
  const read=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
  let answers=cleanAnswers(read('sillocta-guide-v1')),step=questions.every(q=>answers[q.key])?questions.length:0,guideOrigin=null;
  let restoring=false,fadeFrame=0,flight=null;
  const dialog=document.createElement('dialog');dialog.id='sl-fragrance-dialog';dialog.className='sl-guide-dialog';dialog.setAttribute('aria-labelledby','sl-guide-title');
  dialog.innerHTML='<div class="sl-guide-header"><div><p class="sl-guide-eyebrow">Curadoria olfativa</p><h2 id="sl-guide-title">Qual será sua próxima descoberta?</h2></div><button type="button" class="sl-guide-close" aria-label="Fechar guia de fragrâncias"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div id="sl-guide-body"></div>';
  document.body.append(dialog);
  const guideArrow='<svg class="sl-guide-arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
  function syncGuideInvitation(){document.querySelectorAll('#fragrance-guide [data-open-guide]').forEach(button=>{button.innerHTML=(step===questions.length?'Rever minha seleção':'Encontrar minha seleção')+' '+guideArrow;});}
  function guideVolume(){return typeof catalogState!=='undefined'?catalogState.volume:'5';}
  function renderGuide(focus=true){
    const body=byId('sl-guide-body');
    if(step<questions.length){
      const q=questions[step];body.innerHTML=`<div class="sl-guide-progress"><span>Pergunta ${step+1} de ${questions.length}</span><progress max="${questions.length}" value="${step+1}" aria-label="Progresso do guia"></progress></div><form id="sl-guide-form"><h3 id="sl-guide-question" tabindex="-1">${escape(q.title)}</h3><fieldset aria-labelledby="sl-guide-question"><legend class="sl-sr-only">${escape(q.title)}</legend>${q.options.map(([value,title,copy])=>`<label class="sl-guide-option"><input type="radio" name="${q.key}" value="${value}" ${answers[q.key]===value?'checked':''}><span><strong>${escape(title)}</strong><span>${escape(copy)}</span></span><span class="sl-guide-radio" aria-hidden="true"></span></label>`).join('')}</fieldset><div class="sl-guide-navigation">${step?'<button type="button" data-guide-back>Voltar</button>':'<span></span>'}<button class="sl-guide-next" type="submit" ${answers[q.key]?'':'disabled'}>${step===questions.length-1?'Ver minha seleção':'Continuar'}</button></div></form>`;
      byId('sl-guide-form').addEventListener('change',event=>{if(event.target.name===q.key){answers[q.key]=event.target.value;byId('sl-guide-form').querySelector('[type=submit]').disabled=false;write('sillocta-guide-v1',answers);}});
      byId('sl-guide-form').addEventListener('submit',event=>{event.preventDefault();if(!answers[q.key])return;step++;write('sillocta-guide-v1',answers);renderGuide();syncGuideInvitation();});
      body.querySelector('[data-guide-back]')?.addEventListener('click',()=>{step--;renderGuide();});
    }else{
      const matches=recommend(products,answers),volume=guideVolume();
      body.innerHTML=`<div class="sl-guide-result-heading"><p class="sl-guide-eyebrow">Sua seleção pessoal</p><h3 id="sl-guide-question" tabindex="-1">Uma seleção para você</h3><p>Fragrâncias selecionadas a partir das suas preferências.</p></div><div class="sl-guide-results">${matches.map(({product:p,reasons})=>`<article class="sl-guide-result"><div class="sl-guide-result-image"><a href="${pages.path(p)}" aria-label="Conhecer ${escape(p.brand+' '+p.name)}"><img src="/${escape(p.image)}"${p.media?.sources?.length?` srcset="${escape(p.media.sources.map(source=>'/'+source.url+' '+source.width+'w').join(', '))}" sizes="(max-width:720px) calc(100vw - 64px), (max-width:1000px) calc((100vw - 140px) / 3), 286px"`:""} alt="${escape(p.brand+' '+p.name)}" width="${p.media?.width||320}" height="${p.media?.height||400}" decoding="async"></a>${pages.favoriteButton(p)}</div><div class="sl-guide-result-copy"><p class="sl-guide-result-brand">${escape(p.brand)}</p><h4><a href="${pages.path(p)}">${escape(p.name)}</a></h4><p class="sl-guide-result-profile">${escape(p.profile)}</p><ul>${reasons.map(reason=>`<li>${escape(reason)}</li>`).join('')}</ul><p class="sl-guide-result-price">${volume} ml · ${money(p.prices[volume])}</p><a class="sl-guide-product-link" href="${pages.path(p)}">Conhecer perfume ${guideArrow}</a></div></article>`).join('')}</div>${matches.length?'':'<p>Não encontramos perfumes disponíveis para esta seleção. Experimente outras notas.</p>'}<p class="sl-guide-explanation">Seleção orientada por notas e famílias olfativas. A percepção de cada fragrância varia com a pele e a aplicação.</p><div class="sl-guide-navigation"><button type="button" data-guide-edit>Alterar respostas</button><button type="button" data-guide-reset>Começar novamente</button></div>`;
      body.querySelector('[data-guide-edit]').addEventListener('click',()=>{step=0;renderGuide();});
      body.querySelector('[data-guide-reset]').addEventListener('click',()=>{answers={};step=0;write('sillocta-guide-v1',answers);renderGuide();syncGuideInvitation();});
      if(typeof syncFavoriteButtons==='function')syncFavoriteButtons();
    }
    dialog.scrollTop=0;if(focus)body.querySelector('#sl-guide-question')?.focus({preventScroll:true});
  }
  function closeGuide(){dialog.close();}
  function openGuide(origin){
    guideOrigin=origin||document.activeElement;
    if(typeof closeCart==='function')closeCart();if(typeof closeMobileMenu==='function')closeMobileMenu();if(typeof closeFooterInfo==='function')closeFooterInfo();
    renderGuide(false);document.body.classList.add('sl-guide-open');dialog.showModal();byId('sl-guide-question')?.focus({preventScroll:true});
  }
  dialog.querySelector('.sl-guide-close').addEventListener('click',closeGuide);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeGuide();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeGuide();}});
  dialog.addEventListener('close',()=>{document.body.classList.remove('sl-guide-open');if(guideOrigin?.isConnected)guideOrigin.focus({preventScroll:true});});
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-open-guide]');if(trigger){event.preventDefault();openGuide(trigger.closest('#mobile-menu-drawer')?byId('menu-trigger'):trigger);}});
  syncGuideInvitation();

  // Save only catalog preferences in sessionStorage, isolated by history entry.
  const snapshotKey=id=>'sillocta-catalog:'+id;
  function entryId(){
    const current=history.state?.silloctaCatalogEntry;
    if(typeof current==='string'&&/^[a-z0-9-]{1,70}$/.test(current))return current;
    const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    try{history.replaceState({...history.state,silloctaCatalogEntry:id},'',location.href);}catch{}
    return id;
  }
  function saveCatalog(){
    if(!byId('catalog-query')||typeof catalogState==='undefined'||restoring)return null;
    const id=entryId(),snapshot={savedAt:Date.now(),state:{...catalogState},query:byId('catalog-query').value,gender:document.body.classList.contains('collection-view')?activeTab:'',scrollY:root.scrollY,selections:[...document.querySelectorAll('.perfume-grid .card')].map(card=>({id:Number(card.dataset.productId),volume:card.dataset.volume,quantity:Number(card.querySelector('.qty-val')?.textContent)||1}))};
    return write(snapshotKey(id),snapshot)?id:null;
  }
  function restoreCatalog(id){
    const snapshot=cleanSnapshot(read(snapshotKey(id)),products);if(!snapshot||!byId('catalog-query'))return false;
    restoring=true;
    Object.assign(catalogState,snapshot.state);byId('catalog-query').value=snapshot.query;
    document.body.classList.toggle('collection-view',!!snapshot.gender);document.body.classList.toggle('collection-m',snapshot.gender==='m');document.body.classList.toggle('collection-f',snapshot.gender==='f');if(snapshot.gender)activeTab=snapshot.gender;
    applyCatalogFilters();syncMenuState();updateIndicators();++collectionNavigation;
    for(const selection of snapshot.selections){
      const card=document.querySelector(`.card[data-product-id="${selection.id}"]`),product=products.find(p=>p.id===selection.id);if(!card||!product)continue;
      const button=card.querySelector(`.vbtn[data-ml="${selection.volume}"]`);if(button)setVol(button,(product.prices[selection.volume]/100).toFixed(2).replace('.',','),(product.oldPrices[selection.volume]/100).toFixed(2).replace('.',','));
      card.querySelector('.qty-val').textContent=selection.quantity;syncCatalogQuantity(card);
    }
    try{history.replaceState({...history.state,silloctaCatalogEntry:id},'',location.pathname+location.hash);}catch{}
    let interrupted=false;const interrupt=()=>{interrupted=true;};document.addEventListener('pointerdown',interrupt,{once:true});document.addEventListener('keydown',interrupt,{once:true});
    Promise.resolve(document.fonts?.ready).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!interrupted)root.scrollTo({top:snapshot.scrollY,behavior:'instant'});
      document.removeEventListener('pointerdown',interrupt);document.removeEventListener('keydown',interrupt);restoring=false;
    })));
    return true;
  }
  document.addEventListener('click',event=>{
    const anchor=event.target.closest('a[href]');if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.target==='_blank')return;
    const url=new URL(anchor.href,location.href);if(url.origin!==location.origin||!products.some(p=>pages.path(p)===url.pathname))return;
    const id=saveCatalog();if(id)write('sillocta-catalog-origin',{id,savedAt:Date.now()});
  },true);
  root.addEventListener('pagehide',saveCatalog);
  root.addEventListener('pageshow',event=>{if(event.persisted&&byId('catalog-query'))restoreCatalog(history.state?.silloctaCatalogEntry);});
  const returnId=new URL(location.href).searchParams.get('catalog-return')||history.state?.silloctaCatalogEntry;
  if(returnId&&/^[a-z0-9-]{1,70}$/.test(returnId))restoreCatalog(returnId);
  const origin=read('sillocta-catalog-origin');
  if(origin&&typeof origin.id==='string'&&/^[a-z0-9-]{1,70}$/.test(origin.id)&&cleanSnapshot(read(snapshotKey(origin.id)),products))document.querySelectorAll('[data-product-back]').forEach(link=>link.href='/?catalog-return='+origin.id);

  // Filtering changes content immediately; only the visual feedback is animated.
  function fadeResults(){
    if(reduced.matches||restoring)return;
    cancelAnimationFrame(fadeFrame);fadeFrame=requestAnimationFrame(()=>document.querySelectorAll('.perfume-grid').forEach(grid=>{
      if(!grid.getClientRects().length||typeof grid.animate!=='function')return;
      grid.getAnimations?.().forEach(animation=>animation.cancel());grid.animate([{opacity:.45},{opacity:1}],{duration:180,easing:'ease-out'});
    }));
  }
  for(const type of ['input','change','click'])document.addEventListener(type,event=>{if(event.target.closest('#catalog-search'))fadeResults();});

  function clearFlight(){if(flight){flight.animation?.cancel();flight.image.remove();flight.destination?.remove();clearTimeout(flight.timer);flight=null;}}
  function flyToBag(source){
    clearFlight();if(reduced.matches||!source||typeof source.animate!=='function'||document.hidden)return;
    const start=source.getBoundingClientRect();if(start.width<=0||start.height<=0)return;
    let target=byId('header-bag-button')?.getBoundingClientRect(),destination=null;
    if(!target||target.top<26||target.bottom>root.innerHeight){
      destination=document.createElement('span');destination.className='sl-flight-destination';destination.setAttribute('aria-hidden','true');destination.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';document.body.append(destination);target=destination.getBoundingClientRect();
    }
    const image=document.createElement('img');image.src=source.currentSrc||source.src;image.alt='';image.className='sl-bag-flight';image.setAttribute('aria-hidden','true');
    const x=Math.max(8,Math.min(root.innerWidth-64,start.left+start.width/2-28)),y=Math.max(32,Math.min(root.innerHeight-80,start.top+start.height/2-35));
    image.style.left=x+'px';image.style.top=y+'px';document.body.append(image);
    const animation=image.animate([{transform:'translate(0,0) scale(1)',opacity:.95},{transform:`translate(${target.left+target.width/2-x-28}px,${target.top+target.height/2-y-35}px) scale(.16)`,opacity:.15}],{duration:650,easing:'cubic-bezier(.25,.7,.25,1)'});
    const current={image,destination,animation,timer:setTimeout(()=>{if(flight===current)clearFlight();},1000)};flight=current;
    animation.finished.catch(()=>{}).then(()=>{if(flight===current)clearFlight();});
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('.btn-buy,#product-add');if(!button||button.disabled||!button.matches('[onclick*="buy("],#product-add'))return;
    const before=Number(byId('cc')?.textContent)||0,source=button.closest('.card')?.querySelector('.img-box img')||document.querySelector('#product-page .sl-product-photo img');
    requestAnimationFrame(()=>{if((Number(byId('cc')?.textContent)||0)>before)flyToBag(source);});
  },true);
  reduced.addEventListener?.('change',()=>{if(reduced.matches)clearFlight();});root.addEventListener('pagehide',clearFlight);

  // Sharing uses the OS sheet when available and a copyable URL otherwise.
  const productPage=byId('product-page'),product=products.find(p=>p.id===Number(productPage?.dataset.productId));
  if(product){
    const breadcrumb=productPage.querySelector('.sl-product-breadcrumb'),button=document.createElement('button');button.type='button';button.className='sl-product-share';button.setAttribute('aria-label','Compartilhar '+product.name);button.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg><span>Compartilhar</span>';breadcrumb.append(button);
    const fallback=document.createElement('div');fallback.className='sl-share-fallback';fallback.hidden=true;fallback.innerHTML='<label>Link do perfume<input readonly type="url" aria-label="Link do perfume"></label><p role="status"></p>';breadcrumb.append(fallback);
    button.addEventListener('click',async()=>{
      const url=new URL(pages.path(product),location.origin).href,data={title:product.name+' · '+product.brand+' | Sillocta',text:'Conheça '+product.name+' em decants de 5 e 10 ml.',url};
      const result=await shareProduct(data,{share:navigator.share?.bind(navigator),copy:navigator.clipboard?.writeText.bind(navigator.clipboard)});
      if(result==='copied'){button.querySelector('span').textContent='Link copiado';toast('Link do perfume copiado.');setTimeout(()=>{if(button.isConnected)button.querySelector('span').textContent='Compartilhar';},1800);}
      if(result==='manual'){fallback.hidden=false;const input=fallback.querySelector('input');input.value=url;fallback.querySelector('[role=status]').textContent='Selecione e copie o link para compartilhar.';input.focus();input.select();}
    });
  }
})(globalThis);
