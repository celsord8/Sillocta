/* Aggregate funnel events; collection requires an explicitly configured destination. */
(() => {
  'use strict';
  const allowed = () => typeof navigator !== 'undefined' && navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true;
  const cleanUrl = value => {
    try { const url = new URL(value, location.origin); return url.origin + url.pathname; }
    catch { return location.origin + location.pathname; }
  };
  const memory = new Set();
  const key = 'sillocta-funnel-dedup-v1';
  const configuredId = document.querySelector?.('meta[name="sillocta-ga4-id"]')?.getAttribute('content') || '';
  const gaId = /^G-[A-Z0-9]{4,20}$/.test(configuredId) ? configuredId : '';
  const vercelEvents = document.querySelector?.('meta[name="sillocta-vercel-events"]')?.getAttribute('content') === 'true';
  const seen = token => {
    if (memory.has(token)) return true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '[]');
      if (Array.isArray(saved) && saved.includes(token)) { memory.add(token); return true; }
    } catch {}
    return false;
  };
  const remember = token => {
    memory.add(token);
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || '[]');
      sessionStorage.setItem(key, JSON.stringify([...new Set([...(Array.isArray(saved) ? saved : []), token])].slice(-200)));
    } catch {}
  };
  function event(name, data, token) {
    if (!allowed() || (!gaId && !vercelEvents) || (token && seen(token))) return false;
    try {
      if (vercelEvents) {
        window.va = window.va || function() { (window.vaq = window.vaq || []).push(arguments); };
        window.va('event', {name, data});
      }
      if (gaId) {
        const product = data.product_id ? {items:[{item_id:String(data.product_id), ...(data.volume_ml?{item_variant:String(data.volume_ml)+' ml'}:{}), ...(data.quantity?{quantity:data.quantity}:{})}]} : {};
        window.gtag('event', name, {...data, ...product, send_to:gaId, page_location:cleanUrl(location.href), page_referrer:document.referrer?cleanUrl(document.referrer):'', page_title:document.title});
      }
      if (token) remember(token);
      return true;
    } catch { return false; } // Measurement must never interrupt shopping.
  }
  const positive = value => Number.isInteger(value) && value > 0;
  window.SilloctaMetrics = Object.freeze({
    viewProduct(product) {
      if (positive(product?.id)) event('view_item', {product_id: product.id}, 'view:' + product.id);
    },
    addItem(productId, volume, quantity) {
      if (positive(productId) && ['5', '10'].includes(String(volume)) && positive(quantity)) {
        event('add_to_cart', {product_id: productId, volume_ml: Number(volume), quantity});
      }
    },
    checkout(items) {
      if (!Array.isArray(items) || !items.length) return;
      const safe = items.filter(item => positive(item.pid) && positive(item.qty) && ['5ML', '10ML'].includes(item.vol));
      if (!safe.length || safe.length !== items.length) return;
      const signature = safe.map(item => item.pid + ':' + item.vol + ':' + item.qty).sort().join('|');
      const data = {item_count: safe.reduce((count, item) => count + item.qty, 0)};
      event('view_cart', data, 'cart:' + signature);
      // This store opens its checkout form together with the bag.
      event('begin_checkout', data, 'checkout:' + signature);
    },
    paymentResult(result) {
      if (!result || typeof result.orderId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(result.orderId)
        || !['pix', 'cartao', 'boleto'].includes(result.method) || !positive(result.totalCents)
        || typeof result.sandbox !== 'boolean' || !['pending', 'approved'].includes(result.state)) return;
      const prefix = result.sandbox ? 'test_' : '';
      const data = {payment_method: result.method, total_cents: result.totalCents, currency: 'BRL'};
      // Order IDs and authenticated receipts stay local and never enter analytics.
      event(prefix + 'payment_created', data, prefix + 'created:' + result.orderId);
      if (result.state === 'approved') event(prefix + 'payment_approved', data, prefix + 'approved:' + result.orderId);
    }
  });
  if (!allowed()) return;
  if (gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied'});
    window.gtag('js', new Date());
    window.gtag('config', gaId, {send_page_view:false, allow_google_signals:false, allow_ad_personalization_signals:false, page_location:cleanUrl(location.href), page_referrer:document.referrer?cleanUrl(document.referrer):'', page_title:document.title});
  }
  window.va = window.va || function() { (window.vaq = window.vaq || []).push(arguments); };
  try { window.va('beforeSend', data => allowed() ? {...data, url: cleanUrl(data.url)} : null); } catch {}
  window.si = window.si || function() { (window.siq = window.siq || []).push(arguments); };
  try { window.si('beforeSend', data => allowed() ? {...data, url: cleanUrl(data.url)} : null); } catch {}
  const load = () => {
    if (!allowed()) return;
    const scripts = [['sl-analytics', '/_vercel/insights/script.js'], ['sl-speed-insights', '/_vercel/speed-insights/script.js']];
    if (gaId) scripts.push(['sl-ga4', 'https://www.googletagmanager.com/gtag/js?id='+gaId]);
    for (const [id, src] of scripts) {
      if (document.getElementById(id)) continue;
      const script = document.createElement('script'); script.id = id; script.defer = true; script.src = src;
      document.head.appendChild(script);
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, {timeout:3500});
  else window.setTimeout(load, 1800);
})();
