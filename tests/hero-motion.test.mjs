import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function harness({reduced=false,onScreen=true}={}){
  const nodes=new Map(),events=new Map(),timers=new Map(),frames=new Map();let id=0,intersection;
  const node=(name='')=>{
    const classes=new Set(),attributes=new Map(),listeners=new Map();
    const element={id:name,children:[],style:{setProperty(){}},visible:onScreen,
      classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,on){if(on)classes.add(value);else classes.delete(value);}},
      getBoundingClientRect(){return {top:this.visible?100:1200,bottom:this.visible?400:1500,width:300,height:300};},
      getAttribute:key=>attributes.get(key)||null,setAttribute:(key,value)=>attributes.set(key,value),
      addEventListener:(type,action)=>listeners.set(type,action),removeEventListener:type=>listeners.delete(type),
      append(child){this.children.push(child);},after(child){this.parentElement.children.push(child);},
      emit(type,event={}){listeners.get(type)?.(event);}
    };
    if(name)nodes.set(name,element);return element;
  };
  const hero=node('hero'),collections=node('colecao-selector'),copy=node('hero-txt');
  copy.children=[node('kicker'),node('title'),node('explore')];
  for(const key of ['masc','fem']){
    const plane=node(),image=node('img-'+key);image.parentElement=plane;plane.children.push(image);
    image.setAttribute('src','/assets/img-'+key+'.jpg');image.setAttribute('width','870');image.setAttribute('height','1080');
  }
  const preference={matches:reduced,addEventListener(type,action){this.change=action;}};
  const document={hidden:false,getElementById:id=>nodes.get(id),createElement:()=>node(),addEventListener:(type,action)=>events.set('document:'+type,action)};
  const window={innerHeight:900,matchMedia:query=>query.includes('reduced-motion')?preference:{matches:false,addEventListener(){}},getComputedStyle:()=>({display:'block'}),addEventListener:(type,action)=>events.set(type,action)};
  class IntersectionObserver{constructor(action){intersection=action;}observe(){}}
  window.IntersectionObserver=IntersectionObserver;
  const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
  const context=vm.createContext({document,window,IntersectionObserver,setTimeout:action=>{timers.set(++id,action);return id;},clearTimeout:key=>timers.delete(key),requestAnimationFrame:action=>{frames.set(++id,action);return id;},cancelAnimationFrame:key=>frames.delete(key)});
  vm.runInContext(source.slice(source.indexOf('function initializeHeroMotion(){')),context);
  return {hero,collections,copy,nodes,timers,document,
    event(type,event={}){events.get(type)?.(event);},
    finish(){for(const [key,action] of timers){timers.delete(key);action();}},
    visible(on){for(const section of [hero,collections])section.visible=on;intersection([hero,collections].map(target=>({target,isIntersecting:on})));},
    reduced(on){preference.matches=on;preference.change();},
    initializeAgain(){vm.runInContext('initializeHeroMotion()',context);}
  };
}

test('Hero motion initializes on opening without a click and creates each reflection only once',()=>{
  const h=harness();
  assert.ok(h.hero.classList.contains('sl-hero-motion'));
  assert.ok(h.hero.classList.contains('sl-hero-intro'));
  assert.ok(!h.collections.classList.contains('sl-hero-motion-paused'));
  for(const key of ['masc','fem']){
    const image=h.nodes.get('img-'+key),reflection=image.parentElement.children[1];
    assert.equal(reflection.className,'sl-hero-glint');
    assert.equal(reflection.children[0].getAttribute('src'),image.getAttribute('src'));
  }
  h.initializeAgain();
  assert.equal(h.nodes.get('img-masc').parentElement.children.length,2);
  assert.equal(h.nodes.get('img-fem').parentElement.children.length,2);
});

test('The copy becomes fully visible even if animationend never fires while the hero is offscreen',()=>{
  const h=harness({onScreen:false});
  assert.ok(h.hero.classList.contains('sl-hero-motion-paused'));
  h.finish();assert.ok(!h.hero.classList.contains('sl-hero-intro'));
  h.visible(true);assert.ok(!h.hero.classList.contains('sl-hero-motion-paused'));
});

test('Returning from a cached page resumes visible artwork without replaying a hidden copy intro',()=>{
  const h=harness();h.event('pagehide');
  assert.ok(h.collections.classList.contains('sl-hero-motion-paused'));
  h.event('pageshow',{persisted:true});
  assert.ok(!h.collections.classList.contains('sl-hero-motion-paused'));
  assert.ok(!h.hero.classList.contains('sl-hero-intro'));
  assert.equal(h.timers.size,0);
});

test('Hidden tabs pause motion and reduced-motion preferences stop the intro while preserving visible content',()=>{
  const h=harness();h.document.hidden=true;h.event('document:visibilitychange');
  assert.ok(h.collections.classList.contains('sl-hero-motion-paused'));
  h.document.hidden=false;h.event('document:visibilitychange');
  assert.ok(!h.collections.classList.contains('sl-hero-motion-paused'));
  h.reduced(true);assert.ok(!h.hero.classList.contains('sl-hero-intro'));
  assert.ok(h.collections.classList.contains('sl-hero-motion-paused'));
  const initial=harness({reduced:true});assert.ok(!initial.hero.classList.contains('sl-hero-intro'));assert.equal(initial.timers.size,0);
});
