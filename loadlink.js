(()=>{
const get=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function loadFor(card,i){const a=get();const id=card?.dataset?.loadId;if(id){const x=a.find(v=>v.id===id);if(x)return x}return a[i]}
async function go(card,i){const l=loadFor(card,i);if(!l||!l.id)return alert('Sync first.');const r=await sb.rpc('create_driver_link',{p_load_id:l.id});if(r.error)return alert(r.error.message);const base=location.origin+location.pathname.replace(/index\.html$/,'').replace(/\/$/,'/');const url=base+'portal.html?t='+r.data;try{await navigator.clipboard.writeText(url);alert('Copied:\n'+url)}catch{prompt('Copy:',url)}}
async function loc(card,i){const l=loadFor(card,i);if(!l||!l.id)return alert('Sync first.');const r=await sb.from('load_events').select('latitude,longitude,created_at,event_type').eq('load_id',l.id).not('latitude','is',null).not('longitude','is',null).order('created_at',{ascending:false}).limit(1);if(r.error)return alert(r.error.message);if(!r.data||!r.data.length)return alert('No location received yet.');const x=r.data[0];window.open('https://www.google.com/maps?q='+x.latitude+','+x.longitude,'_blank')}
function add(){document.querySelectorAll('#loadsList .list-card').forEach((c,i)=>{if(!c.dataset.loadId&&get()[i]?.id)c.dataset.loadId=get()[i].id;if(c.querySelector('.load-link-btn'))return;let a=c.querySelector('.card-actions');if(!a){a=document.createElement('div');a.className='card-actions';c.appendChild(a)}let b=document.createElement('button');b.className='small-btn load-link-btn';b.textContent='Driver Link';b.onclick=()=>go(c,i);let p=document.createElement('button');p.className='small-btn load-loc-btn';p.textContent='Location';p.onclick=()=>loc(c,i);a.insertBefore(p,a.firstChild);a.insertBefore(b,a.firstChild)})}
function addHelper(id,src){if(!document.getElementById(id)){const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}}
function helpers(){addHelper('phase2Helper','phase2.js?v=step5-archive-visible');addHelper('invoiceSelectHelper','invoice-select.js?v=release-invoices-safe-fix3');addHelper('savedInvoicesHelper','saved-invoices.js?v=release-invoices-safe-fix3')}
[800,2000,4000,7000].forEach(t=>setTimeout(add,t));
setTimeout(helpers,1000);
function observeLoadsList(){
  const list=document.getElementById('loadsList');
  if(!list){setTimeout(observeLoadsList,500);return}
  new MutationObserver(add).observe(list,{childList:true});
  add();
}
observeLoadsList();
document.addEventListener('click',e=>{if(e.target.closest('[data-screen="loads"]'))setTimeout(add,50)});
})();