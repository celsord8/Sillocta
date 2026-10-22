import postcss from 'postcss';
import {compactStyles} from './styles.mjs';

// The same seven Font Awesome 6.4 shapes, with their attribution retained in
// source/icons.json. SVG masks inherit the existing size and currentColor.
export function iconStyles(icons){
 const base='.fas,.fab{display:inline-block;font-style:normal;font-variant:normal;line-height:1;text-rendering:auto;-webkit-font-smoothing:antialiased}.fas::before,.fab::before{content:"";display:inline-block;width:var(--sl-icon-width,1em);height:1em;vertical-align:-.125em;background-color:currentColor;-webkit-mask:var(--sl-icon) no-repeat center/contain;mask:var(--sl-icon) no-repeat center/contain}';
 return base+Object.entries(icons).map(([name,svg])=>{
  const view=svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if(!view||!svg.includes('Font Awesome Free 6.4.0'))throw Error('Unverified icon '+name);
  const image=svg.replace(/<!--[\s\S]*?-->/g,'').trim();
  return '.fa-'+name+'{--sl-icon-width:'+(+view[1]/+view[2]).toFixed(5)+'em;--sl-icon:url("data:image/svg+xml,'+encodeURIComponent(image)+'")}';
 }).join('');
}

const firstScreen=/#(?:hero(?:-txt)?|colecao-selector|sel-(?:masc|fem)[\w-]*|img-(?:masc|fem)|sl-collection-hint|o[123]|stars|shop|smooth-(?:wrapper|content)|preloader|catalog-campaigns|cc|menu-trigger|header-bag-button|sl-header-brand|wa-float|sl-bag-shortcut)\b|\.(?:glass|sl-header[\w-]*|sl-campaign[\w-]*|sl-hero[\w-]*|sl-artwork-plane|gold-grad|fu|vis|pl-[\w-]+|fas|fab|fa-[\w-]+)\b/;
const globalRule=/^(?:\*|:root|html|body)(?:[.:][\w()-]+)*(?:\s*,\s*(?:\*|:root|html|body)(?:[.:][\w()-]+)*)?$/;
const deferredPanel=/#(?:cart-(?:drawer|overlay|footer|items)|mobile-menu[\w-]*|footer-info[\w-]*)\b|\.(?:sl-guide-(?:dialog|overlay|header|close|progress|option|navigation|result[\w-]*|next|back)|sl-checkout[\w-]*|sl-payment[\w-]*|sl-pay[\w-]*)\b/;

// Keep the first screen and catalog layout in their original cascade order.
// Filter comma-separated selectors individually: a shared #shop selector must
// not also pull an entire grouped cart/modal rule into the critical response.
export function criticalStyles(css,{detail=false}={}){
 const tree=postcss.parse(css);
 tree.walkRules(rule=>{
  let parent=rule.parent;
  while(parent){if(parent.type==='atrule'&&/keyframes$/i.test(parent.name))return;parent=parent.parent;}
  const selectors=rule.selectors.filter(selector=>{
   if(/\[hidden\]|\.sl-sr-only/.test(selector))return true;
   const productOnly=/\.sl-product[\w-]*\b/.test(selector)&&!/\.perfume-grid\b|\.card\b/.test(selector);
   if(deferredPanel.test(selector)||(!detail&&productOnly))return false;
   if(/#(?:site-footer|footer-info[\w-]*|sl-toast)\b|\.(?:newsletter[\w-]*|mobile-menu[\w-]*|footer-info[\w-]*|cart-drawer|checkout[\w-]*)\b/.test(selector))return false;
   return detail||firstScreen.test(selector)||globalRule.test(selector)||!/[#.][\w-]+/.test(selector)||/\.sl-guide-(?:invitation|eyebrow|arrow)\b|#fragrance-guide/.test(selector);
  });
  if(selectors.length)rule.selectors=selectors;
  else if(/#(?:catalog[\w-]*|sec-(?:masculino|feminino)|parallax[\w-]*|px-[\w-]*)\b|\.(?:perfume-grid|card|img-box|badge|price[\w-]*|vbtn|qty[\w-]*|btn-buy|sl-catalog[\w-]*|sl-volume[\w-]*|sl-card[\w-]*|sl-collection[\w-]*)\b/.test(rule.selector)){
   rule.walkDecls(decl=>{if(!/^(?:display|position|inset(?:-.+)?|top|right|bottom|left|float|clear|box-sizing|width|height|min-.+|max-.+|aspect-ratio|margin(?:-.+)?|padding(?:-.+)?|border(?:-.+)?|gap|row-gap|column-gap|grid-.+|flex(?:-.+)?|align-.+|justify-.+|order|font(?:-.+)?|line-height|letter-spacing|text-.+|white-space|overflow(?:-.+)?|object-.+|visibility|opacity)$/.test(decl.prop))decl.remove();});
   if(!rule.nodes.length)rule.remove();
  }else rule.remove();
 });
 const animations=new Set(['sl-hero-copy']);
 tree.walkDecls(/^animation(?:-name)?$/,decl=>decl.value.split(/[\s,]+/).forEach(value=>animations.add(value)));
 tree.walkAtRules(at=>{if((/keyframes$/i.test(at.name)&&!animations.has(at.params))||(at.nodes&&!at.nodes.length))at.remove();});
 // A first-paint-only important layer prevents hundreds of color/border
 // transitions when the complete CSS arrives. Important layered declarations
 // outrank legacy unlayered !important rules without specificity tricks.
 const safety='[aria-hidden="true"]:is(#cart-drawer,#cart-overlay,#mobile-menu-drawer,#mobile-menu-overlay,#footer-info-overlay){visibility:hidden}@layer sl-first-paint{html:not(.sl-styles-ready) *,html:not(.sl-styles-ready) *::before,html:not(.sl-styles-ready) *::after{transition:none!important}}';
 return compactStyles(tree.toString()+safety);
}

// Keep non-visible interface styling from competing with the first painted
// photograph. Any interaction requests the complete cascade immediately.
export function loadRemainingStyles(){
 const link=document.getElementById('sl-deferred-styles');if(!link)return;
 let applied=false,settled=false;
 const events=['pointerdown','keydown','focusin','touchstart','wheel','scroll'];
 const unlock=()=>{if(!applied||settled)return;settled=true;requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.add('sl-styles-ready')));};
 const apply=()=>{
  if(applied)return;applied=true;clearTimeout(fallback);
  for(const type of events)document.removeEventListener(type,apply,true);
  link.rel='stylesheet';if(link.sheet)unlock();
 };
 link.addEventListener('load',unlock);
 for(const type of events)document.addEventListener(type,apply,{capture:true,passive:true,once:true});
 const fallback=setTimeout(apply,5000);
 const start=()=>{
  const photo=document.querySelector('#campaign-card-1 img');
  const paint=()=>{
   let decoded;try{decoded=photo?.decode?.();}catch{}
   Promise.resolve(decoded).catch(()=>{}).then(()=>requestAnimationFrame(()=>requestAnimationFrame(apply)));
  };
  if(!photo||photo.complete)paint();
  else{photo.addEventListener('load',paint,{once:true});photo.addEventListener('error',apply,{once:true});}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}

// Temporary preview instrumentation: observe actual presentation separately
// from download, stylesheet application and the first carousel movement.
function observeOpeningPaint(){
 const marks=[];
 const record=(key,time=performance.now())=>{
  marks.push(key+Math.round(time));
  document.querySelector('#campaign-card-1 img')?.setAttribute('data-sl-paint',marks.join('|'));
 };
 record('H');
 try{new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.identifier==='sl-opening')record('E',entry.renderTime);}).observe({type:'element',buffered:true});}catch{}
 try{new PerformanceObserver(list=>{for(const entry of list.getEntries())record(entry.element?.closest?.('#campaign-card-1')?'L':'O',entry.startTime);}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
 new MutationObserver(entries=>{for(const entry of entries){
  if(entry.target.id==='sl-deferred-styles'&&entry.target.rel==='stylesheet')record('C');
  if(entry.target===document.documentElement&&entry.target.classList.contains('sl-styles-ready'))record('R');
 }}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class','rel']});
 document.addEventListener('load',event=>{if(event.target?.matches?.('#campaign-card-1 img')){record('I');requestAnimationFrame(()=>requestAnimationFrame(()=>record('P')));}},true);
 document.addEventListener('DOMContentLoaded',()=>record('D'),{once:true});
 document.addEventListener('scroll',event=>{if(event.target?.matches?.('.sl-campaign-track'))record('S');},{capture:true,once:true});
 document.fonts?.addEventListener('loadingdone',()=>record('F'));
}

export function installCriticalStyles(html,css,options){
 const marker=/<link rel="stylesheet" href="(\/storefront\.css\?v=[^"]+)">/;
 if(!marker.test(html))throw Error('Missing stylesheet marker');
 // Every page receives the same complete, ordered cascade on first paint.
 // Detail pages no longer wait for a second sheet, restyle and two frames.
 const preload=options?.detail?productPreload(html):'';
 if(options?.detail)return html.replace(marker,()=>preload+'<style id="sl-full-styles">'+compactStyles(css)+'</style>');
 const href=html.match(marker)[1];
 html=html.replace(/(id="campaign-card-1"[\s\S]*?<img) /,'$1 data-sl-paint="pending" elementtiming="sl-opening" ');
 return html.replace(marker,()=>'<style id="sl-full-styles">'+criticalStyles(css)+'</style><link id="sl-deferred-styles" rel="preload" as="style" fetchpriority="low" blocking="render" href="'+href+'"><noscript><link rel="stylesheet" href="'+href+'"></noscript><script>('+observeOpeningPaint.toString()+')();('+loadRemainingStyles.toString()+')();</script>');
}

// Discover the detail image in the head, with exactly the same candidates and
// sizes as the visible image. No extra download, recompression or smaller cap.
export function productPreload(html){
 const image=html.match(/class="sl-product-photo"><img\s+([^>]+)>/)?.[1];
 if(!image)return '';
 const value=name=>image.match(new RegExp('(?:^|\\s)'+name+'="([^"]+)"'))?.[1];
 return '<link id="sl-product-media-preload" rel="preload" as="image" href="'+value('src')+'"'+(value('srcset')?' imagesrcset="'+value('srcset')+'" imagesizes="'+value('sizes')+'"':'')+' fetchpriority="high">';
}

// The campaign is part of the initial mobile viewport, but below the fold on
// desktop. Reuse its exact responsive candidates; never preload a second size.
export function campaignPreload(html){
 const preferred=html.match(/id="campaign-card-1"[\s\S]*?<source media="\(max-width:720px\)" type="image\/avif"\s+([^>]+)>/)?.[1];
 if(preferred){
  const value=name=>preferred.match(new RegExp('(?:^|\\s)'+name+'="([^"]+)"'))?.[1];
  const srcset=value('srcset');
  return '<link id="sl-home-media-preload-campaign" rel="preload" as="image" type="image/avif" media="(max-width:720px)" href="'+srcset.split(',')[0].trim().split(' ')[0]+'" imagesrcset="'+srcset+'" imagesizes="'+value('sizes')+'" fetchpriority="high">';
 }
 const image=html.match(/id="campaign-card-1"[\s\S]*?<img\s+([^>]+)>/)?.[1];
 if(!image)return '';
 const value=name=>image.match(new RegExp('(?:^|\\s)'+name+'="([^"]+)"'))?.[1];
 return '<link id="sl-home-media-preload-campaign" rel="preload" as="image" media="(max-width:720px)" href="'+value('src')+'" imagesrcset="'+value('srcset')+'" imagesizes="'+value('sizes')+'" fetchpriority="high">';
}

// The mobile artwork is already in place. The small desktop initializer also
// supports viewport changes without duplicating listeners in enhancements.js.
export function revealFirstScreen(){
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const opening=document.getElementById('preloader');
  if(!opening)return;
  opening.classList.add('hide');
  setTimeout(()=>{opening.hidden=true;},450);
 }));
}

export function installHeroBootstrap(html,behavior){
 const start=behavior.indexOf('function initializeMobileHero(){');
 const end=behavior.indexOf('\ninitializeMobileHero();',start);
 if(start<0||end<start)throw Error('Missing mobile layout initializer');
 const marker='<section id="fragrance-guide"';
 if(!html.includes(marker))throw Error('Missing layout bootstrap position');
 // Above-fold layout is already fully styled by the inline critical sheet.
 // Reveal it after the layout initializer settles, instead of waiting for all
 // deferred behavior and the separate closed-panel stylesheet to download.
 const script='<script id="sl-layout-bootstrap">(()=>{const byId=id=>document.getElementById(id);'+behavior.slice(start,end)+';initializeMobileHero();})();('+revealFirstScreen.toString()+')();</script>';
 return html.replace(marker,script+marker);
}
