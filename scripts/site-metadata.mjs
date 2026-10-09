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
