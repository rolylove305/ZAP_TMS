const cfg=window.ZAP_TMS_CONFIG;
const client=window.supabase.createClient(cfg.url,cfg.token);
const el=id=>document.getElementById(id);
const link=new URLSearchParams(location.search).get('t')||'';
function say(t,b=false){const x=el('driverMsg');x.textContent=t;x.classList.toggle('bad',!!b)}
function dt(d,t){return (d||'-')+(t?' '+t:'')}
function safe(s){return String(s||'-').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}
function driverInfo(x){let box=document.getElementById('driverInfoBox');if(!box){box=document.createElement('div');box.id='driverInfoBox';box.className='mini-card';box.style.marginTop='12px';el('notesText').closest('.mini-card')?.after(box)}box.innerHTML='<h3>Driver / Equipment</h3><p><b>Driver:</b> '+safe(x.driver_name)+'</p><p><b>Cell:</b> '+safe(x.driver_phone)+'</p><p><b>Truck #:</b> '+safe(x.truck_number)+'</p><p><b>Trailer #:</b> '+safe(x.trailer_number)+'</p>'}
async function dispatchInfo(){let a={};a['p_'+'token']=link;const r=await client.rpc('driver_get_extra',a);if(r.error||!r.data||!r.data.length)return;const x=r.data[0];let box=document.getElementById('dispatchInfoBox');if(!box){box=document.createElement('div');box.id='dispatchInfoBox';box.className='mini-card';box.style.marginTop='12px';el('pickupText').closest('.route-card')?.after(box)}box.innerHTML='<h2>You have a new load from Zap Dispatch</h2><p><b>Miles:</b> '+safe(x.miles||'-')+'</p><h3>Full addresses</h3><p><b>Pickup:</b><br>'+safe(x.pickup_address)+'</p><p><b>Delivery:</b><br>'+safe(x.delivery_address)+'</p><h3>Multiple stops / extra stops</h3><p style="white-space:pre-wrap">'+safe(x.additional_stops||'No extra stops')+'</p>'}
function fill(x){el('pickupText').textContent=x.pickup||'Pickup';el('deliveryText').textContent=x.delivery||'Delivery';el('statusText').textContent=x.status||'Booked';el('equipmentText').textContent=x.equipment||'Equipment';el('loadNumberText').textContent='Load # '+(x.load_number||'-');el('pickupDateText').textContent=dt(x.pickup_date,x.pickup_time);el('deliveryDateText').textContent=dt(x.delivery_date,x.delivery_time);el('notesText').textContent=x.notes||'-';el('loadBox').classList.remove('hidden');driverInfo(x);dispatchInfo()}
async function start(){if(!link)return say('Missing link.',true);let a={};a['p_'+'token']=link;const r=await client.rpc('driver_get_load',a);if(r.error)return say(r.error.message,true);if(!r.data||!r.data.length)return say('Invalid link.',true);fill(r.data[0]);say('Load ready.')}
async function status(s){say('Sending update...');let a={};a['p_'+'token']=link;a.p_status=s;a.p_lat=null;a.p_lng=null;a.p_note='Driver portal update';const r=await client.rpc('driver_update_status',a);if(r.error)return say(r.error.message,true);say(s+' saved.');start()}
el('pickedBtn').onclick=()=>status('Picked Up');
el('deliveredBtn').onclick=()=>status('Delivered');
el('uploadBtn').onclick=()=>say('Choose file support is loading. Refresh once if needed.');
start();
setTimeout(()=>{const s=document.createElement('script');s.src='pod.js?v=3';document.body.appendChild(s)},300);