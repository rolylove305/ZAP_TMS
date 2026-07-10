(()=>{
const q=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const loads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
const key=d=>(d.name+'|'+d.phone).toLowerCase();
function loadDrivers(){const seen={},out=[];loads().forEach(l=>{const name=(l.driverName||'').trim(),phone=(l.driverPhone||'').trim();if(!name)return;const k=(name+'|'+phone).toLowerCase();if(seen[k])return;seen[k]=1;out.push({name,phone})});return out}
/* The roster lives in driver_locates: one row per driver keeps them in the dropdown even
   after their loads are deleted; a driver whose rows are ALL active=false was removed by
   the dispatcher and stays hidden (their locate links stop working too). */
async function roster(userId){
  const r=await sb.from('driver_locates').select('driver_name,driver_phone,active');
  if(r.error)return{list:loadDrivers(),error:r.error.message};
  const cloud={};(r.data||[]).forEach(x=>{const k=(String(x.driver_name||'').trim()+'|'+String(x.driver_phone||'').trim()).toLowerCase();if(!cloud[k])cloud[k]={name:String(x.driver_name||'').trim(),phone:String(x.driver_phone||'').trim(),anyActive:false,exists:true};if(x.active)cloud[k].anyActive=true});
  const fromLoads=loadDrivers();
  const missing=fromLoads.filter(d=>d.name&&!cloud[key(d)]);
  if(missing.length&&userId){
    const ins=await sb.from('driver_locates').insert(missing.map(d=>({user_id:userId,driver_name:d.name,driver_phone:d.phone})));
    if(!ins.error)missing.forEach(d=>{cloud[key(d)]={name:d.name,phone:d.phone,anyActive:true,exists:true}});
  }
  fromLoads.forEach(d=>{if(!cloud[key(d)])cloud[key(d)]={name:d.name,phone:d.phone,anyActive:true,exists:false}});
  return{list:Object.values(cloud).filter(d=>d.name&&d.anyActive).sort((a,b)=>a.name.localeCompare(b.name))};
}
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
async function removeDriver(d,userId,listEl){
  if(!confirm('Remove '+d.name+' from the drivers list? Their location links will stop working. Loads keep their name. You can add them back by asking Zap support or re-inviting via a new locate row.'))return;
  const r=await sb.from('driver_locates').update({active:false}).eq('driver_name',d.name).eq('driver_phone',d.phone);
  if(r.error)return alert(r.error.message);
  rows(listEl,userId);
}
async function rows(listEl,userId){
  const res=await roster(userId);
  if(res.error){listEl.innerHTML='<p class="muted">'+esc(res.error)+'</p>';return}
  const ds=res.list;
  listEl.dataset.count=String(loadDrivers().length);
  if(!ds.length){listEl.innerHTML='<p class="muted">No drivers yet. Add a driver name and cell when you create a load and they appear here.</p>';return}
  const prev=listEl.querySelector('#driverLocateSelect')?.value;
  listEl.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    +'<select id="driverLocateSelect" style="flex:1;min-width:200px">'+ds.map((d,i)=>`<option value="${i}">${esc(d.name)}${d.phone?' ('+esc(d.phone)+')':''}</option>`).join('')+'</select>'
    +'<button type="button" class="small-btn" id="driverLocateReq">Request location</button>'
    +'<button type="button" class="small-btn" id="driverLocateView">View location</button>'
    +'<button type="button" class="small-btn" id="driverLocateDel" style="border-color:rgba(251,113,133,.4);color:#fda4af">Remove driver</button>'
    +'</div>';
  const sel=listEl.querySelector('#driverLocateSelect');
  if(prev&&+prev<ds.length)sel.value=prev;
  listEl.querySelector('#driverLocateReq').onclick=()=>requestLoc(ds[+sel.value]);
  listEl.querySelector('#driverLocateView').onclick=()=>viewLoc(ds[+sel.value]);
  listEl.querySelector('#driverLocateDel').onclick=()=>removeDriver(ds[+sel.value],userId,listEl);
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
  window.__zapLocateUser=u.id;
  rows(q('#driverLocateList'),u.id);
}
setTimeout(panel,2200);
setInterval(()=>{const list=q('#driverLocateList');if(!list)return panel();if(String(loadDrivers().length)!==list.dataset.count)rows(list,window.__zapLocateUser)},5000);
})();
