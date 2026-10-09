/* Warm only the pages the visitor shows interest in, within a small data budget. */
(() => {
  'use strict';
  if(!['http:','https:'].includes(window.location.protocol))return;
  const pages=globalThis.SilloctaProductPages;
  const source=document.getElementById('sillocta-products');
  if(!pages||!source||typeof fetch!=='function')return;
  let products;
  try{products=JSON.parse(source.textContent);}catch{return;}
  const routes=new Map(products.map(product=>[pages.path(product),product]));
  const warmed=new Set();
  let timer=0,pendingAnchor=null,busy=false;
  const permitted=()=>{
    const connection=navigator.connection;
    return !document.hidden&&!connection?.saveData&&!['slow-2g','2g'].includes(connection?.effectiveType);
  };
  const target=element=>{
    const anchor=element?.closest?.('a[href]');
    if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return null;
    let url;try{url=new URL(anchor.href,window.location.href);}catch{return null;}
    if(url.origin!==window.location.origin||url.search||url.pathname===window.location.pathname||!routes.has(url.pathname))return null;
    return {anchor,url,product:routes.get(url.pathname)};
  };
  const consume=url=>fetch(url,{credentials:'same-origin',cache:'default',priority:'low'}).then(response=>response.ok?response.arrayBuffer():null).catch(()=>null);
  const warm=async entry=>{
    if(!entry||!permitted()||busy||warmed.size>=3||warmed.has(entry.url.pathname))return;
    warmed.add(entry.url.pathname);busy=true;
    const viewport=window.innerWidth||390;
  const desired=(viewport<=720?Math.min(viewport-44,460):Math.min((viewport-100)/2,540))*(window.devicePixelRatio||1);
    const candidates=entry.product.media?.sources||[{url:entry.product.image,width:870}];
    const image=candidates.find(candidate=>candidate.width>=desired)||candidates[candidates.length-1];
    try{await Promise.all([consume(entry.url.pathname),consume('/'+image.url)]);}finally{busy=false;}
  };
  const cancel=()=>{clearTimeout(timer);timer=0;pendingAnchor=null;};
  const prepare=(element,immediate=false)=>{
    cancel();const entry=target(element);if(!entry||!permitted())return;
    if(immediate){void warm(entry);return;}
    pendingAnchor=entry.anchor;timer=setTimeout(()=>{timer=0;pendingAnchor=null;void warm(entry);},120);
  };
  document.addEventListener('pointerover',event=>{if(event.pointerType==='mouse')prepare(event.target);},{passive:true});
  document.addEventListener('pointerout',event=>{if(pendingAnchor&&!pendingAnchor.contains(event.relatedTarget))cancel();},{passive:true});
  document.addEventListener('pointerdown',event=>prepare(event.target,true),{passive:true});
  document.addEventListener('focusin',event=>prepare(event.target),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
})();
