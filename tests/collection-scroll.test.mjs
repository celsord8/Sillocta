import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function navigationHarness({headerBottom=64,reduced=false}={}){
  let frame=[],selected='m',top=0;
  const calls=[],positions={m:520,f:980},nodes=new Map();
  const classes={add(){},remove(){},toggle(){}};
  const banner=gender=>({getClientRects:()=>selected===gender?[{}]:[],getBoundingClientRect:()=>({top:positions[gender]-top})});
  nodes.set('parallax-hero',banner('m'));nodes.set('parallax-fem',banner('f'));
  nodes.set('catalog-search',{value:'',classList:classes,scrollIntoView(){throw Error('Filters must not be the collection destination');}});
  nodes.set('catalog-query',{value:'Aventus'});
  const window={get scrollY(){return top;},scrollTo(options){top=options.top;calls.push(options);}};
  const context=vm.createContext({window,document:{body:{classList:classes},querySelector:()=>({getBoundingClientRect:()=>({bottom:headerBottom})})},byId:id=>nodes.get(id),motion:()=>!reduced,requestAnimationFrame:callback=>frame.push(callback),closeCart(){},closeMobileMenu(){},navigateToCatalog:()=>false,switchTab:gender=>{selected=gender;},syncMenuState(){},applyCatalogFilters(){},resetCatalogVisibility(){},updateIndicators(){selected=context.activeTab;}});
  const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('let collectionNavigation='),source.indexOf('function exitCollectionView('));
  vm.runInContext(code,context);
  return {calls,positions,nodes,context,select:gender=>context.handleCollectionSelector(gender),frame(){const callbacks=frame;frame=[];callbacks.forEach(f=>f());},flush(){for(let i=0;frame.length&&i<5;i++)this.frame();},bannerTop:gender=>positions[gender]-top,setHeader:bottom=>{headerBottom=bottom;}};
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
