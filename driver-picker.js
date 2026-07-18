(()=>{
/* "Saved driver" dropdown on the create-load form. Fills Driver name + Driver cell
   from your saved drivers. Same source as the dashboard Drivers card: active rows in
   driver_locates, plus drivers seen on past loads, minus any you removed. */
const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const key=d=>(d.name+'|'+d.phone).toLowerCase();
const loads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function fromLoads(){const seen={},out=[];loads().forEach(l=>{const name=(l.driverName||'').trim(),phone=(l.driverPhone||'').trim();if(!name)return;const k=(name+'|'+phone).toLowerCase();if(seen[k])return;seen[k]=1;out.push({name,phone})});return out}
async function savedDrivers(){
  if(window.zapAccountType==='carrier'&&window.sb){
    const fleet=await sb.from('fleet_people').select('id,name,phone,email,truck_number,trailer_number,equipment,pay_type,pay_rate,person_type,active').eq('active',true).order('name');
    if(!fleet.error)return (fleet.data||[]).map(x=>({id:x.id,name:String(x.name||'').trim(),phone:String(x.phone||'').trim(),truckNumber:x.truck_number||'',trailerNumber:x.trailer_number||'',equipment:x.equipment||'',payType:x.pay_type||'per_mile',payRate:Number(x.pay_rate||0),personType:x.person_type||'company_driver'})).filter(x=>x.name);
  }
  if(!window.sb)return fromLoads();
  const r=await sb.from('driver_locates').select('driver_name,driver_phone,active');
  if(r.error)return fromLoads();
  const cloud={};(r.data||[]).forEach(x=>{const d={name:String(x.driver_name||'').trim(),phone:String(x.driver_phone||'').trim()};const k=key(d);if(!cloud[k])cloud[k]={...d,anyActive:false};if(x.active)cloud[k].anyActive=true});
  fromLoads().forEach(d=>{if(!cloud[key(d)])cloud[key(d)]={...d,anyActive:true}}); /* new, not yet rostered */
  return Object.values(cloud).filter(d=>d.name&&d.anyActive).sort((a,b)=>a.name.localeCompare(b.name));
}
let lastSig='',currentList=[];
async function fill(){
  const sel=document.getElementById('driverPick');
  if(!sel)return;
  const ds=await savedDrivers();
  currentList=ds; /* handler always reads the freshest list, not a stale closure */
  const sig=JSON.stringify(ds);
  if(sig===lastSig){if(!sel.dataset.bound)bind(sel);return} /* don't clobber the user's current selection on every tick */
  lastSig=sig;
  const cur=sel.value;
  sel.innerHTML='<option value="">— New driver / type below —</option>'+ds.map((d,i)=>`<option value="${i}"${d.id?' data-fleet-id="'+esc(d.id)+'"':''}>${esc(d.name)}${d.personType==='owner_operator'?' — Owner Operator':''}${d.phone?' ('+esc(d.phone)+')':''}</option>`).join('');
  if(cur&&+cur<ds.length)sel.value=cur;
  bind(sel);
}
function bind(sel){
  if(sel.dataset.bound)return;
  sel.dataset.bound='1';
  sel.onchange=()=>{
    const d=currentList[+sel.value];
    if(!d)return; /* "New driver" — leave fields for manual entry */
    if(window.zapAccountType==='carrier'&&window.zapApplyFleetPerson){window.zapApplyFleetPerson(d);return}
    const n=document.getElementById('driverName'),p=document.getElementById('driverPhone');
    if(n)n.value=d.name;
    if(p)p.value=d.phone;
  };
}
function start(){
  if(!document.getElementById('driverPick'))return setTimeout(start,600);
  fill();
  setInterval(fill,5000); /* pick up newly saved drivers */
}
start();
})();
