import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import PRODUCTS from '../source/products.json' with {type:'json'};
import {deploymentMetadata,seoFiles} from '../scripts/site-metadata.mjs';

test('Canonical origin prefers the configured production domain and rejects paths, credentials and insecure URLs',()=>{
  assert.equal(deploymentMetadata({PUBLIC_SITE_URL:'https://loja.example',VERCEL_URL:'preview.example'}).origin,'https://loja.example');
  assert.equal(deploymentMetadata({VERCEL_PROJECT_PRODUCTION_URL:'production.example',VERCEL_URL:'preview.example'}).origin,'https://production.example');
  for(const value of ['http://loja.example','https://user:pass@loja.example','https://loja.example/path','https://loja.example/?x=1','https://loja.example/#hash'])assert.throws(()=>deploymentMetadata({PUBLIC_SITE_URL:value}));
});

test('Production sitemap uses only canonical page URLs and preview builds cannot be indexed',()=>{
  const routes=['/perfume/creed-aventus','/perfume/dior-miss-dior'];
  const production=seoFiles(deploymentMetadata({VERCEL_PROJECT_PRODUCTION_URL:'production.example',VERCEL_ENV:'production'}),routes);
  assert.ok(production.robots.includes('Sitemap: https://production.example/sitemap.xml'));
  assert.equal((production.sitemap.match(/<loc>/g)||[]).length,3);
  assert.ok(!production.sitemap.includes('preview.example'));
  const preview=seoFiles(deploymentMetadata({VERCEL_PROJECT_PRODUCTION_URL:'production.example',VERCEL_URL:'preview.example',VERCEL_ENV:'preview'}),routes);
  assert.equal(preview.robots,'User-agent: *\nDisallow: /\n');
  assert.equal(preview.sitemap,null);
});

test('Published HTML, robots and sitemap agree with the deployment audience',()=>{
 const root=new URL('../public/',import.meta.url);
 const metadata=deploymentMetadata(process.env);
 const home=readFileSync(new URL('index.html',root),'utf8');
 const robots=readFileSync(new URL('robots.txt',root),'utf8');
 assert.ok(existsSync(new URL('404.html',root)));
 if(metadata.preview){
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
