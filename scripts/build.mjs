import {readFileSync, writeFileSync, mkdirSync, cpSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'source'),output=path.join(root,'public');
const products=JSON.parse(readFileSync(path.join(source,'products.json'),'utf8'));
await import('../source/product-pages.js');
const pages=globalThis.SilloctaProductPages;
const routes=products.map(pages.path);
if(new Set(routes).size!==products.length)throw Error('Duplicate perfume URL');

// Vercel provides the production domain even for preview builds. A custom
// domain may be supplied explicitly without placing any private keys here.
const domain=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;
const siteUrl=process.env.PUBLIC_SITE_URL||(domain?'https://'+domain:'');
let origin='';
if(siteUrl){
  const url=new URL(siteUrl);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_SITE_URL must be a bare HTTPS origin');
  origin=url.origin;
}

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const home=readFileSync(path.join(source,'index.html'),'utf8');
const heroStart=home.indexOf('<section id="hero">'),shopEnd=home.indexOf('</main>',heroStart);
if(heroStart<0||shopEnd<heroStart)throw Error('Storefront layout missing');
const shell=(home.slice(0,heroStart)+'<!-- SILLOCTA_PRODUCT_DETAIL -->'+home.slice(shopEnd+7))
  .replace('<body>','<body class="sl-detail-view">')
  .replace(/href="#(shop|hero|sec-masculino|sec-feminino|catalog-search)"/g,'href="/#$1"');

rmSync(output,{recursive:true,force:true});
mkdirSync(path.join(output,'perfume'),{recursive:true});
for(const name of ['enhancements.css','enhancements.js','product-pages.css','product-pages.js','products.json','assets'])cpSync(path.join(source,name),path.join(output,name),{recursive:true});
writeFileSync(path.join(output,'index.html'),origin?home.replace('</head>','<link rel="canonical" href="'+escape(origin)+'/"></head>'):home);
for(const product of products){
  const route=pages.path(product);
  let html=shell
    .replace(/<title>[^<]*<\/title>/,'<title>'+escape(product.name+' · '+product.brand+' | Sillocta')+'</title>')
    .replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+escape(pages.description(product))+'">')
    .replace('<!-- SILLOCTA_PRODUCT_DETAIL -->',pages.render(product,{products}));
  if(origin)html=html.replace('</head>','<link rel="canonical" href="'+escape(origin+route)+'"></head>');
  writeFileSync(path.join(output,route.slice(1)+'.html'),html);
}

// This export preserves the currently approved WhatsApp checkout. A static
// host cannot create or authenticate Mercado Pago orders. Never enable an
// online-payment button without a real compatible server and order database.
writeFileSync(path.join(output,'checkout-config.json'),JSON.stringify({enabled:false,shippingEnabled:false,freeShippingThreshold:29900}));
console.log('Vercel storefront built: home, '+products.length+' individual perfume pages, WhatsApp checkout.');
