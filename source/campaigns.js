/* Three identical runs keep the native, touch-driven carousel continuous. */
(() => {
  'use strict';
  function initializeCampaigns(){
  const root=document.getElementById('catalog-campaigns');
  if(!root||root.getAttribute('data-campaign-ready')==='true')return;
  const track=root.querySelector('.sl-campaign-track');
  const pagination=root.querySelector('.sl-campaign-pagination');
  if(!track||!pagination)return;
  const cards=[...track.querySelectorAll('.sl-campaign-card')];
  const buttons=[...pagination.querySelectorAll('button')];
  if(!cards.length)return;
  root.setAttribute('data-campaign-ready','true');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const interval=2000;
  const indexes=new Map(cards.map((card,index)=>[card,index]));
  const duplicate=card=>{
    const clone=card.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden','true');
    clone.setAttribute('tabindex','-1');
    clone.setAttribute('data-campaign-clone','true');
    clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    const img=clone.querySelector('img');
    if(img){img.loading='lazy';img.fetchPriority='low';}
    indexes.set(clone,indexes.get(card));
    return clone;
  };
  // Append both extra runs. The original first image stays at scrollLeft=0
  // while it paints; recenter only when browsing needs the backward runway.
  const after=cards.map(duplicate),tail=cards.map(duplicate);
  for(const clone of [...after,...tail])track.appendChild(clone);
  const copies=[...after,...tail],all=[...cards,...after,...tail];
  const waitingImages=new WeakSet();
  let pending=false,layoutPending=false,timer=0,preloadTimer=0,settleTimer=0;
  let hovered=false,focused=false,pressed=false,manualUntil=0,looping=false,centered=false,origin=0,period=0;
  const positions=new Map();
  let shown=[];
  const measureView=()=>{
    const rect=root.getBoundingClientRect?.();
    const height=window.innerHeight||document.documentElement?.clientHeight;
    return rect&&height?rect.bottom>0&&rect.top<height:!('IntersectionObserver' in window);
  };
  let inView=measureView();
  const active=()=>Math.max(0,buttons.findIndex(button=>button.getAttribute('aria-pressed')==='true'));
  const hydrate=card=>{
    if(!card)return;
    // Source elements precede the img, so the browser sees the final responsive
    // selection before starting a request. Clones reuse that same cached URL.
    card.querySelectorAll('[data-sl-srcset],[data-sl-src]').forEach(node=>{
      for(const name of ['srcset','src']){
        const value=node.getAttribute('data-sl-'+name);
        if(value!==null){node.setAttribute(name,value);node.removeAttribute('data-sl-'+name);}
      }
    });
  };
  const offset=card=>positions.get(card)??0;
  const visible=()=>shown;
  const nearest=()=>{
    const shown=visible();
    return shown.reduce((best,card)=>Math.abs(offset(card)-track.scrollLeft)<Math.abs(offset(best)-track.scrollLeft)?card:best,shown[0]);
  };
  const stop=()=>{clearTimeout(timer);clearTimeout(preloadTimer);timer=0;preloadTimer=0;};
  const canPlay=()=>looping&&!reduced.matches&&!document.hidden&&inView&&!hovered&&!focused&&!pressed;
  const jump=left=>{
    // An instant equivalent position is painted with snap and smooth disabled.
    track.setAttribute('data-jump','true');
    track.scrollTo({left,behavior:'instant'});
    requestAnimationFrame(()=>{track.removeAttribute('data-jump');update();});
  };
  const normalize=()=>{
    clearTimeout(settleTimer);settleTimer=0;
    if(!looping||pressed||period<=0)return;
    const left=track.scrollLeft;
    if(left<origin-.5||left>=origin+period-.5){
      const equivalent=origin+((left-origin)%period+period)%period;
      if(Math.abs(equivalent-left)>.5)jump(equivalent);
    }
  };
  const move=card=>{
    if(!card)return;
    hydrate(card);
    track.scrollTo({left:offset(card),behavior:reduced.matches?'instant':'smooth'});
  };
  const center=()=>{
    if(!looping||centered)return;
    centered=true;origin=period;
    jump(track.scrollLeft+period);
  };
  const step=direction=>{
    if(direction<0)center();
    const shown=visible(),current=shown.indexOf(nearest());
    move(shown[Math.max(0,Math.min(shown.length-1,current+direction))]);
  };
  const go=index=>{
    const candidates=visible().filter(card=>indexes.get(card)===index);
    move(candidates.reduce((best,card)=>!best||Math.abs(offset(card)-track.scrollLeft)<Math.abs(offset(best)-track.scrollLeft)?card:best,null));
  };
  const waitForImage=image=>{
    if(!image||image.complete!==false)return false;
    if(!waitingImages.has(image)){
      waitingImages.add(image);
      const ready=()=>{waitingImages.delete(image);queueAutoplay();};
      image.addEventListener('load',ready,{once:true});
      image.addEventListener('error',ready,{once:true});
    }
    return true;
  };
  const queueAutoplay=(fromIndex=active())=>{
    stop();
    if(!canPlay())return;
    // Give a slow connection the full dwell time after the visible photograph
    // arrives. Never move away from an image that has not finished loading.
    if(waitForImage(nearest()?.querySelector('img')))return;
    const next=(fromIndex+1)%cards.length;
    const delay=Math.max(interval,manualUntil-Date.now());
    // Leave bandwidth to the visible first frame, then warm only the next
    // slide before the two-second transition. Original files stay unchanged.
    preloadTimer=setTimeout(()=>{
      preloadTimer=0;if(!canPlay())return;
      all.filter(card=>indexes.get(card)===next).forEach(card=>{
        hydrate(card);
        const img=card.querySelector('img');if(img){img.loading='eager';img.fetchPriority='low';}
      });
    },Math.max(0,delay-1200));
    timer=setTimeout(()=>{
      timer=0;if(!canPlay())return;
      const nextCard=visible().find(card=>indexes.get(card)===next);
      if(waitForImage(nextCard?.querySelector('img')))return;
      // Smooth scrolling updates the active dot asynchronously. Carry the
      // intended destination so the following wait checks the right photo.
      step(1);queueAutoplay(next);
    },delay);
  };
  const manual=()=>{center();manualUntil=Date.now()+7000;queueAutoplay();};
  const update=()=>{
    pending=false;
    const current=indexes.get(nearest())??0;
    // Warm the current photograph and the visible peek immediately, including
    // after a swipe, keyboard jump, resize or browser-history restoration.
    all.filter(card=>[current,(current+1)%cards.length].includes(indexes.get(card))).forEach(hydrate);
    buttons.forEach((button,index)=>button.setAttribute('aria-pressed',String(index===current)));
    all.forEach(card=>card.setAttribute('data-active',String(indexes.get(card)===current)));
    pagination.hidden=!looping;
  };
  const schedule=()=>{
    if(!pending){pending=true;requestAnimationFrame(update);}
    clearTimeout(settleTimer);settleTimer=setTimeout(normalize,160);
  };
  const layout=()=>{
    layoutPending=false;
    const current=active(),rects=cards.map(card=>card.getBoundingClientRect());
    const first=rects[0],last=rects.at(-1),left=track.getBoundingClientRect().left,scroll=track.scrollLeft;
    looping=cards.length>1&&last.right-first.left>track.clientWidth+1;
    const gap=rects.length>1?rects[1].left-first.right:0;
    period=looping?last.right-first.left+gap:0;
    // Every run shares the originals' widths and gap. Cache all positions from
    // those reads, then change visibility/scroll without another layout query.
    copies.forEach(card=>{if(card.hidden===looping)card.hidden=!looping;});
    shown=looping?all:cards;
    positions.clear();
    shown.forEach((card,index)=>positions.set(card,scroll+rects[index%cards.length].left-left+Math.floor(index/cards.length)*period));
    if(!looping)centered=false;
    origin=centered?period:0;
    const target=looping?offset(cards[current])+origin:0;
    if(Math.abs(target-track.scrollLeft)>.5)jump(target);
    update();queueAutoplay();
  };
  const resize=()=>{if(!layoutPending){layoutPending=true;requestAnimationFrame(layout);}};
  buttons.forEach((button,index)=>button.addEventListener('click',()=>{manual();go(index);}));
  track.addEventListener('scroll',schedule,{passive:true});
  track.addEventListener('scrollend',normalize,{passive:true});
  track.addEventListener('wheel',manual,{passive:true});
  root.addEventListener('pointerdown',()=>{pressed=true;manual();});
  const release=()=>{if(pressed){pressed=false;manual();schedule();}};
  window.addEventListener('pointerup',release,{passive:true});
  window.addEventListener('pointercancel',release,{passive:true});
  root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;queueAutoplay();}});
  root.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'){hovered=false;queueAutoplay();}});
  root.addEventListener('focusin',event=>{focused=!!event.target?.matches?.(':focus-visible');queueAutoplay();});
  root.addEventListener('focusout',event=>{focused=!!(root.contains(event.relatedTarget)&&event.relatedTarget?.matches?.(':focus-visible'));if(!focused)manual();else queueAutoplay();});
  root.addEventListener('keydown',()=>{focused=true;queueAutoplay();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)inView=measureView();queueAutoplay();});
  window.addEventListener('pagehide',()=>{stop();clearTimeout(settleTimer);settleTimer=0;});
  window.addEventListener('pageshow',()=>{
    pressed=false;hovered=false;manualUntil=0;
    focused=!!(root.contains(document.activeElement)&&document.activeElement?.matches?.(':focus-visible'));
    inView=measureView();resize();
  });
  reduced.addEventListener?.('change',()=>queueAutoplay());
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=!!entries[0]?.isIntersecting;queueAutoplay();},{threshold:0}).observe(root);
  track.addEventListener('keydown',event=>{
    if(event.target!==track||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();manual();
    if(event.key==='Home')go(0);
    else if(event.key==='End')go(cards.length-1);
    else step(event.key==='ArrowRight'?1:-1);
  });
  window.addEventListener('resize',resize,{passive:true});
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(track);
  layout();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeCampaigns,{once:true});
  else initializeCampaigns();
})();
