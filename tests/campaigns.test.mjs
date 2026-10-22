import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import PRODUCTS from '../source/products.json' with {type:'json'};
import CAMPAIGNS from '../source/campaigns.json' with {type:'json'};
import '../source/product-pages.js';

function harness({reduced=false,width=1040,cardWidth=620,observer=false,initialVisible=!observer,readyState='complete',firstLoaded=true,decode=false}={}){
  const frames=[],scrolls=[],timers=new Map(),windowEvents=new Map(),documentEvents=new Map();
  let clock=0,timerId=0,intersection,preference,onScreen=initialVisible;
  const node=()=>({hidden:false,attributes:{},listeners:new Map(),setAttribute(key,value){this.attributes[key]=value;},getAttribute(key){return this.attributes[key];},removeAttribute(key){delete this.attributes[key];},addEventListener(type,action){this.listeners.set(type,action);}});
  const rendered=[];
  const shown=()=>rendered.filter(card=>!card.hidden);
  const makeCard=index=>{
    const image={loading:index?'lazy':'eager',complete:index>0||firstLoaded,listeners:new Map(),addEventListener(type,action){this.listeners.set(type,action);}};
    if(decode)image.decode=()=>new Promise((resolve,reject)=>{image.resolveDecode=resolve;image.rejectDecode=reject;});
    return Object.assign(node(),{index,image,querySelector:()=>image,querySelectorAll:()=>[],cloneNode:()=>makeCard(index),getBoundingClientRect(){const left=50+shown().indexOf(this)*(cardWidth+12)-track.scrollLeft;return {left,right:left+cardWidth,width:cardWidth};}});
  };
  const cards=CAMPAIGNS.map((_,i)=>makeCard(i));rendered.push(...cards);
  cards.forEach((card,i)=>card.setAttribute('id','campaign-card-'+i));
  const buttons=CAMPAIGNS.map(node),pagination={hidden:false,querySelectorAll:()=>buttons};
  const track=Object.assign(node(),{scrollLeft:0,get clientWidth(){return width;},get scrollWidth(){return shown().length*cardWidth+Math.max(0,shown().length-1)*12;},getBoundingClientRect:()=>({left:50}),querySelectorAll:()=>rendered,insertBefore(card,before){rendered.splice(rendered.indexOf(before),0,card);},appendChild(card){rendered.push(card);},scrollTo(options){const previous=this.scrollLeft;this.scrollLeft=Math.min(Math.max(0,this.scrollWidth-this.clientWidth),Math.max(0,options.left));const closest=Math.min(shown().length-1,Math.round(this.scrollLeft/(cardWidth+12)));scrolls.push({...options,previous,actual:this.scrollLeft,logical:shown()[closest]?.index});this.listeners.get('scroll')?.();}});
  Object.defineProperties(track,{clientWidth:{get:()=>width},scrollWidth:{get:()=>shown().length*cardWidth+Math.max(0,shown().length-1)*12}});
  const root=Object.assign(node(),{getBoundingClientRect:()=>({top:onScreen?100:1200,bottom:onScreen?400:1500}),querySelector:selector=>({'.sl-campaign-track':track,'.sl-campaign-pagination':pagination})[selector],contains:element=>[track,...buttons,...rendered].includes(element)});
  const media={matches:reduced,addEventListener(type,action){preference=action;}};
  const document={hidden:false,readyState,getElementById:()=>root,addEventListener(type,action){documentEvents.set(type,action);}};
  const window={innerHeight:900,matchMedia:()=>media,addEventListener(type,action){windowEvents.set(type,action);}};
  class FakeDate extends Date{static now(){return clock;}}
  class IntersectionObserver{constructor(action){intersection=action;}observe(){}}
  if(observer)window.IntersectionObserver=IntersectionObserver;
  const source=readFileSync(new URL(process.env.SILLOCTA_TEST_BUNDLES?'../public/campaigns.js':'../source/campaigns.js',import.meta.url),'utf8');
  const context={document,window,IntersectionObserver,Date:FakeDate,requestAnimationFrame:action=>frames.push(action),setTimeout(action,delay){const id=++timerId;timers.set(id,{action,at:clock+delay});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,context);
  const flush=()=>{let limit=0;while(frames.length){assert.ok(++limit<100);frames.shift()();}};
  const active=()=>buttons.findIndex(button=>button.attributes['aria-pressed']==='true');
  const advance=ms=>{const end=clock+ms;let count=0;while(true){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;assert.ok(++count<1000,'Timers must not form an immediate loop');clock=next[1].at;timers.delete(next[0]);next[1].action();flush();}clock=end;flush();};
  flush();
  return {track,cards,rendered,buttons,pagination,scrolls,timers,active,flush,advance,period:()=>CAMPAIGNS.length*(cardWidth+12),
    frameStep(){const current=frames.splice(0);current.forEach(action=>action());},
    imageLoaded(index){cards[index].image.complete=true;cards[index].image.listeners.get('load')?.();flush();},
    domReady(){document.readyState='interactive';documentEvents.get('DOMContentLoaded')?.();flush();},
    runAgain(){vm.runInNewContext(source,context);flush();},
    click(index){buttons[index].listeners.get('click')();flush();},
    swipe(left){track.scrollLeft=left;track.listeners.get('scroll')();flush();},
    key(key,target=track){let prevented=false;track.listeners.get('keydown')({key,target,preventDefault(){prevented=true;}});flush();return prevented;},
    rootEvent(type,event={}){root.listeners.get(type)(event);flush();},
    windowEvent(type,event={}){windowEvents.get(type)(event);flush();},
    visible(on,ratio=.8){onScreen=on;intersection([{isIntersecting:on,intersectionRatio:on?ratio:0}]);flush();},
    hidden(on){document.hidden=on;documentEvents.get('visibilitychange')();flush();},
    reduced(on){media.matches=on;preference();flush();},
    resize(newWidth,newCardWidth=cardWidth){width=newWidth;cardWidth=newCardWidth;track.scrollLeft=Math.min(track.scrollLeft,Math.max(0,track.scrollWidth-width));windowEvents.get('resize')();flush();}
  };
}

test('A visible carousel starts without waiting for interaction or its first observer callback',()=>{
  const h=harness({observer:true,initialVisible:true});
  h.advance(2000);assert.equal(h.active(),1);
  h.visible(true,.02);h.advance(2000);assert.equal(h.active(),2);
});

test('Slow image downloads receive a full dwell time and never advance into an unfinished photograph',()=>{
 const h=harness({firstLoaded:false});
 h.advance(5000);assert.equal(h.active(),0);assert.equal(h.scrolls.length,0);
 h.imageLoaded(0);h.advance(1999);assert.equal(h.active(),0);
 h.cards[1].image.complete=false;h.advance(1);assert.equal(h.active(),0);
 h.imageLoaded(1);h.advance(1999);assert.equal(h.active(),0);
 h.advance(1);assert.equal(h.active(),1);
});

test('Downloaded photographs receive two paint frames and a full dwell, with the next photo decoded without restarting the current timer',async()=>{
 const h=harness({decode:true});h.advance(5000);assert.equal(h.active(),0);assert.equal(h.timers.size,0);
 h.cards[0].image.resolveDecode();for(let i=0;i<4;i++)await Promise.resolve();
 assert.equal(h.timers.size,0);h.frameStep();assert.equal(h.timers.size,0);h.frameStep();assert.equal(h.timers.size,2);
 h.advance(800);assert.equal(typeof h.cards[1].image.resolveDecode,'function');
 h.cards[1].image.resolveDecode();for(let i=0;i<4;i++)await Promise.resolve();h.frameStep();h.frameStep();
 h.advance(1199);assert.equal(h.active(),0);h.advance(1);assert.equal(h.active(),1);
});

test('A completed decode cannot restart autoplay while the document is hidden',async()=>{
 const h=harness({decode:true});h.hidden(true);h.cards[0].image.resolveDecode();
 for(let i=0;i<4;i++)await Promise.resolve();h.frameStep();h.frameStep();
 assert.equal(h.timers.size,0);h.advance(5000);assert.equal(h.active(),0);
 h.hidden(false);assert.equal(h.timers.size,2);
});

test('An unavailable browser decoder cannot leave a fully downloaded photograph permanently paused',async()=>{
 const h=harness({decode:true});h.cards[0].image.rejectDecode(new Error('Decoder unavailable'));
 for(let i=0;i<4;i++)await Promise.resolve();h.frameStep();h.frameStep();
 assert.equal(h.timers.size,2);assert.equal(h.active(),0);
});

test('Responsive source changes cannot reuse a decoded frame from the previous photograph size',async()=>{
 const h=harness({decode:true});h.cards[0].image.resolveDecode();
 for(let i=0;i<4;i++)await Promise.resolve();h.frameStep();h.frameStep();assert.equal(h.timers.size,2);
 h.cards[0].image.currentSrc='/larger-original-quality.webp';h.resize(760,470);assert.equal(h.timers.size,0);
 h.cards[0].image.resolveDecode();for(let i=0;i<4;i++)await Promise.resolve();h.frameStep();h.frameStep();assert.equal(h.timers.size,2);
});

test('Early script loading waits for parsed markup and repeated initialization never duplicates the loop',()=>{
  const h=harness({readyState:'loading'});
  assert.equal(h.rendered.length,6);assert.equal(h.scrolls.length,0);
  h.domReady();assert.equal(h.rendered.length,18);assert.equal(h.active(),0);
  h.runAgain();assert.equal(h.rendered.length,18);
  h.advance(2000);assert.equal(h.active(),1);
  assert.equal(h.scrolls.filter(s=>s.behavior==='smooth').length,1);
});

test('Returning from browser history clears stale pointer pauses and resumes at the same perfume',()=>{
  const h=harness({observer:true,initialVisible:true});
  h.advance(2000);assert.equal(h.active(),1);
  h.rootEvent('pointerenter',{pointerType:'mouse'});h.rootEvent('pointerdown');
  h.windowEvent('pagehide');h.advance(10000);assert.equal(h.active(),1);
  h.windowEvent('pageshow',{persisted:true});h.advance(2000);assert.equal(h.active(),2);
});

test('Six controls select the corresponding perfume in every run and a touch scroll updates the indicator',()=>{
  const h=harness();assert.equal(h.active(),0);
  assert.equal(h.track.scrollLeft,0);
  assert.equal(h.scrolls.length,0,'The first image must not be scrolled or replaced during initialization');
  for(let i=0;i<CAMPAIGNS.length;i++){h.click(i);assert.equal(h.active(),i);}
  h.swipe(h.period()+70);assert.equal(h.active(),0);
  h.swipe(h.period()+500);assert.equal(h.active(),1);
  h.resize(360,302.4);h.click(5);assert.equal(h.active(),5);
  assert.ok(h.track.scrollLeft<=h.track.scrollWidth-h.track.clientWidth);
});

test('Automatic advance uses 2 seconds and always travels one image forward across repeated seams',()=>{
  const h=harness();h.advance(1999);assert.equal(h.active(),0);
  h.advance(1);assert.equal(h.active(),1);
  for(let i=2;i<=24;i++){h.advance(2000);assert.equal(h.active(),i%CAMPAIGNS.length);}
  const moves=h.scrolls.filter(s=>s.behavior==='smooth');
  assert.equal(moves.length,24);
  for(const move of moves){assert.equal(move.actual-move.previous,632);}
  h.advance(160);assert.ok(h.scrolls.filter(s=>s.behavior==='instant').length>=4);
  h.click(2);h.advance(6999);assert.equal(h.active(),2);
  h.advance(1);assert.equal(h.active(),3);
});

test('Seam normalization preserves the same image and relative offset during touch browsing',()=>{
  const h=harness();
  h.rootEvent('pointerdown');
  const left=h.period()*2+37;h.swipe(left);assert.equal(h.active(),0);
  h.advance(500);assert.equal(h.track.scrollLeft,left,'Do not reset during a touch gesture');
  h.windowEvent('pointerup');h.advance(160);
  assert.equal(h.track.scrollLeft,h.period()+37);assert.equal(h.active(),0);
  h.swipe(h.period()-632+20);assert.equal(h.active(),5);h.advance(160);
  assert.equal(h.track.scrollLeft,h.period()*2-632+20);assert.equal(h.active(),5);
});

test('Loop copies preserve their product links, expose no duplicate IDs and stay out of keyboard and screen-reader order',()=>{
  const h=harness();assert.equal(h.rendered.length,18);
  const copies=h.rendered.filter(c=>c.attributes['data-campaign-clone']==='true');
  assert.equal(copies.length,12);
  for(const card of copies){assert.equal(card.attributes.id,undefined);assert.equal(card.attributes['aria-hidden'],'true');assert.equal(card.attributes.tabindex,'-1');}
  assert.equal(h.cards.filter(c=>c.attributes.id).length,6);
});

test('Keyboard arrows cross the seam, Home and End select the endpoints and reduced motion avoids animation',()=>{
  const h=harness({reduced:true});
  assert.equal(h.key('ArrowLeft'),true);assert.equal(h.active(),5);h.advance(160);
  h.key('ArrowRight');assert.equal(h.active(),0);
  h.key('End');assert.equal(h.active(),5);assert.equal(h.scrolls.at(-1).behavior,'instant');
  assert.equal(h.key('ArrowLeft',h.buttons[0]),false);
  h.key('Home');assert.equal(h.active(),0);
  h.resize(10000);assert.equal(h.pagination.hidden,true);
  assert.equal(h.rendered.filter(c=>!c.hidden).length,6);
  h.resize(360,302.4);assert.equal(h.pagination.hidden,false);assert.equal(h.active(),0);
});

test('Resizing preserves the current perfume and resets to an equivalent middle-run position',()=>{
  const h=harness();h.click(4);h.resize(390,327.6);
  assert.equal(h.active(),4);assert.ok(Math.abs(h.track.scrollLeft-(h.period()+4*339.6))<.01);
  h.advance(7000);assert.equal(h.active(),5);
});

test('Pointer navigation resumes automatically while keyboard browsing keeps the images still',()=>{
  const h=harness();
  h.rootEvent('pointerenter',{pointerType:'mouse'});h.advance(24000);assert.equal(h.active(),0);
  h.rootEvent('pointerleave',{pointerType:'mouse'});h.advance(2000);assert.equal(h.active(),1);
  h.rootEvent('pointerdown');h.rootEvent('focusin',{target:{matches:()=>false}});
  h.advance(24000);assert.equal(h.active(),1);
  h.windowEvent('pointercancel');h.advance(7000);assert.equal(h.active(),2);
  h.rootEvent('focusin',{target:{matches:()=>true}});h.advance(24000);assert.equal(h.active(),2);
  h.rootEvent('focusout',{relatedTarget:null});h.advance(7000);assert.equal(h.active(),3);
  h.rootEvent('keydown');h.advance(24000);assert.equal(h.active(),3);
  h.rootEvent('focusout',{relatedTarget:null});h.advance(7000);assert.equal(h.active(),4);
});

test('Automatic advance stops outside the view, in a hidden tab and with reduced motion',()=>{
  const h=harness({observer:true});h.advance(24000);assert.equal(h.active(),0);
  h.visible(true);h.advance(2000);assert.equal(h.active(),1);
  h.visible(false);h.advance(24000);assert.equal(h.active(),1);
  h.visible(true);h.hidden(true);h.advance(24000);assert.equal(h.active(),1);
  h.hidden(false);h.advance(2000);assert.equal(h.active(),2);
  h.reduced(true);h.advance(24000);assert.equal(h.active(),2);
  h.reduced(false);h.advance(2000);assert.equal(h.active(),3);
});

test('Mobile places campaigns directly after collection selectors and preserves the hero copy on resize',()=>{
  const element=id=>({id,parent:null,children:[],insertBefore(child,before){detach(child);const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,child);child.parent=this;},before(child){this.parent.insertBefore(child,this);},after(child){const parent=this.parent;detach(child);parent.children.splice(parent.children.indexOf(this)+1,0,child);child.parent=parent;}});
  const detach=child=>{if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);};
  const hero=element('hero'),copy=element('hero-txt'),collections=element('colecao-selector'),campaigns=element('catalog-campaigns'),filters=element('catalog-search'),shop=element('shop');
  const marker=element('sl-collection-desktop');
  for(const child of [collections,campaigns,copy])hero.insertBefore(child,null);
  for(const child of [marker,filters])shop.insertBefore(child,null);
  const ids=new Map([hero,copy,collections,campaigns,filters,marker].map(el=>[el.id,el]));
  for(const el of ids.values()){Object.defineProperty(el,'parentNode',{get:()=>el.parent});Object.defineProperty(el,'nextElementSibling',{get:()=>el.parent?.children[el.parent.children.indexOf(el)+1]});}
  let change;const mobile={matches:true,addEventListener(type,action){change=action;}};
  const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
  const start=source.indexOf('function initializeMobileHero(){');
  const end=source.indexOf('const catalogState=',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(source.slice(start,end),{byId:id=>ids.get(id),window:{matchMedia:()=>mobile},document:{createComment:()=>element('marker')}});
  assert.deepEqual(hero.children.map(el=>el.id),['colecao-selector','catalog-campaigns','hero-txt']);
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const heroMarkup=html.slice(html.indexOf('<section id="hero">'),html.indexOf('<!-- PRODUTOS -->'));
  assert.ok(heroMarkup.indexOf('id="colecao-selector"')<heroMarkup.indexOf('id="catalog-campaigns"'));
  assert.ok(heroMarkup.indexOf('id="catalog-campaigns"')<heroMarkup.indexOf('id="hero-txt"'));
  mobile.matches=false;change();
  assert.deepEqual(hero.children.map(el=>el.id),['hero-txt']);
  assert.deepEqual(shop.children.map(el=>el.id),['sl-collection-desktop','colecao-selector','catalog-campaigns','catalog-search']);
});

test('Autoplay warms the next slide after the first frame, and cancels offscreen work',()=>{
 const h=harness({observer:true,initialVisible:true});
 assert.equal(h.cards[1].image.loading,'lazy');
 h.advance(799);assert.equal(h.cards[1].image.loading,'lazy');
 h.advance(1);assert.equal(h.cards[1].image.loading,'eager');
 h.advance(1200);assert.equal(h.active(),1);
 h.visible(false);h.advance(2000);
 assert.equal(h.cards[2].image.loading,'lazy');
 assert.equal(h.active(),1);
});

test('Every campaign links to an available perfume, with both original and responsive files exported',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.equal((html.match(/class="sl-campaign-card"/g)||[]).length,6);
 for(const campaign of CAMPAIGNS){
  const product=PRODUCTS.find(p=>p.id===campaign.productId);
  assert.ok(product?.available);
  assert.ok(html.includes(`href="${globalThis.SilloctaProductPages.path(product)}"`));
  assert.deepEqual(readFileSync(new URL('../public/'+campaign.image,import.meta.url)),readFileSync(new URL('../source/'+campaign.image,import.meta.url)));
 }
});

test('Campaign crops serve each viewport at Retina resolution without changing or upscaling original photography',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const preload=html.match(/<link id="sl-home-media-preload-campaign"[^>]*>/)?.[0];
 for(const campaign of CAMPAIGNS){
  const original=readFileSync(new URL('../source/'+campaign.image,import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'),campaign.media.originalSha256);
  const card=html.match(new RegExp('<a id="campaign-card-'+campaign.productId+'"[\\s\\S]*?</a>'))?.[0];
  assert.ok(card?.includes('<picture class="sl-campaign-picture">'));
  assert.ok(card.includes('<source media="(min-width:721px)"'));
  for(const [layout,media] of Object.entries(campaign.displayMedia)){
   assert.ok(media.sources.some(s=>s.width===960),'A 320px card needs a native 960px candidate on a 3x screen');
   const set=media.sources.map(s=>'/'+s.url+' '+s.width+'w').join(', ');
   assert.ok(card.includes('srcset="'+set+'"'));
   if(layout==='mobile'){
    const avifSet=media.avifSources.map(s=>'/'+s.url+' '+s.width+'w').join(', ');
    assert.ok(card.includes('type="image/avif" srcset="'+avifSet+'"'));
    if(campaign.productId===1){assert.ok(preload?.includes('type="image/avif"'));assert.ok(preload.includes('imagesrcset="'+avifSet+'"'));}
    for(const image of media.avifSources){
     assert.ok(image.psnr>=34&&image.width<=media.nativeWidth&&image.height<=media.nativeHeight);
     assert.equal(readFileSync(new URL('../public/'+image.url,import.meta.url)).length,image.bytes);
    }
   }
   for(const image of media.sources){
    assert.ok(image.width<=media.nativeWidth&&image.height<=media.nativeHeight);
    assert.ok(Math.abs(image.width/image.height-media.ratio)<.01);
    assert.ok(image.quality>=94&&image.psnr>=34);
    const file=readFileSync(new URL('../public/'+image.url,import.meta.url));
    assert.equal(file.length,image.bytes);
    assert.ok(image.url.includes(createHash('sha256').update(file).digest('hex').slice(0,12)));
   }
  }
 }
});
