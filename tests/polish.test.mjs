import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consolidateStyles,compactStyles} from '../scripts/styles.mjs';
import '../source/product-pages.js';
import products from '../source/products.json' with {type:'json'};
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('CSS consolidation preserves priority, browser fallback values, media conditions and keyframes',()=>{
 const css='.a{color:red!important;color:blue}.a{display:block;display:grid;color:blue}@media(min-width:700px){.a{color:red}}@media(max-width:500px){.a{color:blue}}@keyframes x{0%{opacity:0}100%{opacity:0}}';
 const out=consolidateStyles(css);assert.equal(out.removed,1);assert.match(out.css,/color:red!important/);assert.match(out.css,/display:block;display:grid/);assert.match(out.css,/@media\(min-width:700px\)/);assert.match(out.css,/@media\(max-width:500px\)/);assert.match(out.css,/0%\{opacity:0\}100%\{opacity:0\}/);
});

test('All pages use one ordered local stylesheet and editorial labels agree with the product detail',()=>{
 const home=read('public/index.html'),sources=['storefront.css','enhancements.css','product-pages.css','campaigns.css','checkout-orders.css','navigation-layout.css'];
 assert.ok(!home.includes('<style'));assert.equal((home.match(/rel="stylesheet" href="\/[^\"]+/g)||[]).length,1);
 assert.equal(read('public/storefront.css'),compactStyles(consolidateStyles(sources.map(s=>read('source/'+s)).join('\n')).css));
 for(const p of products){const label=globalThis.SilloctaProductPages.badgeLabel(p),detail=read('public'+globalThis.SilloctaProductPages.path(p)+'.html');if(label)assert.ok(detail.includes('sl-product-badge">'+label));}
 assert.equal((home.match(/<span class="badge">/g)||[]).length,7);
 for(const label of ['Top Vendas','Best Seller','Tendência','Custo Benefício','Novo na coleção'])assert.ok(!home.includes('>'+label+'<'));
 assert.ok(!home.includes('<aside aria-hidden="true" id="mobile-menu-drawer"'));
});
