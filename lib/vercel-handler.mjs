import {handle} from './checkout.mjs';
export const route=action=>async(req,res)=>{
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):v);
  const origin='https://'+req.headers.host;
  const request=new Request(origin+'/api/checkout/'+action,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:typeof req.body==='string'?req.body:JSON.stringify(req.body||{})}:{})});
  const result=await handle(request,process.env);res.statusCode=result.status;result.headers.forEach((v,k)=>res.setHeader(k,v));res.end(await result.text());
};
