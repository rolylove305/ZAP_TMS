(()=>{
const by=id=>document.getElementById(id);
const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function injectFields(){
  if(by('pickupTime'))return;
  const pd=by('pickupDate'),dd=by('deliveryDate');
  if(pd){const l=document.createElement('label');l.textContent='Pickup time';const x=document.createElement('input');x.id='pickupTime';x.type='time';l.appendChild(x);pd.closest('label')?.after(l)}
  if(dd){const l=document.createElement('label');l.textContent='Delivery time';const x=document.createElement('input');x.id='deliveryTime';x.type='time';l.appendChild(x);dd.closest('label')?.after(l)}
}
async function saveLoad(){
  const u=(await sb.auth.getSession()).data.session?.user;
  if(!u)return alert('Login again first.');
  const row={user_id:u.id,carrier:by('loadCarrier').value||'',broker:by('loadBroker').value||'',pickup:by('pickup').value||'',delivery:by('delivery').value||'',pickup_date:by('pickupDate').value||null,delivery_date:by('deliveryDate').value||null,pickup_time:by('pickupTime')?.value||'',delivery_time:by('deliveryTime')?.value||'',equipment:by('equipment').value||'',status:by('loadStatus').value||'Booked',rate:Number(by('rate').value||0),commission_pct:Number(by('commissionPct').value||8),load_number:by('loadNumber').value||'',notes:by('loadNotes').value||''};
  const r=await sb.from('loads').insert(row);
  if(r.error)return alert('Save error: '+r.error.message);
  ['pickup','delivery','pickupDate','deliveryDate','pickupTime','deliveryTime','rate','loadNumber','loadNotes'].forEach(id=>{const e=by(id);if(e)e.value=''})
  if(typeof loadCloud==='function')await loadCloud();
}
function hookSave(){const b=by('addLoad');if(b&&!b.dataset.timeHook){b.dataset.timeHook='1';b.onclick=saveLoad}}
async function showTimes(){
  const loads=getLoads();if(!loads.length)return;
  const ids=loads.map(x=>x.id).filter(Boolean);if(!ids.length)return;
  const r=await sb.from('loads').select('id,pickup_time,delivery_time').in('id',ids);if(r.error||!r.data)return;
  const m=Object.fromEntries(r.data.map(x=>[x.id,x]));
  document.querySelectorAll('#loadsList .list-card').forEach((card,i)=>{
    const l=loads[i];if(!l||!l.id)return;const t=m[l.id]||{};
    let pill=card.querySelector('.time-pill');
    if(!pill){pill=document.createElement('span');pill.className='pill time-pill';card.querySelector('.pill-row')?.appendChild(pill)}
    pill.textContent='PU '+(t.pickup_time||'-')+' / DEL '+(t.delivery_time||'-');
  })
}
setInterval(()=>{injectFields();hookSave();showTimes()},1200);
})();