(()=>{
const q=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const loads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function drivers(){const seen={},out=[];loads().forEach(l=>{const name=(l.driverName||'').trim(),phone=(l.driverPhone||'').trim();if(!name)return;const k=(name+'|'+phone).toLowerCase();if(seen[k])return;seen[k]=1;out.push({name,phone})});return out}
function locateUrl(token){const base=location.origin+location.pathname.replace(/index\.html$/,'').replace(/\/$/,'/');return base+'locate.html?t='+token}
function modal(url){
  let m=document.getElementById('zapLocateModal');
  if(!m){m=document.createElement('div');m.id='zapLocateModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  m.innerHTML='<div class="card" style="width:min(480px,96vw)"><div class="section-title"><h2>Location Request</h2><button type="button" class="small-btn" id="zlmClose">Close</button></div>'
    +'<input id="zlmUrl" readonly value="'+esc(url)+'" style="width:100%;margin:8px 0">'
    +'<p class="muted">Link copied to clipboard. Send it to the driver by text or WhatsApp; when they open it and tap the button, their location appears under View location.</p></div>';
  m.style.display='flex';
  m.querySelector('#zlmClose').onclick=()=>m.remove();
  const inp=m.querySelector('#zlmUrl');inp.onclick=()=>inp.select();
}
async function requestLoc(d){
  const r=await sb.rpc('locate_request',{p_driver_name:d.name,p_driver_phone:d.phone});
  if(r.error)return alert(r.error.message);
  const url=locateUrl(r.data);
  try{await navigator.clipboard.writeText(url)}catch{}
  modal(url);
}
async function viewLoc(d){
  const r=await sb.from('driver_locates').select('latitude,longitude,located_at').eq('driver_name',d.name).eq('driver_phone',d.phone).not('located_at','is',null).order('located_at',{ascending:false}).limit(1);
  if(r.error)return alert(r.error.message);
  if(!r.data||!r.data.length)return alert('No location received yet. Send the driver a location request first.');
  const x=r.data[0];
  window.open('https://www.google.com/maps?q='+x.latitude+','+x.longitude,'_blank');
}
function rows(listEl){
  const ds=drivers();
  listEl.dataset.count=ds.length;
  listEl.innerHTML=ds.map((d,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:6px 0"><span><b>${esc(d.name)}</b>${d.phone?' <span class="muted">'+esc(d.phone)+'</span>':''}</span><span style="display:flex;gap:6px"><button type="button" class="small-btn" data-locate-req="${i}">Request location</button><button type="button" class="small-btn" data-locate-view="${i}">View location</button></span></div>`).join('')||'<p class="muted">No drivers found yet. Drivers appear here after you add them to a load.</p>';
  listEl.querySelectorAll('[data-locate-req]').forEach(b=>b.onclick=()=>requestLoc(ds[+b.dataset.locateReq]));
  listEl.querySelectorAll('[data-locate-view]').forEach(b=>b.onclick=()=>viewLoc(ds[+b.dataset.locateView]));
}
async function panel(){
  if(!window.sb)return;
  const u=(await sb.auth.getSession()).data.session?.user;
  if(!u)return;
  if(q('#driverLocatePanel'))return;
  const host=q('#invitePanel')||q('#companySettingsCard')||q('#zapDash')||document.body;
  const div=document.createElement('section');
  div.id='driverLocatePanel';div.className='card';div.style.margin='0 0 14px';
  div.innerHTML='<div class="section-title"><h2>Drivers</h2><p class="muted">Request a location from any driver, even without an active load.</p></div><div id="driverLocateList" style="margin-top:10px"></div>';
  host.after(div);
  rows(q('#driverLocateList'));
}
setTimeout(panel,2200);
setInterval(()=>{const list=q('#driverLocateList');if(!list)return panel();if(String(drivers().length)!==list.dataset.count)rows(list)},5000);
})();
