import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import PRODUCTS from '../source/products.json' with {type:'json'};
import '../source/discovery.js';
const discovery=globalThis.SilloctaDiscovery;

test('Every complete guide combination returns up to three distinct available perfumes with actual olfactory explanations',()=>{
  const choices=Object.fromEntries(discovery.questions.map(q=>[q.key,q.options.map(o=>o[0])]));
  for(const gender of choices.gender)for(const occasion of choices.occasion)for(const presence of choices.presence)for(const family of choices.family){
    const result=discovery.recommend(PRODUCTS,{gender,occasion,presence,family});
    assert.ok(result.length<=3);assert.equal(new Set(result.map(r=>r.product.id)).size,result.length);
    if(family==='discover')assert.equal(result.length,Math.min(3,PRODUCTS.filter(p=>p.available&&p.gender===gender).length));
    for(const match of result){assert.equal(match.product.available,true);assert.equal(match.product.gender,gender);assert.equal(match.familyMatch,true);assert.ok(match.reasons.length>=1);assert.ok(match.reasons.every(reason=>typeof reason==='string'&&reason.length>10));assert.ok(match.matchingNotes.every(note=>match.product.notes.includes(note)));}
    for(let i=1;i<result.length;i++)assert.ok(result[i-1].score>=result[i].score);
  }
  assert.ok(PRODUCTS.every(p=>discovery.curation[p.id]));
  assert.deepEqual(discovery.recommend(PRODUCTS,{occasion:'invented',presence:'bold',family:'sweet'}),[]);
  assert.deepEqual(discovery.recommend(PRODUCTS,{occasion:'daily'}),[]);
  assert.deepEqual(discovery.recommend(PRODUCTS.map(p=>({...p,available:false})),{gender:'f',occasion:'daily',presence:'light',family:'floral'}),[]);
  assert.deepEqual(discovery.cleanAnswers({occasion:'daily',presence:'invalid',family:'sweet',email:'ignore'}),{occasion:'daily',family:'sweet'});
});

test('Guide choices change the selection while keeping the selected family relevant',()=>{
  const fresh=discovery.recommend(PRODUCTS,{gender:'f',occasion:'daily',presence:'light',family:'fresh'});
  const sweet=discovery.recommend(PRODUCTS,{gender:'m',occasion:'evening',presence:'bold',family:'sweet'});
  assert.notDeepEqual(fresh.map(r=>r.product.id),sweet.map(r=>r.product.id));
  assert.ok(fresh.some(r=>r.product.id===14));assert.ok(sweet.some(r=>r.product.id===2));
});

test('Collection choice is required and never falls back to perfumes from the other collection',()=>{
  const previousAnswers={occasion:'evening',presence:'bold',family:'discover'};
  assert.deepEqual(discovery.recommend(PRODUCTS,previousAnswers),[]);
  assert.deepEqual(discovery.recommend(PRODUCTS,{...previousAnswers,gender:'invalid'}),[]);
  for(const gender of ['m','f']){
    const answers={...previousAnswers,gender};
    assert.deepEqual(discovery.cleanAnswers({...answers,email:'ignore'}),answers);
    assert.deepEqual(discovery.recommend(PRODUCTS.filter(p=>p.gender!==gender),answers),[]);
    assert.equal(discovery.recommend(PRODUCTS,answers).length,3);
  }
});

test('Catalog return snapshots preserve compound filters, scroll and per-card volume and quantity; stale or malformed values are contained',()=>{
  const source={savedAt:Date.now(),query:'íris',scrollY:2345.5,gender:'f',state:{volume:'10',mode:'new',brand:'Dior',price:'100plus',sort:'price-desc',available:true,savedOnly:true},selections:[{id:6,volume:'5',quantity:3},{id:17,volume:'10',quantity:2}]};
  const result=discovery.cleanSnapshot(source,PRODUCTS);assert.deepEqual(result,source);
  assert.equal(discovery.cleanSnapshot({...source,savedAt:Date.now()-7200001},PRODUCTS),null);
  assert.equal(discovery.cleanSnapshot({...source,savedAt:Date.now()+120000},PRODUCTS),null);
  const bad=discovery.cleanSnapshot({...source,scrollY:-40,gender:'invalid',query:'x'.repeat(200),state:{volume:'50',brand:'missing',price:'invalid',sort:'invalid',available:'yes'},selections:[{id:6,volume:'5',quantity:100},{id:999,volume:'10',quantity:1},{id:1,volume:'50',quantity:1}]},PRODUCTS);
  assert.equal(bad.scrollY,0);assert.equal(bad.gender,'');assert.equal(bad.query.length,120);assert.equal(bad.state.volume,'5');assert.equal(bad.state.brand,'');assert.equal(bad.state.sort,'curated');assert.equal(bad.state.available,false);assert.deepEqual(bad.selections,[]);
});

test('Product sharing handles native success, cancellation, copy fallback and denied clipboard access without sending automatically',async()=>{
  const data={title:'Perfume',url:'https://sillocta.vercel.app/perfume/creed-aventus'};let copied=[],shared=[];
  assert.equal(await discovery.shareProduct(data,{share:async value=>shared.push(value),copy:async value=>copied.push(value)}),'shared');assert.deepEqual(shared,[data]);assert.deepEqual(copied,[]);
  assert.equal(await discovery.shareProduct(data,{share:async()=>{throw Object.assign(Error(),{name:'AbortError'});},copy:async value=>copied.push(value)}),'cancelled');assert.deepEqual(copied,[]);
  assert.equal(await discovery.shareProduct(data,{share:async()=>{throw Error('Unavailable');},copy:async value=>copied.push(value)}),'copied');assert.deepEqual(copied,[data.url]);
  assert.equal(await discovery.shareProduct(data,{copy:async()=>{throw Error('Denied');}}),'manual');assert.equal(await discovery.shareProduct(data,{}),'manual');
});

test('The built home and perfume pages load the same discovery behavior and accessible invitation',()=>{
  const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.ok(home.includes('id="fragrance-guide"'));assert.ok(home.includes('data-open-guide'));assert.ok(home.includes('/discovery.js?v=guide-v67'));
  for(const p of PRODUCTS){const route=[p.brand,p.name].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const page=readFileSync(new URL('../public/perfume/'+route+'.html',import.meta.url),'utf8');assert.ok(page.includes('/discovery.js?v=guide-v67'));}
  assert.ok(readFileSync(new URL('../public/discovery.js',import.meta.url)).length<readFileSync(new URL('../source/discovery.js',import.meta.url)).length*.8);
});
