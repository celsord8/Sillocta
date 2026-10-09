(function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
  const slug=product=>[product.brand,product.name].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const path=product=>'/perfume/'+slug(product);
  function imageAttributes(product,image,sizes){
    if(!product.media||image!=='/'+product.image)return '';
    const srcset=product.media.sources.map(source=>'/'+source.url+' '+source.width+'w').join(', ');
    return ` srcset="${escape(srcset)}" sizes="${escape(sizes)}"`;
  }
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const heart='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function favoriteButton(p,extra=''){
    return `<button type="button" class="sl-favorite ${extra}" data-favorite-id="${p.id}" aria-pressed="false" aria-label="Salvar ${escape(p.name)} nos favoritos" onclick="return toggleFavorite(${p.id})">${heart}</button>`;
  }
  function filterProducts(products,state={}){
    const term=normalize(state.query).trim(),favorites=new Set(state.favorites||[]);
    const found=products.filter(p=>{
      const price=p.prices['5'],text=normalize([p.name,p.brand,p.profile,...p.notes].join(' '));
      return (!state.gender||p.gender===state.gender)&&text.includes(term)&&(!state.brand||p.brand===state.brand)
        &&(state.price==='under50'?price<5000:state.price==='50to100'?price>=5000&&price<10000:state.price==='100plus'?price>=10000:true)
        &&(!state.available||p.available)&&(!state.savedOnly||favorites.has(p.id))
        &&(state.mode==='new'?p.badge==='Novo':state.mode==='niche'?[1,3,4].includes(p.id):state.mode==='designer'?![1,3,4].includes(p.id):true);
    });
    if(state.sort==='price-asc'||state.sort==='price-desc')found.sort((a,b)=>(state.sort==='price-desc'?-1:1)*(a.prices['5']-b.prices['5'])||a.id-b.id);
    return found;
  }
  function relatedProducts(p,products){
    const notes=new Set(p.notes.map(normalize)),profiles=new Set((p.profile||'').split(' · ').map(normalize));
    return products.filter(q=>q.id!==p.id&&q.available).map(q=>{
      const commonNotes=q.notes.filter(n=>notes.has(normalize(n))),commonProfiles=(q.profile||'').split(' · ').filter(n=>profiles.has(normalize(n)));
      return {product:q,commonNotes,commonProfiles,score:commonNotes.length*3+commonProfiles.length};
    }).filter(q=>q.score>0).sort((a,b)=>b.score-a.score||a.product.id-b.product.id).slice(0,3);
  }
  function renderRelated(p,options){
    const related=relatedProducts(p,options.products||[]);if(!related.length)return '';
    return `<section class="sl-related" aria-labelledby="related-title"><div class="sl-related-heading"><h2 id="related-title">Outras assinaturas para descobrir</h2><p>Selecionadas por notas e perfis olfativos em comum.</p></div><div class="sl-related-grid">${related.map(({product:q,commonNotes,commonProfiles})=>{
      const href=options.standalone?'#'+path(q).slice(1):path(q),image=options.imageFor?options.imageFor(q):'/'+q.image;
      return `<article class="sl-related-card">${favoriteButton(q)}<a href="${escape(href)}" class="sl-related-link"><img src="${escape(image)}"${imageAttributes(q,image,'auto, (max-width: 720px) 110px, 360px')} alt="${escape(q.brand+' '+q.name)}" width="${q.media?.width||870}" height="${q.media?.height||1080}" loading="lazy" decoding="async"><div class="sl-related-copy"><p class="sl-related-brand">${escape(q.brand)}</p><h3>${escape(q.name)}</h3><p class="sl-related-affinity">${commonNotes.length?'Notas':'Perfil'} em comum: ${escape((commonNotes.length?commonNotes:commonProfiles).join(' · '))}</p><p class="sl-related-price">5 ml · ${money(q.prices['5'])}</p></div></a></article>`;
    }).join('')}</div></section>`;
  }
  const icon=name=>`<svg class="sl-product-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${{bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',whatsapp:'<path d="m3 21 1.65-3.8a9 9 0 1 1 3.4 2.9L3 21Z"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',minus:'<path d="M6 12h12"/>',plus:'<path d="M6 12h12M12 6v12"/>',check:'<path d="m5 12 4 4L19 6"/>',down:'<path d="m7 10 5 5 5-5"/>'}[name]||''}</svg>`;
  function description(product){return `${product.name} de ${product.brand}, em decants de 5 e 10 ml. ${product.description||product.notes.join(', ')+'.'}`;}
  function render(product,options={}){
    const p=product,e=escape,collection=p.gender==='m'?'masculina':'feminina';
    const home=options.homeHref??'/',image=options.image??'/'+p.image;
    const back=home+(p.gender==='m'?'#sec-masculino':'#sec-feminino');
    return `<main id="product-page" class="sl-product-page" data-product-id="${p.id}" data-volume="5" aria-labelledby="product-title">
      <nav class="sl-product-breadcrumb" aria-label="Navegação do perfume"><a href="${e(back)}" data-product-back="${p.gender}"><span>Voltar à coleção ${collection}</span></a></nav>
      <div class="sl-product-layout">
        <figure class="sl-product-visual"><div class="sl-product-photo"><img src="${e(image)}"${imageAttributes(p,image,'(max-width: 720px) min(460px, calc(100vw - 44px)), (max-width: 1120px) calc((100vw - 100px) / 2), 540px')} alt="${e(p.brand+' '+p.name)}" width="${p.media?.width||870}" height="${p.media?.height||1080}" fetchpriority="high" decoding="async">${!p.available?'<span class="sl-product-badge">Esgotado</span>':p.badge==='Novo'?'<span class="sl-product-badge">Novo na coleção</span>':''}</div><figcaption>Frasco original como referência. Você recebe o decant no volume escolhido.</figcaption></figure>
        <section class="sl-product-info" aria-label="Detalhes e seleção">
          <div class="sl-product-brand-row"><p class="sl-product-brand">${e(p.brand)}</p>${favoriteButton(p,'sl-favorite-detail')}</div><h1 id="product-title">${e(p.name)}</h1><p class="sl-product-type">${e(p.type)} <span aria-hidden="true">·</span> Decant</p>
          <p class="sl-product-intro">${e(p.description||'')}</p>
          <div class="sl-product-notes"><h2>Notas em destaque</h2><ul>${p.notes.map(note=>`<li>${e(note)}</li>`).join('')}</ul></div>
          <div class="sl-product-purchase">
            <div class="sl-product-price-line"><div><span class="sl-product-label">Valor por decant</span><div class="sl-product-prices"><span id="product-price">${money(p.prices['5'])}</span><s id="product-old-price">${money(p.oldPrices['5'])}</s></div></div><span class="sl-product-stock ${p.available?'':'is-unavailable'}">${p.available?'Disponível':'Temporariamente esgotado'}</span></div>
            <fieldset class="sl-product-volume"><legend>Escolha o volume</legend><div>${['5','10'].map(v=>`<button type="button" data-product-volume="${v}" aria-pressed="${v==='5'}" ${p.available?'':'disabled'} onclick="selectProductVolume(this)"><span class="sl-volume-copy"><span>${v} ml</span><span class="sl-volume-price">${money(p.prices[v])}</span></span><span class="sl-volume-check">${icon('check')}</span></button>`).join('')}</div></fieldset>
            ${p.available?`<div class="sl-product-quantity-row"><div><span id="product-quantity-label" class="sl-product-label">Quantidade</span><div class="sl-product-quantity" role="group" aria-labelledby="product-quantity-label"><button id="product-minus" type="button" onclick="changeProductQuantity(-1)" aria-label="Diminuir quantidade" disabled>${icon('minus')}</button><output id="product-quantity" aria-live="polite">1</output><button id="product-plus" type="button" onclick="changeProductQuantity(1)" aria-label="Aumentar quantidade">${icon('plus')}</button></div></div><p class="sl-product-selection-total"><span>Total da seleção</span><strong id="product-total" aria-live="polite">${money(p.prices['5'])}</strong></p></div>
            <button id="product-add" type="button" class="sl-product-primary" onclick="addProductToBag(this)">${icon('bag')}<span>Adicionar à sacola</span></button><button type="button" class="sl-product-bag" onclick="openCart()">${icon('bag')}<span>Ver minha sacola</span></button>`:`<button type="button" class="sl-product-availability" onclick="askProductAvailability()">${icon('whatsapp')}<span>Consultar disponibilidade</span></button>`}
            <p class="sl-product-order-note">${p.available?'Entrega e pagamento confirmados pelo atendimento no WhatsApp.':'Este perfume está esgotado. Consulte o atendimento sobre a reposição.'}</p>
          </div>
          <div class="sl-product-details"><details><summary>O que você recebe ${icon('down')}</summary><p>Um decant de 5 ou 10 ml da fragrância selecionada. O frasco original da foto é apresentado como referência.</p></details><details><summary>Entrega e pagamento ${icon('down')}</summary><p>Informe o CEP na sacola para buscar o endereço. Essa consulta não calcula o frete. O atendimento confirma o valor da entrega, o prazo e o pagamento pelo WhatsApp antes de concluir a compra.</p></details>${p.descriptionSource?`<details><summary>Sobre esta fragrância ${icon('down')}</summary><p>${e(p.profile)}</p><p class="sl-product-reference">Referência olfativa: <a href="${e(p.descriptionSource.url)}" target="_blank" rel="noopener noreferrer">${e(p.descriptionSource.name)}</a></p></details>`:''}</div>
        </section>
      </div>
      ${renderRelated(p,options)}
    </main>`;
  }
  root.SilloctaProductPages={slug,path,render,description,filterProducts,relatedProducts,favoriteButton};
})(globalThis);
