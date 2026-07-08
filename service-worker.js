const CACHE_NAME="zap-dispatch-tms-v8-step2c";
const FILES=["styles.css","config.js","manifest.json","zap-icon.svg","zap-logo.svg"];
const STYLE='<style>.zap-logo-login{display:block;width:min(280px,80vw);height:auto;margin:0 auto 16px;border-radius:18px;box-shadow:0 12px 28px rgba(0,0,0,.35)}.zap-logo-head{display:block;width:220px;max-width:62vw;height:auto;margin:0 0 12px;border-radius:14px;box-shadow:0 10px 24px rgba(0,0,0,.28)}@media(max-width:640px){.zap-logo-login{width:min(245px,82vw)}.zap-logo-head{width:185px}}</style>';

self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(FILES)));
});

self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});

function decorateHtml(html){
  html=html.replace("<head>","<head><link rel=\"apple-touch-icon\" href=\"zap-icon.svg\"><link rel=\"icon\" href=\"zap-icon.svg\">"+STYLE);
  html=html.replace('<div class="auth-card">','<div class="auth-card"><img class="zap-logo-login" src="zap-logo.svg" alt="Zap Dispatch">');
  html=html.replace('<header class="topbar">\n    <div>','<header class="topbar">\n    <div><img class="zap-logo-head" src="zap-logo.svg" alt="Zap Dispatch">');
  return html.replaceAll("Mini TMS Login","Zap Dispatch TMS Login").replaceAll("Mini TMS","Zap Dispatch TMS");
}

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  const isNavigate=e.request.mode==="navigate"||url.pathname.endsWith("/index.html")||url.pathname==="/";
  const isScript=url.pathname.endsWith(".js");

  if(isNavigate){
    e.respondWith(fetch(e.request,{cache:"no-store"}).then(async r=>{
      const html=decorateHtml(await r.clone().text());
      const out=new Response(html,{headers:{"content-type":"text/html;charset=UTF-8","cache-control":"no-store"}});
      return out;
    }).catch(()=>caches.match("index.html")));
    return;
  }

  if(isScript){
    e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
    return;
  }

  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{
    const copy=r.clone();
    caches.open(CACHE_NAME).then(c=>c.put(e.request,copy));
    return r;
  })));
});
