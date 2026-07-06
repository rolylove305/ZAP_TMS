(()=>{
const by=id=>document.getElementById(id);
const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function addField(afterId,id,label,type='text',ph=''){
  if(by(id))return;
  const anchor=by(afterId);if(!anchor)return;
  const l=document.createElement('label');l.textContent=label;
  const x=document.createElement('input');x.id=id;x.type=type;x.placeholder=ph;
  l.appendChild(x);anchor.closest('label')?.after(l);
}
function addArea(afterId,id,label,ph=''){
  if(by(id))return;
  const anchor=by(afterId);if(!anchor)return;
  const l=document.createElement('label');l.textContent=label;
  const x=document.createElement('textarea');x.id=id;x.rows=3;x.placeholder=ph;
  l.appendChild(x);anchor.closest('label')?.after(l);
}
function loadZapUpgrades(){if(!by('zapUpgradesHelper')){const s=document.createElement('script');s.id='zapUpgradesHelper';s.src='zap-upgrades.js?v=4300';document.body.appendChild(s)}if(!by('dashboardLabelsHelper')){const d=document.createElement('script');d.id='dashboardLabelsHelper';d.src='dashboard-labels.js?v=4600';document.body.appendChild(d)}}
function injectFields(){
  loadZapUpgrades();
  addField('pickupDate','pickupTime','Pickup time','time');
  addField('deliveryDate','deliveryTime','Delivery time','time');
  addField('pickup','pickupAddress','Full pickup address','text','Street, city, state, zip');
  addField('delivery','deliveryAddress','Full delivery address','text','Street, city, state, zip');
  addField('deliveryAddress','loadMiles','Miles','number','Loaded miles');
  addArea('loadMiles','extraStops','Multiple stops / extra stops','Example:\nStop 1 Pickup - full address - appt time\nStop 2 Delivery - full address - appt time');
  addField('loadCarrier','driverName','Driver name','text','Driver name');
  addField('driverName','driverPhone','Driver cell','tel','Driver phone');
  addField('equipment','truckNumber','Truck #','text','Truck number');
  addField('truckNumber','trailerNumber','Trailer #','text','Trailer number');
}
async function saveLoad(){
  const u=(await sb.auth.getSession()).data.session?.user;
  if(!u)return alert('Login again first.');
  const row={user_id:u.id,carrier:by('loadCarrier').value||'',broker:by('loadBroker').value||'',pickup:by('pickup').value||'',delivery:by('delivery').value||'',pickup_address:by('pickupAddress')?.value||'',delivery_address:by('deliveryAddress')?.value||'',miles:Number(by('loadMiles')?.value||0),additional_stops:by('extraStops')?.value||'',pickup_date:by('pickupDate').value||null,delivery_date:by('deliveryDate').value||null,pickup_time:by('pickupTime')?.value||'',delivery_time:by('deliveryTime')?.value||'',driver_name:by('driverName')?.value||'',driver_phone:by('driverPhone')?.value||'',truck_number:by('truckNumber')?.value||'',trailer_number:by('trailerNumber')?.value||'',equipment:by('equipment').value||'',status:by('loadStatus').value||'Booked',rate:Number(by('rate').value||0),commission_pct:Number(by('commissionPct').value||8),load_number:by('loadNumber').value||'',notes:by('loadNotes').value||''};
  const r=await sb.from('loads').insert(row);
  if(r.error)return alert('Save error: '+r.error.message);
  ['pickup','delivery','pickupAddress','deliveryAddress','loadMiles','extraStops','pickupDate','deliveryDate','pickupTime','deliveryTime','driverName','driverPhone','truckNumber','trailerNumber','rate','loadNumber','loadNotes'].forEach(id=>{const e=by(id);if(e)e.value=''})
  if(typeof loadCloud==='function')await loadCloud();
}
function hookSave(){const b=by('addLoad');if(b&&!b.dataset.timeHook){b.dataset.timeHook='1';b.onclick=saveLoad}}
async function showExtra(){
  const loads=getLoads();if(!loads.length)return;
  const ids=loads.map(x=>x.id).filter(Boolean);if(!ids.length)return;
  const r=await sb.from('loads').select('id,pickup_time,delivery_time,driver_name,driver_phone,truck_number,trailer_number,miles,pickup_address,delivery_address,additional_stops').in('id',ids);if(r.error||!r.data)return;
  const m=Object.fromEntries(r.data.map(x=>[x.id,x]));
  document.querySelectorAll('#loadsList .list-card').forEach((card,i)=>{
    const l=loads[i];if(!l||!l.id)return;const t=m[l.id]||{};
    let pill=card.querySelector('.time-pill');
    if(!pill){pill=document.createElement('span');pill.className='pill time-pill';card.querySelector('.pill-row')?.appendChild(pill)}
    pill.textContent='PU '+(t.pickup_time||'-')+' / DEL '+(t.delivery_time||'-')+' | Miles '+(t.miles||'-');
    let info=card.querySelector('.driver-info-line');
    if(!info){info=document.createElement('p');info.className='muted driver-info-line';card.appendChild(info)}
    info.textContent='Driver: '+(t.driver_name||'-')+' | Cell: '+(t.driver_phone||'-')+' | Truck: '+(t.truck_number||'-')+' | Trailer: '+(t.trailer_number||'-');
    let adr=card.querySelector('.address-info-line');
    if(!adr){adr=document.createElement('p');adr.className='muted address-info-line';card.appendChild(adr)}
    adr.textContent='PU addr: '+(t.pickup_address||'-')+' | DEL addr: '+(t.delivery_address||'-');
  })
}
setInterval(()=>{injectFields();hookSave();showExtra()},1200);
})();