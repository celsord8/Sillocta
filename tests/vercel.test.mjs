import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import PRODUCTS from '../source/products.json' with {type:'json'};
import '../source/product-pages.js';

const pages=globalThis.SilloctaProductPages;
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

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
  assert.ok(home.includes('hero-return-v28'));
  assert.deepEqual(readFileSync(new URL('../public/enhancements.css',import.meta.url)),readFileSync(new URL('../source/enhancements.css',import.meta.url)));
  assert.deepEqual(readFileSync(new URL('../public/enhancements.js',import.meta.url)),readFileSync(new URL('../source/enhancements.js',import.meta.url)));
  for(const p of PRODUCTS)assert.deepEqual(readFileSync(new URL('../public/'+p.image,import.meta.url)),readFileSync(new URL('../source/'+p.image,import.meta.url)));
});

test('Vercel publishes generated HTML with clean URLs and explicitly keeps automated payments disabled',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.outputDirectory,'public');
  assert.equal(config.cleanUrls,true);
  assert.equal(config.trailingSlash,false);
  assert.equal(config.rewrites.find(r=>r.source==='/api/checkout/config')?.destination,'/checkout-config.json');
  const checkout=JSON.parse(read('checkout-config.json'));
  assert.equal(checkout.enabled,false);
  assert.equal(checkout.shippingEnabled,false);
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
