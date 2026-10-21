import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import PRODUCTS from '../source/products.json' with {type:'json'};
import '../source/product-pages.js';

const pages=globalThis.SilloctaProductPages;
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

test('Responsive assets accompany every generated page and home-only image preload stays out of detail pages',()=>{
  const media=JSON.parse(read('media.json'));
  for(const [name,entry] of Object.entries(media)){
    assert.equal(entry.sources.at(-1).url,name);
    for(const item of entry.sources){
      const output=readFileSync(new URL('../public/'+item.url,import.meta.url));
      assert.equal(output.length,item.bytes);
      assert.deepEqual(output,readFileSync(new URL('../source/'+item.url,import.meta.url)));
    }
  }
  assert.ok(read('index.html').includes('id="sl-home-media-preload"'));
  for(const p of PRODUCTS){
    const detail=read(pages.path(p).slice(1)+'.html');
    assert.ok(!detail.includes('id="sl-home-media-preload"'));
    assert.ok(detail.includes('srcset="'+p.media.sources.map(item=>'/'+item.url+' '+item.width+'w').join(', ')+'"'));
    const preload=detail.match(/<link id="sl-product-media-preload"[^>]+>/)?.[0];
    const image=detail.match(/class="sl-product-photo"><img\s+([^>]+)>/)[1];
    assert.ok(preload&&detail.indexOf(preload)<detail.indexOf('<style id="sl-full-styles">'));
    for(const [name,preloadName] of [['src','href'],['srcset','imagesrcset'],['sizes','imagesizes']]){
      const value=image.match(new RegExp('(?:^|\\s)'+name+'="([^"]+)"'))[1];
      assert.ok(preload.includes(preloadName+'="'+value+'"'));
    }
  }
});

test('Long-lived browser bundles have content-derived versions on home and all detail pages',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  const rule=config.headers.find(h=>h.has?.some(condition=>condition.key==='v'&&condition.value==='.+-[a-f0-9]{12}'));
  assert.ok(rule?.headers.some(h=>h.key==='Cache-Control'&&h.value.includes('immutable')));
  for(const name of ['index.html',...PRODUCTS.map(p=>pages.path(p).slice(1)+'.html')]){
    const scripts=[...read(name).matchAll(/<script defer src="\/([^"?]+\.js)\?v=([^"&]+)"><\/script>/g)];
    assert.equal(scripts.length,7);
    for(const [,bundle,version] of scripts){
      const hash=createHash('sha256').update(readFileSync(new URL('../public/'+bundle,import.meta.url))).digest('hex').slice(0,12);
      assert.ok(version.endsWith('-'+hash),bundle+' must change its URL whenever its content changes');
    }
  }
});

test('Every perfume has a static page usable on a direct URL and refresh, with all local resources present',()=>{
  for(const p of PRODUCTS){
    const route=pages.path(p),html=read(route.slice(1)+'.html');
    assert.ok(html.includes(`data-product-id="${p.id}"`));
    assert.equal((html.match(/<h1\b/g)||[]).length,1);
    assert.ok(html.includes(`src="/${p.image}"`));
    assert.ok(html.includes('data-product-volume="5"'));
    assert.ok(html.includes('data-product-volume="10"'));
    assert.equal(html.includes('id="product-add"'),p.available);
    assert.ok(!html.includes('id="hero"'));
    assert.ok(!html.includes('SILLOCTA_PRODUCT_DETAIL'));
    for(const match of html.matchAll(/(?:src|href)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){
      const target=match[1];
      assert.ok(target==='/'||existsSync(new URL('../public'+target,import.meta.url))||existsSync(new URL('../public'+target+'.html',import.meta.url)),`Missing local resource or page: ${target}`);
    }
  }
});

test('Home retains all product links, both floating collections and the approved mobile typography',()=>{
  const home=read('index.html');
  for(const p of PRODUCTS)assert.ok(home.includes(`href="${pages.path(p)}"`));
  assert.ok(home.includes('id="sel-masc-btn"'));
  assert.ok(home.includes('id="sel-fem-btn"'));
  assert.ok(home.includes('family=Montserrat'));
  assert.ok(!home.includes('Manrope'));
  assert.ok(!home.includes('/menu.css'));
  assert.ok(!home.includes('/impact.css'));
  assert.equal((home.match(/class="sl-campaign-card"/g)||[]).length,6);
  for(const asset of ['campaigns.css','campaigns.js','campaigns.json','navigation.js','media.json'])assert.ok(existsSync(new URL('../public/'+asset,import.meta.url)));
  assert.deepEqual(readFileSync(new URL('../public/enhancements.css',import.meta.url)),readFileSync(new URL('../source/enhancements.css',import.meta.url)));
  assert.ok(readFileSync(new URL('../public/enhancements.js',import.meta.url)).length<readFileSync(new URL('../source/enhancements.js',import.meta.url)).length*.9);
  for(const p of PRODUCTS)assert.deepEqual(readFileSync(new URL('../public/'+p.image,import.meta.url)),readFileSync(new URL('../source/'+p.image,import.meta.url)));
});

test('Vercel publishes generated HTML with clean URLs and uses private serverless routes for the sandbox',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.outputDirectory,'public');
  assert.equal(config.cleanUrls,true);
  assert.equal(config.trailingSlash,false);
  assert.ok(!config.rewrites?.some(r=>r.source==='/api/checkout/config'));
  assert.ok(existsSync(new URL('../api/checkout/order.js',import.meta.url)));
  assert.ok(config.headers.some(h=>h.source==='/api/checkout/:path*'));
  assert.ok(!existsSync(new URL('../public/server',import.meta.url)));
  assert.ok(!existsSync(new URL('../public/.openai',import.meta.url)));
  assert.ok(!existsSync(new URL('../public/product-shell.html',import.meta.url)));
});

test('Canonical URLs use the configured Vercel production domain instead of the Sites domain',()=>{
  const domain=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;
  const configured=process.env.PUBLIC_SITE_URL||(domain?'https://'+domain:'');
  for(const p of PRODUCTS){
    const html=read(pages.path(p).slice(1)+'.html');
    assert.ok(!html.includes('sillocta-maison.vastmacaw1.chatgpt.site'));
    if(configured)assert.ok(html.includes(`rel="canonical" href="${new URL(configured).origin}${pages.path(p)}"`));
    else assert.ok(!html.includes('rel="canonical"'));
  }
});
