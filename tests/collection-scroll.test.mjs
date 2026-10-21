import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function navigationHarness({headerBottom=64,reduced=false}={}){
  let frame=[],top=0;
  const calls=[],positions={m:520,f:980},nodes=new Map();
  const bodyClasses=new Set();
  const classes={add(...keys){keys.forEach(key=>bodyClasses.add(key));},remove(...keys){keys.forEach(key=>bodyClasses.delete(key));},toggle(key,on){if(on)bodyClasses.add(key);else bodyClasses.delete(key);}};
  const banner=gender=>({getClientRects:()=>context.activeTab===gender?[{}]:[],getBoundingClientRect:()=>({top:positions[gender]-top})});
  for(const word of ['masc','fem'])for(const id of ['img-'+word,'sel-'+word+'-label','sel-'+word+'-bar','sel-'+word+'-btn'])nodes.set(id,{style:{},attributes:{},listeners:{},setAttribute(key,value){this.attributes[key]=String(value);},addEventListener(key,callback){this.listeners[key]=callback;}});
  nodes.set('sl-collection-hint',{textContent:''});
  nodes.set('parallax-hero',banner('m'));nodes.set('parallax-fem',banner('f'));
  nodes.set('catalog-search',{value:'',classList:classes,scrollIntoView(){throw Error('Filters must not be the collection destination');}});
  nodes.set('catalog-query',{value:'Aventus'});
  const window={get scrollY(){return top;},scrollTo(options){top=options.top;calls.push(options);}};
  const context=vm.createContext({activeTab:'m',window,document:{body:{classList:classes},querySelector:()=>({getBoundingClientRect:()=>({bottom:headerBottom})})},byId:id=>nodes.get(id),motion:()=>!reduced,requestAnimationFrame:callback=>frame.push(callback),closeCart(){},closeMobileMenu(){},navigateToCatalog:()=>false,syncMenuState(){},applyCatalogFilters(){},resetCatalogVisibility(){}});
  const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function updateIndicators('),source.indexOf('function showAllCollections('));
  vm.runInContext(code,context);
  vm.runInContext('updateIndicators()',context);
  const keyboardStart=source.indexOf("for(const id of ['sel-masc-btn','sel-fem-btn'])");
  vm.runInContext(source.slice(keyboardStart,source.indexOf('\n',keyboardStart)),context);
  return {calls,positions,nodes,context,bodyClasses,select:gender=>context.handleCollectionSelector(gender),activate:gender=>context.activateCollectionArtwork(gender),key(gender,key,repeat=false){let prevented=false;nodes.get('sel-'+(gender==='m'?'masc':'fem')+'-btn').listeners.keydown({key,repeat,preventDefault(){prevented=true;}});return prevented;},frame(){const callbacks=frame;frame=[];callbacks.forEach(f=>f());},flush(){for(let i=0;frame.length&&i<5;i++)this.frame();},bannerTop:gender=>positions[gender]-top,setHeader:bottom=>{headerBottom=bottom;}};
}

test('Both collection buttons place the banner directly below the actual header at mobile and desktop heights',()=>{
  for(const headerBottom of [56,64,84,96]){
    const h=navigationHarness({headerBottom});
    for(const gender of ['m','f','m']){
      h.select(gender);h.flush();assert.equal(h.bannerTop(gender),headerBottom);assert.equal(h.calls.at(-1).behavior,'smooth');
    }
    assert.equal(h.nodes.get('catalog-query').value,'');
  }
});

test('Navigation measures the final layout after visibility changes, rather than an earlier position or a fixed offset',()=>{
  const h=navigationHarness();h.select('f');h.frame();
  h.positions.f=1250;h.setHeader(88);h.frame();assert.equal(h.bannerTop('f'),88);
});

test('Rapid switching cancels the older target and reduced motion jumps directly to the banner',()=>{
  const h=navigationHarness({reduced:true});h.select('m');h.select('f');h.flush();
  assert.equal(h.calls.length,1);assert.equal(h.bannerTop('f'),64);assert.equal(h.calls[0].behavior,'instant');
  h.context.scrollToSectionLux('sec-masculino');h.context.switchTab('m');h.flush();assert.equal(h.bannerTop('m'),64);
});

test('The first artwork activation selects only; the second enters that collection and scrolls precisely',()=>{
  for(const gender of ['m','f']){
    const h=navigationHarness(),word=gender==='m'?'masc':'fem',other=gender==='m'?'fem':'masc';
    for(const key of ['masc','fem'])assert.equal(h.nodes.get('sel-'+key+'-btn').attributes['aria-pressed'],'false');
    h.activate(gender);h.flush();
    assert.equal(h.calls.length,0);assert.equal(h.bodyClasses.has('collection-view'),false);
    assert.equal(h.nodes.get('catalog-query').value,'Aventus');assert.equal(h.context.activeTab,'m');
    assert.equal(h.nodes.get('sel-'+word+'-btn').attributes['aria-pressed'],'true');
    assert.equal(h.nodes.get('sel-'+other+'-btn').attributes['aria-pressed'],'false');
    assert.ok(h.nodes.get('sl-collection-hint').textContent.includes('novamente'));
    h.activate(gender);h.flush();
    assert.equal(h.calls.length,1);assert.equal(h.bannerTop(gender),64);
    assert.equal(h.nodes.get('catalog-query').value,'');assert.equal(h.bodyClasses.has('collection-'+gender),true);
  }
});

test('Selecting another artwork cancels a queued scroll, and an explicit reset clears the selection',()=>{
  const h=navigationHarness();h.activate('m');h.activate('m');h.activate('f');h.flush();
  assert.equal(h.calls.length,0);assert.equal(h.nodes.get('sel-fem-btn').attributes['aria-pressed'],'true');
  h.activate('f');h.context.exitCollectionView();h.flush();
  assert.equal(h.calls.length,0);assert.equal(h.bodyClasses.has('collection-view'),false);
  for(const key of ['masc','fem'])assert.equal(h.nodes.get('sel-'+key+'-btn').attributes['aria-pressed'],'false');
  assert.equal(h.nodes.get('sl-collection-hint').textContent,'Selecione uma coleção');
  h.activate('f');h.flush();assert.equal(h.calls.length,0);
  h.activate('f');h.flush();assert.equal(h.bannerTop('f'),64);
});

test('Returning through the logo or a hero link restores home, preserves the lit selection and cancels pending collection scrolling',()=>{
  for(const reduced of [false,true])for(const viaLogo of [false,true]){
    const h=navigationHarness({reduced});h.activate('f');h.activate('f');
    if(viaLogo)h.context.headerBrandHomeLux();else h.context.scrollToSectionLux('hero');
    h.flush();
    assert.equal(h.calls.length,1);assert.equal(h.calls[0].top,0);
    assert.equal(h.calls[0].behavior,reduced?'auto':'smooth');
    assert.equal(h.bodyClasses.has('collection-view'),false);
    assert.equal(h.bodyClasses.has('collection-f'),false);
    assert.equal(h.nodes.get('sel-fem-btn').attributes['aria-pressed'],'true');
    assert.equal(h.nodes.get('sel-masc-btn').attributes['aria-pressed'],'false');
    h.activate('f');h.flush();assert.equal(h.bannerTop('f'),64);
  }
});

test('Enter and Space use the same two activations, and holding a key cannot accidentally enter a collection',()=>{
  const h=navigationHarness({reduced:true});
  for(const [gender,key] of [['m','Enter'],['f',' ']]){
    const before=h.calls.length;assert.equal(h.key(gender,key),true);h.flush();
    assert.equal(h.calls.length,before);assert.equal(h.key(gender,key,true),true);h.flush();
    assert.equal(h.calls.length,before);h.key(gender,key);h.flush();
    assert.equal(h.calls.length,before+1);assert.equal(h.bannerTop(gender),64);
    assert.equal(h.calls.at(-1).behavior,'instant');
  }
});
