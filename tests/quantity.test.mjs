import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('Catalog quantity limits disable the unavailable action and preserve keyboard focus',()=>{
  const source=readFileSync(new URL('../source/enhancements.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('function syncCatalogQuantity('),source.indexOf('function setVol('));
  const document={activeElement:null};
  const output={textContent:'1',classList:{add(){},remove(){}}};
  const card={querySelector(selector){return selector==='.qty-val'?output:selector==='[onclick="changeQty(this,-1)"]'?minus:selector==='[onclick="changeQty(this,1)"]'?plus:null;}};
  const control=()=>({disabled:false,closest:()=>card,focus(){document.activeElement=this;}});
  const minus=control(),plus=control();
  const context=vm.createContext({document,requestAnimationFrame:f=>f()});
  vm.runInContext(code,context);
  context.syncCatalogQuantity(card);assert.equal(minus.disabled,true);assert.equal(plus.disabled,false);
  context.changeQty(minus,-1);assert.equal(Number(output.textContent),1);
  document.activeElement=plus;
  for(let i=0;i<110;i++)context.changeQty(plus,1);
  assert.equal(Number(output.textContent),99);assert.equal(plus.disabled,true);assert.equal(document.activeElement,minus);
  context.changeQty(minus,100);assert.equal(Number(output.textContent),99);
  document.activeElement=minus;
  for(let i=0;i<110;i++)context.changeQty(minus,-1);
  assert.equal(Number(output.textContent),1);assert.equal(minus.disabled,true);assert.equal(document.activeElement,plus);
});

