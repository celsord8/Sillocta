import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('Opening font delivery retains both approved families, every original fallback and the two original preload roles',()=>{
 const html=read('public/index.html');
 const css=html.match(/<style id="sl-opening-fonts">([\s\S]*?)<\/style>/)?.[1];
 assert.ok(css);
 const faces=[...css.matchAll(/@font-face\{font-family:"([^"]+)";font-style:([^;]+);font-weight:([^;]+);font-display:swap;src:url\(([^)]+)\) format\("woff2"\);unicode-range:([^}]+)\}/g)];
 assert.deepEqual(faces.map(([,family,style,weight])=>({family,style,weight})),[
  {family:'Cormorant Garamond',style:'normal',weight:'300 600'},
  {family:'Montserrat',style:'normal',weight:'200 600'},
  {family:'Cormorant Garamond',style:'italic',weight:'300 600'}
 ]);
 const originals=['font-d80df8ff5aecd299.woff2','font-06b16db7a969135d.woff2','font-6f2f5c3b1abc3d0b.woff2'];
 let optimizedBytes=0,originalBytes=0;
 for(let i=0;i<faces.length;i++){
  const [,family,style,weight,url,range]=faces[i],asset=readFileSync(new URL('public'+url,root));
  assert.equal(asset.subarray(0,4).toString(),'wOF2');
  assert.ok(url.includes(createHash('sha256').update(asset).digest('hex').slice(0,16)));
  assert.ok(html.includes('/assets/responsive/'+originals[i]));
  assert.deepEqual(readFileSync(new URL('public/assets/responsive/'+originals[i],root)),readFileSync(new URL('source/assets/responsive/'+originals[i],root)));
  for(const character of 'SILLOCTA 0123456789 R$ ÀÁÂÃÇÉÊÍÓÔÕÚ àáâãçéêíóôõú · — ©')assert.ok(range.split(',').includes('U+'+character.codePointAt(0).toString(16).toUpperCase()),family+' '+style+' must cover '+character);
  optimizedBytes+=asset.length;originalBytes+=readFileSync(new URL('source/assets/responsive/'+originals[i],root)).length;
 }
 assert.ok(optimizedBytes<originalBytes*.8,'The opening fonts must deliver a material byte reduction');
 const preloads=[...html.matchAll(/<link rel="preload" as="font"[^>]*href="([^"]+)"[^>]*>/g)].map(match=>match[1]);
 assert.deepEqual(preloads,faces.slice(0,2).map(face=>face[4]));
 for(const family of ['Cormorant Garamond','Montserrat'])assert.ok(read('public/storefront.css').includes("font-family:'"+family+"'"));
});
