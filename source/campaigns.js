/* Three identical runs keep the native, touch-driven carousel continuous. */
(() => {
  'use strict';
  const root=document.getElementById('catalog-campaigns');
  if(!root)return;
  const track=root.querySelector('.sl-campaign-track');
  const cards=[...track.querySelectorAll('.sl-campaign-card')];
  const pagination=root.querySelector('.sl-campaign-pagination');
  const buttons=[...pagination.querySelectorAll('button')];
  if(!cards.length)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const interval=1800;
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
  const before=cards.map(duplicate),after=cards.map(duplicate);
  for(const clone of before)track.insertBefore(clone,cards[0]);
  for(const clone of after)track.appendChild(clone);
  const copies=[...before,...after],all=[...before,...cards,...after];
  let pending=false,layoutPending=false,timer=0,settleTimer=0;
  let hovered=false,focused=false,pressed=false,manualUntil=0,looping=false,origin=0,period=0;
  let inView=!('IntersectionObserver' in window);
  const active=()=>Math.max(0,buttons.findIndex(button=>button.getAttribute('aria-pressed')==='true'));
  const offset=card=>track.scrollLeft+card.getBoundingClientRect().left-track.getBoundingClientRect().left;
  const visible=()=>all.filter(card=>!card.hidden);
  const nearest=()=>{
    const shown=visible();
    return shown.reduce((best,card)=>Math.abs(offset(card)-track.scrollLeft)<Math.abs(offset(best)-track.scrollLeft)?card:best,shown[0]);
  };
  const stop=()=>{clearTimeout(timer);timer=0;};
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
    track.scrollTo({left:offset(card),behavior:reduced.matches?'instant':'smooth'});
  };
  const step=direction=>{
    const shown=visible(),current=shown.indexOf(nearest());
    move(shown[Math.max(0,Math.min(shown.length-1,current+direction))]);
  };
  const go=index=>{
    const candidates=visible().filter(card=>indexes.get(card)===index);
    move(candidates.reduce((best,card)=>!best||Math.abs(offset(card)-track.scrollLeft)<Math.abs(offset(best)-track.scrollLeft)?card:best,null));
  };
  const queueAutoplay=()=>{
    stop();
    if(!canPlay())return;
    const next=(active()+1)%cards.length;
    all.filter(card=>indexes.get(card)===next).forEach(card=>{
      const img=card.querySelector('img');if(img){img.loading='eager';img.fetchPriority='low';}
    });
    timer=setTimeout(()=>{
      timer=0;if(!canPlay())return;
      step(1);queueAutoplay();
    },Math.max(interval,manualUntil-Date.now()));
  };
  const manual=()=>{manualUntil=Date.now()+7000;queueAutoplay();};
  const update=()=>{
    pending=false;
    const current=indexes.get(nearest())??0;
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
    const current=active(),first=cards[0].getBoundingClientRect(),last=cards.at(-1).getBoundingClientRect();
    looping=cards.length>1&&last.right-first.left>track.clientWidth+1;
    copies.forEach(card=>{card.hidden=!looping;});
    origin=offset(cards[0]);
    period=looping?offset(after[0])-origin:0;
    jump(looping?offset(cards[current]):0);
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
  document.addEventListener('visibilitychange',queueAutoplay);
  reduced.addEventListener?.('change',queueAutoplay);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting&&entries[0].intersectionRatio>=.35;queueAutoplay();},{threshold:[0,.35]}).observe(root);
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
})();
