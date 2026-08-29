(()=>{
/* "Saved driver" dropdown on the create-load form. Fills Driver, cell, truck,
   trailer, and equipment from saved fleet records when available. */
const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const normPhone=p=>String(p||'').replace(/\D/g,'');
const nameKey=d=>String(d.name||'').trim().toLowerCase().replace(/\s+/g,' ');
const loads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function cleanDriver(d){return{...d,name:String(d.name||'').trim(),phone:String(d.phone||'').trim(),truckNumber:d.truckNumber||'',trailerNumber:d.trailerNumber||'',equipment:d.equipment||'',fleetPersonId:d.fleetPersonId!==undefined?d.fleetPersonId:(d.id||'')}}
function mergeDriver(into,d){Object.keys(d).forEach(k=>{if(into[k]===undefined||into[k]===''||into[k]===null)into[k]=d[k]});return into}
function sortDrivers(rows){return rows.filter(d=>d.name).sort((a,b)=>a.name.localeCompare(b.name))}
function fromFleetData(){
  const rows=window.appData?.fleet_people||[];
  return sortDrivers(rows.filter(x=>x&&x.active!==false).map(x=>cleanDriver({id:x.id,fleetPersonId:x.id,name:x.name,phone:x.phone,truckNumber:x.truckNumber,trailerNumber:x.trailerNumber,equipment:x.equipment,payType:x.payType||'per_mile',payRate:Number(x.payRate||0),personType:x.personType||'company_driver'})));
}
function addDriver(bucket,d,strictName=false){
  d=cleanDriver(d||{});
  if(!d.name)return;
  const phone=normPhone(d.phone),name=nameKey(d);
  const match=Object.keys(bucket).find(k=>{
    const x=bucket[k],xp=normPhone(x.phone),xn=nameKey(x);
    return (d.fleetPersonId&&x.fleetPersonId===d.fleetPersonId)||(phone&&xp===phone)||(name&&xn===name);
  });
  const k=match||d.fleetPersonId||phone||name;
  if(bucket[k])mergeDriver(bucket[k],d);
  else bucket[k]=d;
}
function uniqueDrivers(rows,strictName=false){const bucket={};rows.forEach(d=>addDriver(bucket,d,strictName));return sortDrivers(Object.values(bucket))}
function fromLoads(){return uniqueDrivers(loads().map(l=>({id:l.fleetPersonId||'',fleetPersonId:l.fleetPersonId||'',name:l.driverName,phone:l.driverPhone,truckNumber:l.truckNumber,trailerNumber:l.trailerNumber,equipment:l.equipment})))}
async function fromEldDrivers(){
  if(!window.sb)return [];
  const r=await sb.from('eld_external_drivers').select('id,driver_name,phone,vehicle_id,trailer_id,status').order('driver_name');
  if(r.error)return [];
  return (r.data||[]).map(x=>cleanDriver({id:'eld:'+x.id,fleetPersonId:'',name:x.driver_name,phone:x.phone,truckNumber:x.vehicle_id,trailerNumber:x.trailer_id,equipment:'',eldExternalDriverId:x.id,status:x.status}));
}
async function savedDrivers(){
  const fleetData=fromFleetData();
  if(window.zapAccountType==='carrier'&&window.sb){
    const fleet=await sb.from('fleet_people').select('id,name,phone,email,truck_number,trailer_number,equipment,pay_type,pay_rate,person_type,active').eq('active',true).order('name');
    const rows=(fleet.data||[]).map(x=>({id:x.id,fleetPersonId:x.id,name:x.name,phone:x.phone,truckNumber:x.truck_number,trailerNumber:x.trailer_number,equipment:x.equipment,payType:x.pay_type||'per_mile',payRate:Number(x.pay_rate||0),personType:x.person_type||'company_driver'}));
    if(!fleet.error&&rows.length)return uniqueDrivers(rows,true);
  }
  if(window.zapAccountType==='carrier'&&fleetData.length)return uniqueDrivers(fleetData,true);
  const all={};
  if(!window.sb)return fromLoads();
  (await fromEldDrivers()).forEach(d=>addDriver(all,d));
  fromLoads().forEach(d=>addDriver(all,d));
  const r=await sb.from('driver_locates').select('driver_name,driver_phone,active');
  if(!r.error)(r.data||[]).forEach(x=>{if(x.active)addDriver(all,{name:x.driver_name,phone:x.driver_phone})});
  return sortDrivers(Object.values(all));
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
  sel.innerHTML='<option value="">— New driver / type below —</option>'+ds.map((d,i)=>`<option value="${i}"${d.fleetPersonId?' data-fleet-id="'+esc(d.fleetPersonId)+'"':''}>${esc(d.name)}${d.personType==='owner_operator'?' — Owner Operator':''}${d.truckNumber?' • Truck '+esc(d.truckNumber):''}${d.trailerNumber?' • Trailer '+esc(d.trailerNumber):''}${d.phone?' ('+esc(d.phone)+')':''}</option>`).join('');
  if(cur&&+cur<ds.length)sel.value=cur;
  bind(sel);
}
function applyDriverToLoadForm(d){
  const fields=[['driverName','name'],['driverPhone','phone'],['truckNumber','truckNumber'],['trailerNumber','trailerNumber']];
  fields.forEach(([id,k])=>{const el=document.getElementById(id);if(el)el.value=d[k]||''});
  const equipment=document.getElementById('equipment');
  if(equipment&&d.equipment)equipment.value=d.equipment;
}
function bind(sel){
  if(sel.dataset.bound)return;
  sel.dataset.bound='1';
  sel.onchange=()=>{
    const d=currentList[+sel.value];
    if(!d)return; /* "New driver" — leave fields for manual entry */
    if(window.zapAccountType==='carrier'&&window.zapApplyFleetPerson){window.zapApplyFleetPerson(d);return}
    applyDriverToLoadForm(d);
  };
}
function start(){
  if(!document.getElementById('driverPick'))return setTimeout(start,600);
  fill();
  setInterval(fill,5000); /* pick up newly saved drivers */
}
start();
})();
