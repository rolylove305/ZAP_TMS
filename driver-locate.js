(()=>{
const q=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const loads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
const normPhone=p=>String(p||'').replace(/\D/g,'');
/* Match by phone digits when a phone is present — the same real driver often ends up
   saved under slightly different name spellings ("Francis" vs "FRANCIS HEREDIA") across
   loads or ELD syncs; matching by exact name+phone treated those as different people,
   so removing one spelling left the other still active and the driver kept reappearing. */
const key=d=>{const p=normPhone(d.phone);return p||String(d.name||'').trim().toLowerCase()};
function loadDrivers(){const seen={},out=[];loads().forEach(l=>{const name=(l.driverName||'').trim(),phone=(l.driverPhone||'').trim();if(!name)return;const k=key({name,phone});if(seen[k])return;seen[k]=1;out.push({name,phone})});return out}
function fleetDrivers(){return (window.appData?.fleet_people||[]).filter(p=>p&&p.active!==false).map(p=>({name:p.name,phone:p.phone||'',truckNumber:p.truckNumber||'',trailerNumber:p.trailerNumber||'',equipment:p.equipment||'',fleetPersonId:p.id||'',personType:p.personType||'company_driver'})).filter(p=>p.name)}
function mergeDriver(into,d){Object.keys(d).forEach(k=>{if(into[k]===undefined||into[k]===''||into[k]===null)into[k]=d[k]});return into}
function addToCloud(cloud,d){
  const name=String(d.name||'').trim(),phone=String(d.phone||'').trim();
  if(!name)return;
  const k=key({name,phone});
  if(!cloud[k])cloud[k]={name,phone,anyActive:true,exists:false,ids:[]};
  mergeDriver(cloud[k],{...d,name,phone});
}
/* The roster lives in driver_locates: one row per driver keeps them in the dropdown even
   after their loads are deleted; a driver whose rows are ALL active=false was removed by
   the dispatcher and stays hidden (their locate links stop working too). Every underlying
   row id that merges into one roster entry is tracked in `ids`, so Remove can deactivate
   all of them at once regardless of name-spelling differences. */
async function roster(userId){
  const r=await sb.from('driver_locates').select('id,driver_name,driver_phone,active');
  if(r.error)return{list:loadDrivers(),error:r.error.message};
  const cloud={};(r.data||[]).forEach(x=>{const name=String(x.driver_name||'').trim(),phone=String(x.driver_phone||'').trim();const k=key({name,phone});if(!cloud[k])cloud[k]={name,phone,anyActive:false,exists:true,ids:[]};cloud[k].ids.push(x.id);if(x.active)cloud[k].anyActive=true});
  const fromLoads=loadDrivers(),fromFleet=fleetDrivers();
  fromFleet.forEach(d=>addToCloud(cloud,d));
  const missing=fromLoads.filter(d=>d.name&&!cloud[key(d)]);
  if(missing.length&&userId){
    const ins=await sb.from('driver_locates').insert(missing.map(d=>({user_id:userId,driver_name:d.name,driver_phone:d.phone}))).select('id,driver_name,driver_phone');
    if(!ins.error)(ins.data||[]).forEach(x=>{const name=String(x.driver_name||'').trim(),phone=String(x.driver_phone||'').trim();const k=key({name,phone});cloud[k]={name,phone,anyActive:true,exists:true,ids:[x.id]}});
  }
  fromLoads.forEach(d=>{if(!cloud[key(d)])cloud[key(d)]={name:d.name,phone:d.phone,anyActive:true,exists:false,ids:[]}});
  return{list:Object.values(cloud).filter(d=>d.name&&d.anyActive).sort((a,b)=>a.name.localeCompare(b.name))};
}
function locateUrl(token){const base=location.origin+location.pathname.replace(/index\.html$/,'').replace(/\/$/,'/');return base+'locate.html?t='+token}
function telDigits(p){let d=String(p||'').replace(/\D/g,'');if(d.length===10)d='1'+d;return d}
function sendButtons(phone,text){
  if(!phone)return '';
  const d=telDigits(phone),body=encodeURIComponent(text);
  return '<div class="card-actions">'
    +'<a class="small-btn zlm-send" href="sms:+'+d+'?&body='+body+'">Text (SMS)</a>'
    +'<a class="small-btn zlm-send" href="https://wa.me/'+d+'?text='+body+'" target="_blank" rel="noopener">WhatsApp</a>'
    +'</div>';
}
function modal(url,d){
  let m=document.getElementById('zapLocateModal');
  if(!m){m=document.createElement('div');m.id='zapLocateModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  const name=d&&d.name?String(d.name).trim():'',phone=d&&d.phone;
  const text=(name?name+', ':'')+'please tap this link to share your current location with Zap Dispatch: '+url;
  m.innerHTML='<div class="card" style="width:min(480px,96vw)"><div class="section-title"><h2>Location Request</h2><button type="button" class="small-btn" id="zlmClose">Close</button></div>'
    +'<input id="zlmUrl" readonly value="'+esc(url)+'" style="width:100%;margin:8px 0">'
    +sendButtons(phone,text)
    +'<p class="muted">Send this link to the driver by text or WhatsApp; when they open it and tap the button, their location appears under View location.</p></div>';
  m.style.display='flex';
  m.querySelector('#zlmClose').onclick=()=>m.remove();
  const inp=m.querySelector('#zlmUrl');inp.onclick=()=>inp.select();
  m.querySelectorAll('.zlm-send').forEach(b=>b.addEventListener('click',()=>{try{navigator.clipboard.writeText(text)}catch(e){}}));
}
async function requestLoc(d){
  const r=await sb.rpc('locate_request',{p_driver_name:d.name,p_driver_phone:d.phone});
  if(r.error)return alert(r.error.message);
  const url=locateUrl(r.data);
  try{await navigator.clipboard.writeText(url)}catch{}
  modal(url,d);
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
  const ids=d.ids&&d.ids.length?d.ids:null;
  const r=ids
    ?await sb.from('driver_locates').update({active:false}).in('id',ids)
    :await sb.from('driver_locates').update({active:false}).eq('driver_name',d.name).eq('driver_phone',d.phone); /* fallback for load-only entries with no row yet */
  if(r.error)return alert(r.error.message);
  rows(listEl,userId);
}
async function ensureLocate(d,userId){
  if(!d.name||!userId)return;
  /* Match the same way the roster does (phone digits, name as fallback) — an exact
     string match on driver_phone would miss the same person saved with a differently
     formatted phone number and create a duplicate driver_locates row. */
  const targetKey=key(d);
  const all=await sb.from('driver_locates').select('id,driver_name,driver_phone');
  if(all.error)return;
  const match=(all.data||[]).find(x=>key({name:x.driver_name,phone:x.driver_phone})===targetKey);
  if(match)return sb.from('driver_locates').update({active:true}).eq('id',match.id);
  return sb.from('driver_locates').insert({user_id:userId,driver_name:d.name,driver_phone:d.phone||''});
}
function editModal(d,userId,listEl){
  d=d||{};
  let m=document.getElementById('zapDriverEditModal');
  if(!m){m=document.createElement('div');m.id='zapDriverEditModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  m.innerHTML='<div class="card" style="width:min(620px,96vw)"><div class="section-title"><h2>'+(d.name?'Edit driver':'Add driver')+'</h2><button type="button" class="small-btn" id="zdeClose">Close</button></div>'
    +'<div class="form-grid">'
    +'<label>Name<input id="zdeName" value="'+esc(d.name||'')+'" placeholder="Full name"></label>'
    +'<label>Cell<input id="zdePhone" type="tel" value="'+esc(d.phone||'')+'" placeholder="(555) 555-5555"></label>'
    +'<label>Type<select id="zdePersonType"><option value="company_driver">Company Driver</option><option value="owner_operator">Owner Operator</option></select></label>'
    +'<label>Truck #<input id="zdeTruck" value="'+esc(d.truckNumber||'')+'" placeholder="Truck #"></label>'
    +'<label>Trailer #<input id="zdeTrailer" value="'+esc(d.trailerNumber||'')+'" placeholder="Trailer #"></label>'
    +'<label>Equipment<select id="zdeEquipment"><option>Reefer</option><option>Dry Van</option><option>Flatbed</option><option>Step Deck</option><option>Hotshot</option></select></label>'
    +'</div><div class="card-actions" style="margin-top:12px"><button type="button" class="primary-btn" id="zdeSave">Save driver</button></div></div>';
  m.style.display='flex';
  const equipment=m.querySelector('#zdeEquipment');if(d.equipment&&[...equipment.options].some(o=>o.value===d.equipment))equipment.value=d.equipment;
  const personType=m.querySelector('#zdePersonType');if(d.personType)personType.value=d.personType;
  m.querySelector('#zdeClose').onclick=()=>m.remove();
  m.querySelector('#zdeSave').onclick=async()=>{
    /* payType/payRate are deliberately left out — this quick modal only touches
       identity/truck/trailer fields, so an existing driver's pay terms (set in My
       Fleet) survive untouched; a brand-new driver gets the same safe defaults
       insertRow already applies (per_mile / $0) until pay is set properly later. */
    const row={name:m.querySelector('#zdeName').value.trim(),phone:m.querySelector('#zdePhone').value.trim(),truckNumber:m.querySelector('#zdeTruck').value.trim(),trailerNumber:m.querySelector('#zdeTrailer').value.trim(),equipment:equipment.value,personType:personType.value,active:true};
    if(!row.name)return alert('Enter the driver name.');
    const old=(window.appData?.fleet_people||[]).find(p=>p.id===d.fleetPersonId);
    if(old&&typeof updateRow==='function')await updateRow('fleet_people',{...old,...row});
    else if(typeof insertRow==='function')await insertRow('fleet_people',row);
    await ensureLocate(row,userId);
    m.remove();
    rows(listEl,userId);
  };
}
async function rows(listEl,userId){
  const res=await roster(userId);
  if(res.error){listEl.innerHTML='<p class="muted">'+esc(res.error)+'</p>';return}
  const ds=res.list;
  listEl.dataset.count=String(loadDrivers().length+fleetDrivers().length);
  if(!ds.length){
    listEl.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><p class="muted" style="margin:0;flex:1">No drivers yet.</p><button type="button" class="small-btn" id="driverLocateAdd">Add driver</button></div>';
    listEl.querySelector('#driverLocateAdd').onclick=()=>editModal(null,userId,listEl);
    return;
  }
  const prev=listEl.querySelector('#driverLocateSelect')?.value;
  listEl.innerHTML='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    +'<select id="driverLocateSelect" style="flex:1;min-width:200px">'+ds.map((d,i)=>`<option value="${i}">${esc(d.name)}${d.phone?' ('+esc(d.phone)+')':''}${d.truckNumber?' • Truck '+esc(d.truckNumber):''}${d.trailerNumber?' • Trailer '+esc(d.trailerNumber):''}</option>`).join('')+'</select>'
    +'<button type="button" class="small-btn" id="driverLocateAdd">Add driver</button>'
    +'<button type="button" class="small-btn" id="driverLocateEdit">Edit driver</button>'
    +'<button type="button" class="small-btn" id="driverLocateReq">Request location</button>'
    +'<button type="button" class="small-btn" id="driverLocateView">View location</button>'
    +'<button type="button" class="small-btn" id="driverLocateDel" style="border-color:rgba(251,113,133,.4);color:#fda4af">Remove driver</button>'
    +'</div>';
  const sel=listEl.querySelector('#driverLocateSelect');
  if(prev&&+prev<ds.length)sel.value=prev;
  listEl.querySelector('#driverLocateAdd').onclick=()=>editModal(null,userId,listEl);
  listEl.querySelector('#driverLocateEdit').onclick=()=>editModal(ds[+sel.value],userId,listEl);
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
setInterval(()=>{const list=q('#driverLocateList');if(!list)return panel();if(String(loadDrivers().length+fleetDrivers().length)!==list.dataset.count)rows(list,window.__zapLocateUser)},5000);
})();
