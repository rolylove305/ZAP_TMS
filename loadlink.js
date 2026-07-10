(()=>{
/* hotfix/driver-link-first-load: this script now loads before app.js, so
   nothing at the top level may reference sb/appData/currentUser (those are
   defined later by app.js) — only the click handler touches sb, and only
   once a click actually happens, by which time app.js has long since run.
   The capture-phase listener below is the very first statement executed so
   it's registered no matter what happens later in this file. */
document.addEventListener('click',function(e){
  const btn=e.target.closest('.load-link-btn');
  if(!btn)return;
  const card=btn.closest('.list-card');
  if(!card)return;
  driverLinkAction(card,e);
},true);
const get=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function loadFor(card,i){const a=get();const id=card?.dataset?.loadId;if(id){const x=a.find(v=>v.id===id);if(x)return x}return a[i]}
async function loc(card,i){const l=loadFor(card,i);if(!l||!l.id)return alert('Sync first.');const r=await sb.from('load_events').select('latitude,longitude,created_at,event_type').eq('load_id',l.id).not('latitude','is',null).not('longitude','is',null).order('created_at',{ascending:false}).limit(1);if(r.error)return alert(r.error.message);if(!r.data||!r.data.length)return alert('No location received yet.');const x=r.data[0];window.open('https://www.google.com/maps?q='+x.latitude+','+x.longitude,'_blank')}
const escAttr=s=>String(s??'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
function showDriverLinkModal(url){
  let m=document.getElementById('llDriverLinkModal');
  if(!m){m=document.createElement('div');m.id='llDriverLinkModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  m.innerHTML='<div class="card" style="width:min(480px,96vw)"><div class="section-title"><h2>Driver Link</h2><button class="small-btn" id="llClose">Close</button></div>'
    +'<input id="llUrl" readonly value="'+escAttr(url)+'" style="width:100%;margin:8px 0">'
    +'<div class="card-actions"><a class="small-btn" href="'+escAttr(url)+'" target="_blank" rel="noopener">Open Driver Portal</a></div>'
    +'<p class="muted">Link copied to clipboard. Send it to the driver.</p></div>';
  m.querySelector('#llClose').onclick=()=>m.remove();
  const inp=m.querySelector('#llUrl');inp.onclick=()=>inp.select();
}
function resolveLoadId(card){
  const fromDataset=card?.dataset?.loadId;
  if(fromDataset)return fromDataset;
  const cards=[...document.querySelectorAll('#loadsList .list-card')];
  const i=cards.indexOf(card);
  const l=get()[i];
  return l&&l.id?l.id:'';
}
function wait(ms){return new Promise(res=>setTimeout(res,ms))}
async function driverLinkAction(card,e){
  if(e){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}
  let loadId=resolveLoadId(card);
  if(!loadId){
    await wait(500);
    loadId=resolveLoadId(card);
  }
  if(!loadId)return alert('Sync first.');
  const r=await sb.rpc('create_driver_link',{p_load_id:loadId});
  if(r.error)return alert(r.error.message);
  const base=location.origin+location.pathname.replace(/index\.html$/,'').replace(/\/$/,'/');
  const url=base+'portal.html?t='+r.data;
  try{await navigator.clipboard.writeText(url)}catch{}
  showDriverLinkModal(url);
}
function add(){document.querySelectorAll('#loadsList .list-card').forEach((c,i)=>{if(!c.dataset.loadId&&get()[i]?.id)c.dataset.loadId=get()[i].id;if(c.querySelector('.load-link-btn'))return;let a=c.querySelector('.card-actions');if(!a){a=document.createElement('div');a.className='card-actions';c.appendChild(a)}let b=document.createElement('button');b.className='small-btn load-link-btn';b.textContent='Driver Link';b.dataset.loadlinkBound='1';b.onclick=e=>driverLinkAction(c,e);let p=document.createElement('button');p.className='small-btn load-loc-btn';p.textContent='Location';p.onclick=()=>loc(c,i);a.insertBefore(p,a.firstChild);a.insertBefore(b,a.firstChild)})}
function bindDriverLinkButtons(){
  document.querySelectorAll('#loadsList .list-card').forEach((c,i)=>{
    if(!c.dataset.loadId&&get()[i]?.id)c.dataset.loadId=get()[i].id;
    const btn=c.querySelector('.load-link-btn');
    if(!btn||btn.dataset.loadlinkBound==='1')return;
    btn.dataset.loadlinkBound='1';
    btn.addEventListener('click',e=>driverLinkAction(c,e));
  });
}
function addHelper(id,src){if(!document.getElementById(id)){const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}}
function helpers(){addHelper('phase2Helper','phase2.js?v=step5-archive-visible');addHelper('invoiceSelectHelper','invoice-select.js?v=release-invoices-safe-fix5');addHelper('savedInvoicesHelper','saved-invoices.js?v=release-invoices-safe-fix5')}
function runAll(){add();bindDriverLinkButtons()}
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
