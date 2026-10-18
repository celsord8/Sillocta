export function measurementMetadata(env={}) {
  const id=String(env.PUBLIC_GA4_MEASUREMENT_ID||'').trim();
  if(id&&!/^G-[A-Z0-9]{4,20}$/.test(id))throw Error('PUBLIC_GA4_MEASUREMENT_ID must be a public G- identifier.');
  // Review traffic must never contaminate the production funnel.
  if(env.VERCEL_ENV!=='production')return '';
  return (id?'<meta name="sillocta-ga4-id" content="'+id+'">':'')+
    (env.PUBLIC_VERCEL_CUSTOM_EVENTS==='true'?'<meta name="sillocta-vercel-events" content="true">':'');
}
