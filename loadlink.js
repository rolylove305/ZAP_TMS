(()=>{
/* hotfix/driver-link-first-load: Driver Link is now handled entirely
   natively in app.js (buildLoadCard + onLoadBoardClick + actionDriverLink).
   This file no longer creates a .load-link-btn or binds any click handler
   to it — the capture-phase listener that used to intercept those clicks
   here was preventing app.js's own delegated handler from ever firing
   (onLoadBoardClick defers to any button that already owns a click
   handler), which is what actually caused Driver Link to be unreliable.
   Only Location (.load-loc-btn) creation remains here. */
const get=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function loadFor(card,i){const a=get();const id=card?.dataset?.loadId;if(id){const x=a.find(v=>v.id===id);if(x)return x}return a[i]}
async function loc(card,i){const l=loadFor(card,i);if(!l||!l.id)return alert('Sync first.');const r=await sb.from('load_events').select('latitude,longitude,created_at,event_type').eq('load_id',l.id).not('latitude','is',null).not('longitude','is',null).order('created_at',{ascending:false}).limit(1);if(r.error)return alert(r.error.message);if(!r.data||!r.data.length)return alert('No location received yet.');const x=r.data[0];window.open('https://www.google.com/maps?q='+x.latitude+','+x.longitude,'_blank')}
function add(){document.querySelectorAll('#loadsList .list-card').forEach((c,i)=>{if(!c.dataset.loadId&&get()[i]?.id)c.dataset.loadId=get()[i].id;if(c.querySelector('.load-loc-btn'))return;let a=c.querySelector('.card-actions');if(!a){a=document.createElement('div');a.className='card-actions';c.appendChild(a)}let p=document.createElement('button');p.className='small-btn load-loc-btn';p.textContent='Location';p.onclick=()=>loc(c,i);a.insertBefore(p,a.firstChild)})}
function addHelper(id,src){if(!document.getElementById(id)){const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}}
function helpers(){addHelper('phase2Helper','phase2.js?v=step5-archive-visible');addHelper('invoiceSelectHelper','invoice-select.js?v=zap-logo-1');addHelper('savedInvoicesHelper','saved-invoices.js?v=zap-logo-1')}
function runAll(){add()}
[800,2000,4000,7000].forEach(t=>setTimeout(runAll,t));
setTimeout(helpers,1000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',runAll);
else runAll();
if(document.readyState==='complete')runAll();
else window.addEventListener('load',runAll);
function observeLoadsList(){
  const list=document.getElementById('loadsList');
  if(!list){setTimeout(observeLoadsList,500);return}
  new MutationObserver(runAll).observe(list,{childList:true,subtree:true});
  runAll();
}
observeLoadsList();
document.addEventListener('click',e=>{if(e.target.closest('[data-screen="loads"]'))[50,300,1000,2000].forEach(t=>setTimeout(runAll,t))});
setInterval(()=>{if(document.querySelector('#loads.screen.active'))runAll()},1500);
})();
