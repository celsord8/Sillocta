import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import PRODUCTS from '../source/products.json' with {type:'json'};
import {deploymentMetadata,seoFiles,pageMetadata} from '../scripts/site-metadata.mjs';

test('Canonical origin prefers the configured production domain and rejects paths, credentials and insecure URLs',()=>{
  assert.equal(deploymentMetadata({PUBLIC_SITE_URL:'https://loja.example',VERCEL_URL:'preview.example'}).origin,'https://loja.example');
  assert.equal(deploymentMetadata({VERCEL_PROJECT_PRODUCTION_URL:'production.example',VERCEL_URL:'preview.example'}).origin,'https://production.example');
  for(const value of ['http://loja.example','https://user:pass@loja.example','https://loja.example/path','https://loja.example/?x=1','https://loja.example/#hash'])assert.throws(()=>deploymentMetadata({PUBLIC_SITE_URL:value}));
});

test('Production sitemap uses canonical page URLs and ordinary preview builds cannot be indexed',()=>{
  const routes=['/perfume/creed-aventus','/perfume/dior-miss-dior'];
  const production=seoFiles(deploymentMetadata({VERCEL_PROJECT_PRODUCTION_URL:'production.example',VERCEL_ENV:'production'}),routes);
  assert.ok(production.robots.includes('Sitemap: https://production.example/sitemap.xml'));
  assert.equal((production.sitemap.match(/<loc>/g)||[]).length,3);
  assert.ok(!production.sitemap.includes('preview.example'));
  const preview=seoFiles(deploymentMetadata({VERCEL_PROJECT_PRODUCTION_URL:'production.example',VERCEL_URL:'preview.example',VERCEL_ENV:'preview'}),routes);
  assert.equal(preview.robots,'User-agent: *\nDisallow: /\n');
  assert.equal(preview.sitemap,null);
});

test('Only the owner-authorized review branch allows public SEO audits, with production canonicals',()=>{
 const env={VERCEL_PROJECT_PRODUCTION_URL:'production.example',VERCEL_URL:'preview.example',VERCEL_ENV:'preview'};
 const review=deploymentMetadata({...env,VERCEL_GIT_COMMIT_REF:'preview/mercado-pago-orders'});
 assert.equal(review.preview,true);assert.equal(review.indexable,true);
 const seo=seoFiles(review,['/perfume/creed-aventus']);
 assert.ok(seo.robots.includes('Allow: /'));assert.ok(seo.robots.includes('Disallow: /api/'));
 assert.ok(seo.sitemap.includes('https://production.example/perfume/creed-aventus'));
 assert.ok(!seo.sitemap.includes('preview.example'));
 const html=pageMetadata(review,'/');
 assert.ok(html.includes('name="robots" content="index, follow"'));
 assert.ok(html.includes('rel="canonical" href="https://production.example/"'));
 for(const branch of [undefined,'feature/catalog','preview/other','preview/mercado-pago-orders-copy']){
  const other=deploymentMetadata({...env,VERCEL_GIT_COMMIT_REF:branch});
  assert.equal(other.indexable,false);assert.equal(seoFiles(other,[]).sitemap,null);
  assert.ok(pageMetadata(other,'/').includes('noindex, nofollow'));
 }
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 const rule=config.headers.find(rule=>rule.headers.some(h=>h.key.toLowerCase()==='x-robots-tag'));
 assert.deepEqual(rule.has,[{type:'host',value:'sillocta-git-preview-mercado-pago-orders-celsord8s-projects.vercel.app'}]);
 assert.deepEqual(rule.headers,[{key:'X-Robots-Tag',value:'index, follow'}]);
});

test('Published HTML, robots and sitemap agree with the deployment audience',()=>{
 const root=new URL('../public/',import.meta.url);
 const metadata=deploymentMetadata(process.env);
 const home=readFileSync(new URL('index.html',root),'utf8');
 const robots=readFileSync(new URL('robots.txt',root),'utf8');
 assert.ok(existsSync(new URL('404.html',root)));
 if(!metadata.indexable){
  assert.ok(home.includes('name="robots" content="noindex, nofollow"'));
  assert.ok(robots.includes('Disallow: /'));
  assert.equal(existsSync(new URL('sitemap.xml',root)),false);
 }else if(metadata.origin){
  const sitemap=readFileSync(new URL('sitemap.xml',root),'utf8');
  assert.equal((sitemap.match(/<loc>/g)||[]).length,PRODUCTS.length+1);
  assert.ok(sitemap.includes('<loc>'+metadata.origin+'/</loc>'));
  assert.ok(home.includes('href="'+metadata.origin+'/"'));
 }
});

test('Product metadata describes decant variants, actual prices, availability and share cards without fabricated ratings',async()=>{
 const {pageMetadata}=await import('../scripts/site-metadata.mjs');
 for(const p of PRODUCTS){
  const html=pageMetadata({origin:'https://sillocta.vercel.app',preview:true},'/perfume/example',p);
  assert.match(html,/noindex, nofollow/);assert.match(html,/property="og:image"/);
  const data=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const group=data['@graph'].find(n=>n['@type']==='ProductGroup');
  assert.deepEqual(group.hasVariant.map(v=>v.size),['5 ml','10 ml']);
  for(const v of group.hasVariant){const volume=v.size.split(' ')[0];assert.equal(v.offers.price,(p.prices[volume]/100).toFixed(2));assert.equal(v.offers.priceCurrency,'BRL');assert.equal(v.offers.availability.endsWith('/InStock'),p.available);}
  assert.ok(!html.includes('aggregateRating'));assert.ok(!html.includes('reviewRating'));
 }
});
