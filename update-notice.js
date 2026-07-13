(()=>{
/* Load the defensive Rate Confirmation overlay after app.js.
   Keeping it separate makes the change easy to test and roll back. */
if(!document.querySelector('script[data-zap-ai-ratecon-safe]')){
  const s=document.createElement('script');
  s.src='ai-ratecon-safe.js?v=5';
  s.async=false;
  s.dataset.zapAiRateconSafe='1';
  document.head.appendChild(s);
}

/* When a new service worker version is deployed, show a small "New version available"
   banner with an Update button instead of making users hard-refresh. Only fires for
   real updates (there is already a controlling SW), never on the first install. */
if(!('serviceWorker'in navigator))return;

function showBanner(){
  if(document.getElementById('zapUpdateBanner'))return;
  const b=document.createElement('div');
  b.id='zapUpdateBanner';
  b.style.cssText='position:fixed;left:12px;right:12px;bottom:84px;z-index:100000;max-width:520px;margin:0 auto;background:linear-gradient(135deg,#0284c7,#22c55e);color:#04121d;font-weight:800;border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 14px 30px rgba(0,0,0,.35)';
  const span=document.createElement('span');span.textContent='New version available.';
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;align-items:center';
  const later=document.createElement('button');later.type='button';later.textContent='Later';
  later.style.cssText='background:transparent;color:#04121d;border:0;font-weight:800;cursor:pointer;padding:8px 6px';
  later.onclick=()=>b.remove();
  const btn=document.createElement('button');btn.type='button';btn.textContent='Update';
  btn.style.cssText='background:#04121d;color:#eaf6ff;border:0;border-radius:10px;padding:8px 16px;font-weight:800;cursor:pointer';
  btn.onclick=()=>{btn.textContent='Updating…';location.reload()};
  wrap.appendChild(later);wrap.appendChild(btn);
  b.appendChild(span);b.appendChild(wrap);
  document.body.appendChild(b);
}

navigator.serviceWorker.ready.then(reg=>{
  /* a new worker is downloading -> when it finishes installing, and a SW already
     controls this page (so it's an update, not the first install), offer to reload */
  reg.addEventListener('updatefound',()=>{
    const nw=reg.installing;
    if(!nw)return;
    nw.addEventListener('statechange',()=>{
      if(nw.state==='installed'&&navigator.serviceWorker.controller)showBanner();
    });
  });
  /* check for a new deploy periodically and on tab focus so long-open tabs notice */
  const check=()=>reg.update().catch(()=>{});
  setInterval(check,30*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
});
})();
