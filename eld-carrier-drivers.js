(()=>{
/* Dispatch-side view: dispatchers have no fleet_people roster of their own — their
   carriers own the trucks/drivers, and dispatchers pay the carrier (commission),
   not the individual driver, so no Company Driver / Owner Operator tagging here.
   An eld_connections row can be linked to a specific carrier (carrier_id), so if a
   dispatcher connects one of their carriers' ELD accounts, this surfaces every
   driver ELD reports, grouped by carrier, across ALL connected carriers at once. */
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function user(){return (await sb.auth.getSession()).data.session?.user}

const DISMISS_KEY='zapEldCarrierDismissed';
function dismissedSet(){return new Set(store.get(DISMISS_KEY,[]))}
function dismiss(id){const s=dismissedSet();s.add(id);store.set(DISMISS_KEY,[...s])}

async function fetchGroups(){
  const u=await user();if(!u)return [];
  const [conn,drv]=await Promise.all([
    sb.from('eld_connections').select('id,carrier_id,provider,display_name').eq('user_id',u.id),
    sb.from('eld_external_drivers').select('id,connection_id,driver_name,phone,email,vehicle_id,trailer_id').eq('user_id',u.id)
  ]);
  if(conn.error||!conn.data||drv.error||!drv.data)return [];
  const carriers=(typeof data==='function'?data().carriers:[])||[];
  const carrierById=new Map(carriers.map(c=>[c.id,c]));
  const seen=dismissedSet();
  const driversByConn=new Map();
  drv.data.forEach(d=>{
    if(!d.driver_name||!d.driver_name.trim())return;
    if(seen.has(d.id))return;
    if(!driversByConn.has(d.connection_id))driversByConn.set(d.connection_id,[]);
    driversByConn.get(d.connection_id).push(d);
  });
  return conn.data
    .map(c=>({
      connection:c,
      carrier:c.carrier_id?carrierById.get(c.carrier_id):null,
      drivers:(driversByConn.get(c.id)||[]).sort((a,b)=>a.driver_name.localeCompare(b.driver_name))
    }))
    .filter(g=>g.drivers.length);
}

function dismissDriver(id){dismiss(id);render(true)}

function useInNewLoad(d,carrierName){
  navTo('loads');
  setTimeout(()=>{
    if(carrierName){const sel=$('loadCarrier');if(sel){sel.value=carrierName;if(window.syncCommissionFromCarrier)window.syncCommissionFromCarrier()}}
    if($('driverName'))$('driverName').value=d.driver_name||'';
    if($('driverPhone'))$('driverPhone').value=d.phone||'';
    if($('truckNumber'))$('truckNumber').value=d.vehicle_id||'';
    if($('trailerNumber'))$('trailerNumber').value=d.trailer_id||'';
    $('driverName')?.scrollIntoView({behavior:'smooth',block:'center'});
  },150);
}

let lastSig=null;
async function render(force){
  const host=document.getElementById('carriers');
  if(!host)return;
  const groups=await fetchGroups();
  let box=$('eldCarrierDrivers');
  const totalDrivers=groups.reduce((s,g)=>s+g.drivers.length,0);
  if(!totalDrivers){if(box)box.remove();lastSig=null;return}
  const sig=groups.map(g=>g.connection.id+':'+g.drivers.map(d=>d.id).join(',')).join('|');
  if(!force&&box&&sig===lastSig)return;
  lastSig=sig;
  if(!box){
    box=document.createElement('div');
    box.id='eldCarrierDrivers';
    box.className='card';
    box.style.margin='0 0 14px';
    const firstCard=host.querySelector('.card');
    host.insertBefore(box,firstCard);
  }
  box.innerHTML=
    '<div class="section-title"><h2>Drivers via ELD ('+totalDrivers+')</h2></div>'
    +'<p class="muted" style="margin:-4px 0 10px">From every carrier ELD you\'ve connected. "Use in new load" pre-fills the carrier and driver on a fresh load — "Dismiss" hides someone who no longer drives for them (e.g. left the carrier).</p>'
    +groups.map(g=>{
      const carrierLabel=g.carrier?g.carrier.name:(g.connection.display_name+' — no carrier linked yet');
      return '<div style="margin-bottom:14px">'
        +'<p style="font-weight:700;margin:0 0 6px">'+esc(carrierLabel)+'<span class="muted" style="font-weight:400"> • '+esc(g.connection.display_name)+'</span></p>'
        +g.drivers.map(d=>
          '<div class="list-card" style="margin-bottom:8px"><h3>'+esc(d.driver_name)+'</h3>'
          +'<p class="muted">'+esc([d.phone,d.email].filter(Boolean).join(' • ')||'No contact info from ELD')+'</p>'
          +'<div class="pill-row">'+(d.vehicle_id?'<span class="pill">Truck '+esc(d.vehicle_id)+'</span>':'')+(d.trailer_id?'<span class="pill">Trailer '+esc(d.trailer_id)+'</span>':'')+'</div>'
          +'<div class="card-actions"><button class="small-btn" data-use="'+d.id+'">Use in new load →</button><button class="small-btn" data-dismiss="'+d.id+'">Dismiss</button></div>'
          +'</div>'
        ).join('')
        +'</div>';
    }).join('');
  box.querySelectorAll('[data-use]').forEach(btn=>{
    const id=btn.dataset.use;
    let match=null,carrierName=null;
    groups.forEach(g=>{const d=g.drivers.find(x=>x.id===id);if(d){match=d;carrierName=g.carrier?g.carrier.name:null}});
    if(match)btn.onclick=()=>useInNewLoad(match,carrierName);
  });
  box.querySelectorAll('[data-dismiss]').forEach(btn=>btn.onclick=()=>dismissDriver(btn.dataset.dismiss));
}

setTimeout(()=>render(true),1500);
setInterval(()=>render(false),10000);
document.addEventListener('click',e=>{if(e.target.closest('[data-screen="carriers"]'))setTimeout(()=>render(true),300)});
})();
