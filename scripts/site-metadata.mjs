export function deploymentMetadata(env={}){
  const domain=env.VERCEL_PROJECT_PRODUCTION_URL||env.VERCEL_URL;
  const configured=env.PUBLIC_SITE_URL||(domain?'https://'+domain:'');
  let origin='';
  if(configured){
    const url=new URL(configured);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_SITE_URL must be a bare HTTPS origin');
    origin=url.origin;
  }
  return {origin,preview:env.VERCEL_ENV==='preview'};
}
const xmlEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function seoFiles({origin,preview},routes){
  if(preview)return {robots:'User-agent: *\nDisallow: /\n',sitemap:null};
  return {
    robots:'User-agent: *\nAllow: /\nDisallow: /api/\n'+(origin?'Sitemap: '+origin+'/sitemap.xml\n':''),
    sitemap:origin?'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+['/',...routes].map(route=>'  <url><loc>'+xmlEscape(origin+route)+'</loc></url>').join('\n')+'\n</urlset>\n':null
  };
}

const jsonLD=value=>JSON.stringify(value).replace(/</g,'\\u003c');
export function pageMetadata({origin,preview},route,product){
 const title=product?`${product.name} · ${product.brand} | Sillocta`:'Sillocta | Maison de Decants';
 const description=product?`${product.name} de ${product.brand}, em decants de 5 e 10 ml. ${product.description}`:'Explore perfumes originais em decants de 5 e 10 ml. Descubra notas, compare fragrâncias e encontre sua seleção na Sillocta Maison de Decants.';
 let html=(origin?`<link rel="canonical" href="${xmlEscape(origin+route)}">`:'')+(preview?'<meta name="robots" content="noindex, nofollow">':'');
 const image=product?'/'+product.image:'/assets/campaign-aventus.webp';
 for(const [key,value] of Object.entries({'og:type':product?'product':'website','og:locale':'pt_BR','og:site_name':'Sillocta','og:title':title,'og:description':description,...(origin?{'og:url':origin+route,'og:image':origin+image}:{}),'og:image:alt':product?`${product.brand} ${product.name} — frasco original de referência`:'Sillocta Maison de Decants','twitter:card':'summary_large_image','twitter:title':title,'twitter:description':description,...(origin?{'twitter:image':origin+image}:{})}))html+=`<meta ${key.startsWith('og:')?'property':'name'}="${key}" content="${xmlEscape(value)}">`;
 if(!origin)return html;
 const site={'@type':'WebSite','@id':origin+'/#website',url:origin+'/',name:'Sillocta',inLanguage:'pt-BR'};
 const data=product?[site,{'@type':'ProductGroup','@id':origin+route+'#product',name:product.name+' · Decants',description:product.description,brand:{'@type':'Brand',name:product.brand},image:origin+image,url:origin+route,productGroupID:'SL-'+product.id,variesBy:'https://schema.org/size',hasVariant:['5','10'].map(volume=>({'@type':'Product',name:product.name+' · Decant '+volume+' ml',sku:'SL-'+product.id+'-'+volume,size:volume+' ml',image:origin+image,description:'Decant de '+volume+' ml de '+product.name+'. O frasco original é apresentado como referência.',offers:{'@type':'Offer',url:origin+route,priceCurrency:'BRL',price:(product.prices[volume]/100).toFixed(2),availability:'https://schema.org/'+(product.available?'InStock':'OutOfStock'),itemCondition:'https://schema.org/NewCondition'}}))},{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Coleção',item:origin+'/'},{'@type':'ListItem',position:2,name:product.name,item:origin+route}]}]:[site];
 return html+'<script type="application/ld+json">'+jsonLD({'@context':'https://schema.org','@graph':data})+'</script>';
}
