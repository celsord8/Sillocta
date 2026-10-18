import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {consolidateStyles,compactStyles} from '../scripts/styles.mjs';
import {iconStyles,criticalStyles,campaignPreload,revealFirstScreen} from '../scripts/loading.mjs';
import '../source/product-pages.js';
import products from '../source/products.json' with {type:'json'};
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('The fully styled first screen reveals after two layout frames without waiting for deferred resources',()=>{
 const frames=[],timers=[],classes=[];const opening={hidden:false,classList:{add:name=>classes.push(name)}};
 const context=vm.createContext({document:{getElementById:id=>id==='preloader'?opening:null},requestAnimationFrame:fn=>frames.push(fn),setTimeout:(fn,ms)=>timers.push({fn,ms})});
 vm.runInContext('('+revealFirstScreen.toString()+')()',context);
 assert.deepEqual(classes,[]);frames.shift()();assert.deepEqual(classes,[]);frames.shift()();assert.deepEqual(classes,['hide']);assert.equal(opening.hidden,false);assert.equal(timers[0].ms,450);timers[0].fn();assert.equal(opening.hidden,true);
 const html=read('public/index.html');assert.ok(html.includes(revealFirstScreen.toString()));assert.ok(html.indexOf('id="sl-critical-styles"')<html.indexOf('id="sl-layout-bootstrap"'));
 const bootstrap=html.match(/<script id="sl-layout-bootstrap">([\s\S]*?)<\/script>/)[1];
 const campaign=read('source/campaigns.js');
 const initializer=campaign.slice(campaign.indexOf('function initializeCampaigns(){'),campaign.indexOf("\n  if(document.readyState==="));
 assert.ok(bootstrap.includes(initializer));
 assert.ok(bootstrap.indexOf(';initializeCampaigns();')<bootstrap.indexOf('('+revealFirstScreen.toString()+')()'));
});

test('Opening screen waits for settled styles and has a bounded failure fallback',()=>{
 const source=read('source/enhancements.js');
 const start=source.indexOf('const firstScreenStartedAt=Date.now();');
 const end=source.indexOf('requestAnimationFrame(()=>requestAnimationFrame(hidePreloader));',start);
 assert.ok(start>=0&&end>start);
 let now=0,ready=false;const timers=[],classes=[];
 const loader={classList:{add:value=>classes.push(value)},hidden:false};
 const context={Date:{now:()=>now},byId:id=>id==='preloader'?loader:id==='sl-full-styles'?{}:null,
  document:{documentElement:{classList:{contains:()=>ready}}},setTimeout:(fn,ms)=>timers.push({fn,ms})};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 context.hidePreloader();assert.deepEqual(classes,[]);assert.equal(timers[0].ms,50);
 ready=true;timers.shift().fn();assert.deepEqual(classes,['hide']);assert.equal(timers[0].ms,450);
 timers.shift().fn();assert.equal(loader.hidden,true);
 classes.length=0;ready=false;loader.hidden=false;now=2501;
 context.hidePreloader();assert.deepEqual(classes,['hide']);assert.equal(timers[0].ms,450);
});

test('CSS consolidation preserves priority, browser fallback values, media conditions and keyframes',()=>{
 const css='.a{color:red!important;color:blue}.a{display:block;display:grid;color:blue}@media(min-width:700px){.a{color:red}}@media(max-width:500px){.a{color:blue}}@keyframes x{0%{opacity:0}100%{opacity:0}}';
 const out=consolidateStyles(css);assert.equal(out.removed,1);assert.match(out.css,/color:red!important/);assert.match(out.css,/display:block;display:grid/);assert.match(out.css,/@media\(min-width:700px\)/);assert.match(out.css,/@media\(max-width:500px\)/);assert.match(out.css,/0%\{opacity:0\}100%\{opacity:0\}/);
});

test('Critical loading preserves media conditions, vector shapes, full-style fallback and Retina originals',()=>{
 const icons=JSON.parse(read('source/icons.json'));
 assert.deepEqual(Object.keys(icons).sort(),['bars','lock','mars','search','shopping-bag','venus','whatsapp']);
 const css=iconStyles(icons);
 for(const name of Object.keys(icons))assert.ok(css.includes('.fa-'+name+'{'));
 assert.ok(!css.includes('@font-face'));
 const fixture='@media(max-width:720px){#hero{display:flex}.sl-campaign-card{width:84%}#cart-drawer{padding:30px}}.sl-product-photo{width:50%}@keyframes sl-hero-copy{from{opacity:0}to{opacity:1}}';
 const homeCritical=criticalStyles(fixture),detailCritical=criticalStyles(fixture,{detail:true});
 assert.match(homeCritical,/@media\(max-width:720px\)\{#hero\{display:flex\}\.sl-campaign-card\{width:84%\}\}/);
 assert.ok(!homeCritical.includes('padding:30px'));
 assert.ok(!homeCritical.includes('.sl-product-photo'));
 assert.ok(detailCritical.includes('.sl-product-photo'));
 assert.ok(homeCritical.includes('@keyframes sl-hero-copy'));
 const home=read('public/index.html'),detail=read('public/perfume/dior-miss-dior.html');
 assert.ok(home.indexOf('id="sl-layout-bootstrap"')<home.indexOf('id="fragrance-guide"'));
 assert.ok(home.includes("data-hero-layout-ready"));
 assert.ok(!detail.includes('sl-layout-bootstrap'));
 assert.match(campaignPreload(home),/media="\(max-width:720px\)"/);
 assert.match(campaignPreload(home),/960[^\"]*960w/);
 assert.ok(!detail.includes('sl-home-media-preload'));
 assert.equal((home.match(/rel="preload" as="font"/g)||[]).length,2);
 for(const name of ['campaign-aventus','campaign-miss-dior']){
  const entry=JSON.parse(read('source/media.json'))['assets/'+name+'.webp'];
  const retina=entry.sources.find(s=>s.width===960);
  assert.equal(retina.quality,94);
  assert.ok(retina.bytes<entry.sources.at(-1).bytes);
  assert.equal(entry.sources.at(-1).url,'assets/'+name+'.webp');
 }
});

test('All pages retain one complete ordered stylesheet, a generated critical subset and consistent editorial labels',()=>{
 const home=read('public/index.html'),sources=['storefront.css','enhancements.css','product-pages.css','campaigns.css','checkout-orders.css','navigation-layout.css'];
 assert.equal((home.match(/id="sl-critical-styles"/g)||[]).length,1);
 assert.match(home,/<link id="sl-full-styles" rel="preload" as="style"/);
 assert.match(home,/<noscript><link rel="stylesheet"/);
 assert.ok(home.includes('@layer sl-first-paint{html:not(.sl-styles-ready)'));
 assert.ok(home.includes("requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.add('sl-styles-ready')))"));
 assert.match(read('source/enhancements.js'),/byId\('sl-full-styles'\).*sl-styles-ready.*firstScreenStartedAt<2500/);
 const icons=iconStyles(JSON.parse(read('source/icons.json')));
 const full=consolidateStyles(icons+'\n'+sources.map(s=>read('source/'+s)).join('\n')).css;
 assert.equal(read('public/storefront.css'),compactStyles(full));
 assert.ok(home.includes(criticalStyles(full)));
 assert.ok(criticalStyles(full).length<180000);
 for(const selector of ['.sl-guide-invitation','.sl-catalog-filter-grid','.perfume-grid'])assert.ok(criticalStyles(full).includes(selector));
 assert.ok(!home.includes('cdnjs.cloudflare.com'));
 for(const p of products){const label=globalThis.SilloctaProductPages.badgeLabel(p),detail=read('public'+globalThis.SilloctaProductPages.path(p)+'.html');if(label)assert.ok(detail.includes('sl-product-badge">'+label));}
 assert.equal((home.match(/<span class="badge">/g)||[]).length,7);
 for(const label of ['Top Vendas','Best Seller','Tendência','Custo Benefício','Novo na coleção'])assert.ok(!home.includes('>'+label+'<'));
 assert.ok(!home.includes('<aside aria-hidden="true" id="mobile-menu-drawer"'));
});
