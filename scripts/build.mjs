import {readFileSync, writeFileSync, mkdirSync, cpSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {consolidateStyles,compactStyles} from './styles.mjs';
import {iconStyles,installCriticalStyles,campaignPreload,installHeroBootstrap} from './loading.mjs';
import {deploymentMetadata,seoFiles,pageMetadata} from './site-metadata.mjs';
import {measurementMetadata} from './measurement.mjs';
import {minify} from 'terser';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'source'),output=path.join(root,'public');
const products=JSON.parse(readFileSync(path.join(source,'products.json'),'utf8'));
await import('../source/product-pages.js');
const pages=globalThis.SilloctaProductPages;
const routes=products.map(pages.path);
if(new Set(routes).size!==products.length)throw Error('Duplicate perfume URL');

const metadata=deploymentMetadata(process.env);
const {origin,preview}=metadata;
const addMetadata=(html,route,product)=>html.replace('</head>',pageMetadata(metadata,route,product)+measurementMetadata(process.env)+'</head>');

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const originalHome=readFileSync(path.join(source,'index.html'),'utf8');
const home=installHeroBootstrap(originalHome.replace(/<meta name="viewport"[^>]*>/,viewport=>viewport+campaignPreload(originalHome)),readFileSync(path.join(source,'enhancements.js'),'utf8'));
const heroStart=home.indexOf('<section id="hero">'),shopEnd=home.indexOf('</main>',heroStart);
if(heroStart<0||shopEnd<heroStart)throw Error('Storefront layout missing');
const shell=(home.slice(0,heroStart)+'<!-- SILLOCTA_PRODUCT_DETAIL -->'+home.slice(shopEnd+7))
  .replace('<body>','<body class="sl-detail-view">')
  .replace(/<link id="sl-home-media-preload(?:-female|-campaign)?"[^>]*>/g,'')
  .replace(/<script id="sl-layout-bootstrap">[\s\S]*?<\/script>/,'')
  .replace(/href="#(shop|hero|sec-masculino|sec-feminino|catalog-search)"/g,'href="/#$1"');

rmSync(output,{recursive:true,force:true});
mkdirSync(path.join(output,'perfume'),{recursive:true});
for(const name of ['measurement.js','enhancements.css','enhancements.js','product-pages.css','product-pages.js','products.json','campaigns.css','campaigns.js','campaigns.json','navigation.js','discovery.js','media.json','checkout-orders.js','checkout-orders.css','assets'])cpSync(path.join(source,name),path.join(output,name),{recursive:true});
// Preserve global names used by inline controls and other scripts; shorten
// local implementation details and remove comments/whitespace in production.
for(const name of ['measurement.js','enhancements.js','product-pages.js','campaigns.js','navigation.js','discovery.js','checkout-orders.js']){
 const result=await minify(readFileSync(path.join(source,name),'utf8'),{
  ecma:2020,toplevel:false,compress:{passes:2},mangle:{toplevel:false},
  format:{comments:/^!/,quote_style:1},
 });
 if(!result.code)throw Error('Empty browser bundle: '+name);
 writeFileSync(path.join(output,name),result.code);
}
const styles=['storefront.css','enhancements.css','product-pages.css','campaigns.css','checkout-orders.css','navigation-layout.css'].map(name=>readFileSync(path.join(source,name),'utf8'));
const icons=iconStyles(JSON.parse(readFileSync(path.join(source,'icons.json'),'utf8')));
const bundled=consolidateStyles(icons+'\n'+styles.join('\n'));
writeFileSync(path.join(output,'storefront.css'),compactStyles(bundled.css));
writeFileSync(path.join(output,'index.html'),installCriticalStyles(addMetadata(home,'/'),bundled.css));
for(const product of products){
  const route=pages.path(product);
  let html=shell
    .replace(/<title>[^<]*<\/title>/,'<title>'+escape(product.name+' · '+product.brand+' | Sillocta')+'</title>')
    .replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+escape(pages.description(product))+'">')
    .replace('<!-- SILLOCTA_PRODUCT_DETAIL -->',pages.render(product,{products}));
  html=installCriticalStyles(addMetadata(html,route,product),bundled.css,{detail:true});
  writeFileSync(path.join(output,route.slice(1)+'.html'),html);
}

const seo=seoFiles(metadata,routes);
writeFileSync(path.join(output,'robots.txt'),seo.robots);
if(seo.sitemap)writeFileSync(path.join(output,'sitemap.xml'),seo.sitemap);
writeFileSync(path.join(output,'404.html'),`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página não encontrada | Sillocta</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050404;color:#e5e5e5;font-family:Georgia,serif}main{padding:32px;text-align:center;max-width:520px}.brand{color:#cbb477;letter-spacing:.22em;font-size:24px}h1{font-size:clamp(30px,7vw,42px);font-weight:400;line-height:1.2}p{font:16px/1.6 system-ui,sans-serif;color:#bcb4a5}a{display:inline-flex;align-items:center;min-height:48px;margin-top:16px;padding:12px 24px;border:1px solid #cbb47780;border-radius:3px;color:#e0c891;text-decoration:none;font:16px system-ui,sans-serif}a:focus-visible{outline:2px solid #e0c891;outline-offset:4px}</style></head><body><main><div class="brand">SILLOCTA</div><h1>Página não encontrada</h1><p>Continue explorando a nossa coleção de fragrâncias.</p><a href="/">Voltar à loja</a></main></body></html>`);

console.log('Vercel storefront built: home, '+products.length+' perfume pages and Orders presentation checkout.');
