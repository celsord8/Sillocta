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

const firstScreen=/#(?:hero(?:-txt)?|colecao-selector|sel-(?:masc|fem)[\w-]*|img-(?:masc|fem)|sl-collection-hint|o[123]|stars|shop|smooth-(?:wrapper|content)|preloader|catalog-campaigns|cc|menu-trigger|header-bag-button|sl-header-brand)\b|\.(?:glass|sl-header[\w-]*|sl-campaign[\w-]*|sl-hero[\w-]*|sl-artwork-plane|gold-grad|fu|vis|pl-[\w-]+|fas|fab|fa-[\w-]+)\b/;
const globalRule=/^(?:\*|:root|html|body)(?:[.:][\w()-]+)*(?:\s*,\s*(?:\*|:root|html|body)(?:[.:][\w()-]+)*)?$/;

// Inline only a generated first-screen subset. Keep the complete stylesheet
// unchanged and in its original order, so deferred arrival cannot reorder the
// established cascade. Detail pages also get their entire above-fold module.
export function criticalStyles(css,{detail=false}={}){
 const tree=postcss.parse(css);
 tree.walkRules(rule=>{
  let parent=rule.parent;
  while(parent){if(parent.type==='atrule'&&/keyframes$/i.test(parent.name))return;parent=parent.parent;}
  if(!firstScreen.test(rule.selector)&&!globalRule.test(rule.selector)&&
     !(detail&&/\.sl-product[\w-]*\b|\.sl-detail-view\b/.test(rule.selector))&&
     !/\[hidden\]|:focus-visible|\.sl-sr-only/.test(rule.selector))rule.remove();
 });
 tree.walkAtRules(at=>{if(at.nodes&&!at.nodes.length)at.remove();});
 // A first-paint-only important layer prevents hundreds of color/border
 // transitions when the complete CSS arrives. Important layered declarations
 // outrank legacy unlayered !important rules without specificity tricks.
 const safety='[aria-hidden="true"]:is(#cart-drawer,#cart-overlay,#mobile-menu-drawer,#mobile-menu-overlay,#footer-info-overlay){visibility:hidden}@layer sl-first-paint{html:not(.sl-styles-ready) *,html:not(.sl-styles-ready) *::before,html:not(.sl-styles-ready) *::after{transition:none!important}}';
 return compactStyles(tree.toString()+safety);
}

export function installCriticalStyles(html,css,options){
 const critical=criticalStyles(css,options);
 const marker=/<link rel="stylesheet" href="(\/storefront\.css\?v=[^"]+)">/;
 if(!marker.test(html))throw Error('Missing stylesheet marker');
 return html.replace(marker,(_,href)=>'<style id="sl-critical-styles">'+critical+'</style><link id="sl-full-styles" rel="preload" as="style" href="'+href+'" onload="this.onload=null;this.rel=\'stylesheet\';requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.add(\'sl-styles-ready\')))"><noscript><link rel="stylesheet" href="'+href+'"></noscript>');
}

// The campaign is part of the initial mobile viewport, but below the fold on
// desktop. Reuse its exact responsive candidates; never preload a second size.
export function campaignPreload(html){
 const image=html.match(/id="campaign-card-1"[\s\S]*?<img\s+([^>]+)>/)?.[1];
 if(!image)return '';
 const value=name=>image.match(new RegExp('(?:^|\\s)'+name+'="([^"]+)"'))?.[1];
 return '<link id="sl-home-media-preload-campaign" rel="preload" as="image" media="(max-width:720px)" href="'+value('src')+'" imagesrcset="'+value('srcset')+'" imagesizes="'+value('sizes')+'" fetchpriority="high">';
}
