import postcss from 'postcss';

// Remove repeated declarations only when the selector, enclosing conditions,
// property, value and priority are identical. Different values, browser fallbacks,
// shorthand interactions and the relative order of rules remain intact.
export function consolidateStyles(css){
 const root=postcss.parse(css),seen=new Set();let removed=0;
 const rules=[];root.walkRules(rule=>rules.push(rule));
 for(const rule of rules.reverse()){
  let context='',parent=rule.parent,skip=false;
  while(parent&&parent.type!=='root'){
   if(parent.type!=='atrule'||/keyframes$/i.test(parent.name)){skip=true;break;}
   context='@'+parent.name+' '+parent.params+'|'+context;parent=parent.parent;
  }
  if(skip)continue;
  // An intervening declaration of the same property invalidates a previous
  // duplicate candidate, including differences in !important and fallbacks.
  for(const node of [...rule.nodes].reverse()){
   if(node.type!=='decl')continue;
   const base=context+'|'+rule.selector+'|'+node.prop;
   const exact=base+'|'+node.value+'|'+!!node.important;
   if(seen.has(exact)){node.remove();removed++;}
   else {for(const key of seen)if(key.startsWith(base+'|'))seen.delete(key);seen.add(exact);}
  }
  if(!rule.nodes.some(n=>n.type==='decl'||n.type==='atrule'))rule.remove();
 }
 return {css:root.toString(),removed};
}

// Formatting only: preserve selectors and declaration values while reducing transfer size.
export function compactStyles(css){
 const root=postcss.parse(css);root.walkComments(node=>node.remove());
 root.walk(node=>{node.raws.before='';if(node.type==='decl')node.raws.between=':';else{node.raws.between='';node.raws.after='';}});
 root.raws.after='';return root.toString();
}
