(()=>{
/* Load the defensive Rate Confirmation overlay after app.js.
   Keeping it separate makes the change easy to test and roll back. */
if(!document.querySelector('script[data-zap-ai-ratecon-safe]')){
  const s=document.createElement('script');
  s.src='ai-ratecon-safe.js?v=6';
  s.async=false;
  s.dataset.zapAiRateconSafe='1';
  document.head.appendChild(s);
}

/* Driver availability enhancer. It uses the HOS duty status plus the latest
   activity timestamp to translate raw clocks into a dispatcher-friendly
   Ready now / Ready at result. Split-sleeper cases remain manual review. */
function loadHosReady(){
  if(window.ZapHosReady)return Promise.resolve(window.ZapHosReady);
  if(window.__zapHosReadyPromise)return window.__zapHosReadyPromise;
  window.__zapHosReadyPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-zap-hos-ready]');
    if(existing){existing.addEventListener('load',()=>resolve(window.ZapHosReady));existing.addEventListener('error',reject);return}
    const s=document.createElement('script');
    s.src='hos-ready.js?v=ready-at-2';
    s.async=false;
    s.dataset.zapHosReady='1';
    s.onload=()=>resolve(window.ZapHosReady);
    s.onerror=reject;
    document.head.appendChild(s);
  });
  return window.__zapHosReadyPromise;
}

function readyTone(state){
  if(state==='ready_now')return 'good';
  if(state==='ready_at')return 'warning';
  if(state==='manual_review')return 'critical';
  return 'neutral';
}

function selectedHosDriver(){
  const drivers=window.eldHostData?.getDrivers?.()||[];
  const select=document.getElementById('eldHosDriver');
  if(!drivers.length)return null;
  const index=Number((select?.value?.split('|').pop()||'0'));
  return drivers[index]||drivers[0]||null;
}

function normalizeDuty(value){
  return String(value||'').toUpperCase().replace(/[\s_-]+/g,'');
}

function dutyIcon(value){
  const duty=normalizeDuty(value);
  if(['D','DRIVING'].includes(duty))return '🚛';
  if(['ON','ONDUTY','YM','YARDMOVE'].includes(duty))return '🟡';
  if(['SB','SLEEPER','SLEEPERBERTH'].includes(duty))return '🛏️';
  if(['OFF','OFFDUTY'].includes(duty))return '🌙';
  return '⚪';
}

function updateCurrentStatusIcon(){
  const driver=selectedHosDriver();
  const icon=document.querySelector('#eldHosClocks .hos-tomorrow-icon');
  if(driver&&icon)icon.textContent=dutyIcon(driver.duty_status);
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function renderSelectedReadyAt(){
  if(!window.ZapHosReady)return;
  const summary=document.getElementById('eldHosSummary');
  const driver=selectedHosDriver();
  if(!summary||!driver)return;
  const result=window.ZapHosReady.formatReadyAt(driver);
  let box=document.getElementById('eldReadyAtBox');
  if(!box){
    box=document.createElement('div');
    box.id='eldReadyAtBox';
    summary.appendChild(box);
  }
  const icon=dutyIcon(driver.duty_status);
  const signature=[result.state,result.status_text,result.secondary_text,result.earliest_ready_at||'',driver.duty_status||''].join('|');
  if(box.dataset.signature===signature)return;
  box.dataset.signature=signature;
  box.className=`hos-alert hos-alert--${readyTone(result.state)}`;
  const compact=result.state==='not_resetting';
  box.style.cssText=compact
    ?'margin-top:8px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-secondary)'
    :'margin-top:12px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-secondary)';
  if(compact){
    box.innerHTML=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span aria-hidden="true">${icon}</span><strong>${escapeHtml(result.status_text)}</strong><span class="muted">${escapeHtml(result.secondary_text)}</span></div>`;
  }else{
    box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><span class="muted" style="display:block;font-size:12px">Driver availability</span><strong style="display:block;font-size:18px;margin-top:2px">${icon} ${escapeHtml(result.status_text)}</strong><span class="muted" style="display:block;margin-top:4px">${escapeHtml(result.secondary_text)}</span></div>${result.earliest_ready_at?`<span class="pill">${escapeHtml(new Date(result.earliest_ready_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</span>`:''}</div>`;
  }
}

function renderDashboardReadyAt(){
  if(!window.ZapHosReady)return;
  const list=document.getElementById('eldStatus');
  const drivers=window.eldHostData?.getDrivers?.()||[];
  if(!list||!drivers.length)return;
  const cards=[...list.querySelectorAll('.card')];
  cards.forEach((card,index)=>{
    const driver=drivers[index];
    if(!driver)return;
    const result=window.ZapHosReady.formatReadyAt(driver);
    const row=card.querySelector('div[style*="display:flex"]');
    if(!row)return;
    let pill=card.querySelector('[data-ready-at-pill]');
    if(!pill){
      pill=document.createElement('span');
      pill.className='pill';
      pill.dataset.readyAtPill='1';
      row.appendChild(pill);
    }
    const signature=[result.status_text,result.secondary_text].join('|');
    if(pill.dataset.signature===signature)return;
    pill.dataset.signature=signature;
    pill.textContent=result.status_text;
    pill.title=result.secondary_text;
  });
}

let refreshTimer=null;
function scheduleReadyAtRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{
    renderSelectedReadyAt();
    renderDashboardReadyAt();
    updateCurrentStatusIcon();
  },40);
}

loadHosReady().then(()=>{
  scheduleReadyAtRefresh();
  document.addEventListener('change',event=>{if(event.target?.id==='eldHosDriver')scheduleReadyAtRefresh()});
  const observer=new MutationObserver(records=>{
    const relevant=records.some(record=>{
      const target=record.target;
      return target instanceof Element&&(
        target.id==='eldHosSummary'||target.id==='eldStatus'||target.id==='eldHosClocks'||
        target.closest?.('#eldHosSummary, #eldStatus, #eldHosClocks')
      );
    });
    if(relevant)scheduleReadyAtRefresh();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  setInterval(scheduleReadyAtRefresh,60*1000);
}).catch(error=>console.warn('hos-ready-loader',error));

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
  reg.addEventListener('updatefound',()=>{
    const nw=reg.installing;
    if(!nw)return;
    nw.addEventListener('statechange',()=>{
      if(nw.state==='installed'&&navigator.serviceWorker.controller)showBanner();
    });
  });
  const check=()=>reg.update().catch(()=>{});
  setInterval(check,30*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
});
})();
