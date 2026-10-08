import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import PRODUCTS from '../source/products.json' with {type:'json'};
import '../source/product-pages.js';
const pages=globalThis.SilloctaProductPages;

test('Combined catalog controls honor availability, saved perfumes, price boundaries, accents and collection',()=>{
  assert.deepEqual(pages.filterProducts(PRODUCTS,{query:'LEONIE'}).map(p=>p.id),[24]);
  assert.deepEqual(pages.filterProducts(PRODUCTS,{brand:'Dior',available:true,savedOnly:true,favorites:[6,21],price:'50to100',gender:'f'}).map(p=>p.id),[6,21]);
  assert.equal(pages.filterProducts(PRODUCTS,{gender:'m',price:'under50'}).length,0);
  assert.equal(pages.filterProducts(PRODUCTS,{savedOnly:true,favorites:[]}).length,0);
  for(const sort of ['price-asc','price-desc']){
    const selected=pages.filterProducts(PRODUCTS,{sort});
    assert.equal(selected.length,26);
    for(let i=1;i<selected.length;i++)assert.ok(sort==='price-asc'?selected[i-1].prices['5']<=selected[i].prices['5']:selected[i-1].prices['5']>=selected[i].prices['5']);
  }
  assert.equal(pages.filterProducts(PRODUCTS,{available:true}).length,24);
  assert.equal(pages.filterProducts(PRODUCTS,{mode:'new'}).length,PRODUCTS.filter(p=>p.badge==='Novo').length);
});

test('Related products have a stated olfactory overlap, are available, exclude the current perfume and support standalone navigation',()=>{
  for(const p of PRODUCTS){
    const matches=pages.relatedProducts(p,PRODUCTS);
    assert.ok(matches.length>0&&matches.length<=3);
    assert.equal(new Set(matches.map(m=>m.product.id)).size,matches.length);
    for(const m of matches){assert.notEqual(m.product.id,p.id);assert.equal(m.product.available,true);assert.ok(m.commonNotes.length||m.commonProfiles.length);}
    const html=pages.render(p,{products:PRODUCTS});
    assert.ok(html.includes('id="related-title"'));assert.ok(html.includes('data-favorite-id="'+p.id+'"'));
    for(const v of ['5','10'])assert.ok(html.includes(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(p.prices[v]/100)));
    const local=pages.render(p,{products:PRODUCTS,standalone:true,imageFor:q=>'data:image/jpeg;base64,perfume'+q.id});
    for(const m of matches){assert.ok(local.includes('href="#'+pages.path(m.product).slice(1)+'"'));assert.ok(local.includes('src="data:image/jpeg;base64,perfume'+m.product.id+'"'));}
  }
});

function catalogHarness(saved='[]',storageBlocked=false){
  let scrollTop=0,frames=[];
  const scrollCalls=[];
  const storage=new Map([['sillocta-favorites-v1',saved]]),nodes=new Map();
  const classes=new Set(),classList={contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key),toggle(key,on){if(on)classes.add(key);else classes.delete(key);}};
  const node=(id,extra={})=>{const n={id,value:'',textContent:'',attributes:{},dataset:{},style:{},hidden:false,classList,setAttribute(k,v){this.attributes[k]=v;},focus(){document.activeElement=this;},...extra};nodes.set(id,n);return n;};
  for(const id of ['catalog-query','catalog-brand','catalog-price','catalog-sort','catalog-available','catalog-saved','catalog-favorite-count','menu-favorite-count','catalog-status','catalog-empty','catalog-empty-copy','sl-toast'])node(id);
  nodes.get('sl-toast').contains=()=>false;
  const cards=PRODUCTS.map(p=>node('card-'+p.id,{dataset:{productId:String(p.id)}}));
  const grids=['m','f'].map(g=>({children:cards.filter(c=>PRODUCTS.find(p=>p.id===Number(c.dataset.productId)).gender===g),querySelectorAll(){return this.children;},appendChild(c){this.children=this.children.filter(n=>n!==c);this.children.push(c);}}));
  for(const [i,id] of ['sec-masculino','sec-feminino'].entries())node(id,{querySelectorAll:()=>grids[i].children});
  for(const card of cards)card.closest=selector=>selector==='#sec-masculino'&&grids[0].children.includes(card)?nodes.get('sec-masculino'):null;
  for(const [id,position,section] of [['parallax-hero',520,'sec-masculino'],['parallax-fem',980,'sec-feminino'],['catalog-empty',400,'catalog-empty']]){
    const target=nodes.get(id)||node(id);
    target.getClientRects=()=>nodes.get(section).hidden?[]:[{}];
    target.getBoundingClientRect=()=>({top:position-scrollTop});
  }
  const buttons=PRODUCTS.flatMap(p=>[node('heart-home-'+p.id,{dataset:{favoriteId:String(p.id)}}),node('heart-detail-'+p.id,{dataset:{favoriteId:String(p.id)}})]);
  const document={getElementById:id=>id==='sillocta-products'?{textContent:JSON.stringify(PRODUCTS)}:nodes.get(id)||null,querySelectorAll:sel=>sel==='[data-favorite-id]'?buttons:sel==='.perfume-grid .card'?cards:sel==='.perfume-grid'?grids:[],querySelector:sel=>sel==='header.glass'?{getBoundingClientRect:()=>({bottom:64})}:sel==='.perfume-grid .card:not([hidden])'?grids.flatMap(g=>g.children).find(c=>!c.hidden)||null:null,body:{classList},activeElement:null};
  const localStorage={getItem:k=>{if(storageBlocked)throw Error('Blocked');return storage.get(k)||null;},setItem:(k,v)=>{if(storageBlocked)throw Error('Blocked');storage.set(k,v);}};
  const window={matchMedia:()=>({matches:true}),get scrollY(){return scrollTop;},scrollTo(options){scrollTop=options.top;scrollCalls.push(options);}};
  const context=vm.createContext({document,window,requestAnimationFrame:callback=>frames.push(callback),localStorage,Intl,URL,console,setTimeout:()=>1,clearTimeout(){}});
  const code=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
  vm.runInContext(code.slice(0,code.indexOf('\n\n(function(){')),context);
  context.SilloctaProductPages=pages;
  return {nodes,cards,buttons,grids,storage,classes,scrollCalls,flushFrames(){for(let i=0;frames.length&&i<5;i++){const callbacks=frames;frames=[];callbacks.forEach(f=>f());}},run:code=>vm.runInContext(code,context)};
}

test('Favorite interactions persist valid IDs, synchronize home/detail buttons and compose with live filters',()=>{
  const h=catalogHarness('[6,999,"21"]');h.run('initializeCatalogTools()');
  assert.equal(h.nodes.get('catalog-favorite-count').textContent,'1');
  h.run('toggleFavorite(21)');assert.deepEqual(JSON.parse(h.storage.get('sillocta-favorites-v1')),[6,21]);
  for(const id of ['heart-home-21','heart-detail-21'])assert.equal(h.nodes.get(id).attributes['aria-pressed'],'true');
  h.run('toggleSavedCatalog()');assert.deepEqual(h.cards.filter(c=>!c.hidden).map(c=>Number(c.dataset.productId)),[6,21]);
  h.nodes.get('catalog-query').value='forever';h.run('updateCatalogFilters()');assert.deepEqual(h.cards.filter(c=>!c.hidden).map(c=>Number(c.dataset.productId)),[21]);
  h.run('toggleFavorite(21)');assert.equal(h.nodes.get('catalog-empty').hidden,false);assert.equal(h.nodes.get('heart-detail-21').attributes['aria-pressed'],'false');
  h.run('resetCatalogVisibility()');assert.equal(h.cards.filter(c=>!c.hidden).length,26);
  const restored=catalogHarness(h.storage.get('sillocta-favorites-v1'));restored.run('initializeCatalogTools()');assert.equal(restored.nodes.get('heart-home-6').attributes['aria-pressed'],'true');
  const blocked=catalogHarness('[]',true);blocked.run('initializeCatalogTools();toggleFavorite(1)');assert.equal(blocked.nodes.get('heart-detail-1').attributes['aria-pressed'],'true');
});

test('Ordering changes actual DOM order within each collection and reset restores the curated order',()=>{
  const h=catalogHarness();h.run('initializeCatalogTools()');h.nodes.get('catalog-sort').value='price-asc';h.run('updateCatalogFilters()');
  for(const grid of h.grids){const prices=grid.children.map(c=>PRODUCTS.find(p=>p.id===Number(c.dataset.productId)).prices['5']);assert.deepEqual(prices,[...prices].sort((a,b)=>a-b));}
  h.run('resetCatalogVisibility()');
  for(const grid of h.grids){const ids=grid.children.map(c=>Number(c.dataset.productId));assert.deepEqual(ids,[...ids].sort((a,b)=>a-b));}
  h.classes.add('collection-view');h.nodes.get('catalog-price').value='under50';h.run('updateCatalogFilters()');assert.equal(h.nodes.get('catalog-empty').hidden,false);assert.equal(h.nodes.get('sec-feminino').hidden,true);
});

test('Every brand filters the matching perfumes and navigates to their visible collection below the header',()=>{
  const h=catalogHarness();h.run('initializeCatalogTools()');
  for(const brand of new Set(PRODUCTS.map(p=>p.brand))){
    h.nodes.get('catalog-brand').value=brand;h.run("updateCatalogFilters('brand')");h.flushFrames();
    const expected=PRODUCTS.filter(p=>p.brand===brand);
    assert.deepEqual(h.cards.filter(c=>!c.hidden).map(c=>Number(c.dataset.productId)),expected.map(p=>p.id));
    assert.equal(h.scrollCalls.at(-1).top,(expected.some(p=>p.gender==='m')?520:980)-64);
    assert.ok(h.nodes.get('catalog-status').textContent.includes(brand));
  }
  h.nodes.get('catalog-query').value='zzz-no-match';h.run("updateCatalogFilters('brand')");h.flushFrames();
  assert.equal(h.nodes.get('catalog-empty').hidden,false);assert.equal(h.scrollCalls.at(-1).top,400-64);
  const calls=h.scrollCalls.length;h.nodes.get('catalog-query').value='';h.run('updateCatalogFilters({type:"input"})');h.flushFrames();assert.equal(h.scrollCalls.length,calls);
});

test('The brand menu follows the active collection and removes an incompatible brand when switching',()=>{
  const h=catalogHarness();h.run('initializeCatalogTools()');
  const maleOnly=PRODUCTS.find(p=>p.gender==='m'&&!PRODUCTS.some(q=>q.gender==='f'&&q.brand===p.brand)).brand;
  h.nodes.get('catalog-brand').value=maleOnly;h.run('updateCatalogFilters()');
  h.classes.add('collection-view');h.run("activeTab='f';applyCatalogFilters()");
  assert.equal(h.nodes.get('catalog-brand').value,'');assert.equal(h.nodes.get('catalog-brand').dataset.catalogScope,'f');
  const optionBrands=[...h.nodes.get('catalog-brand').innerHTML.matchAll(/<option value="([^"]+)"/g)].map(match=>match[1].replaceAll('&amp;','&'));
  for(const brand of new Set(PRODUCTS.map(p=>p.brand)))assert.equal(optionBrands.includes(brand),PRODUCTS.some(p=>p.gender==='f'&&p.brand===brand));
  assert.deepEqual(h.cards.filter(c=>!c.hidden).map(c=>Number(c.dataset.productId)),PRODUCTS.filter(p=>p.gender==='f').map(p=>p.id));
  h.classes.delete('collection-view');h.run('applyCatalogFilters()');assert.equal(h.nodes.get('catalog-brand').dataset.catalogScope,'all');assert.ok(h.nodes.get('catalog-brand').innerHTML.includes(`value="${maleOnly}"`));
});

test('Home selectors trigger navigation after filtering, and saved-only empty results remain recoverable',()=>{
  const html=readFileSync(new URL('../source/index.html',import.meta.url),'utf8');
  for(const key of ['brand','price','sort','available'])assert.ok(html.includes(`id="catalog-${key}"${key==='available'?' type="checkbox"':''} onchange="updateCatalogFilters('${key}')"`));
  const h=catalogHarness();h.run('initializeCatalogTools();toggleSavedCatalog()');h.flushFrames();assert.equal(h.scrollCalls.at(-1).top,336);
  h.run('resetCatalogVisibility()');h.nodes.get('catalog-price').value='under50';h.run("updateCatalogFilters('price')");h.flushFrames();
  assert.ok(h.cards.filter(c=>!c.hidden).every(c=>PRODUCTS.find(p=>p.id===Number(c.dataset.productId)).prices['5']<5000));
  assert.equal(h.scrollCalls.at(-1).top,916);
});
