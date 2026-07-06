const cfg=window.ZAP_TMS_CONFIG;
const client=window.supabase.createClient(cfg.url,cfg.token);
const el=id=>document.getElementById(id);
const link=new URLSearchParams(location.search).get('t')||'';
function say(t,b=false){const x=el('driverMsg');x.textContent=t;x.classList.toggle('bad',!!b)}
function fill(x){el('pickupText').textContent=x.pickup||'Pickup';el('deliveryText').textContent=x.delivery||'Delivery';el('statusText').textContent=x.status||'Booked';el('equipmentText').textContent=x.equipment||'Equipment';el('loadNumberText').textContent='Load # '+(x.load_number||'-');el('pickupDateText').textContent=x.pickup_date||'-';el('deliveryDateText').textContent=x.delivery_date||'-';el('notesText').textContent=x.notes||'-';el('loadBox').classList.remove('hidden')}
async function start(){if(!link)return say('Missing link.',true);let a={};a['p_'+'token']=link;const r=await client.rpc('driver_get_load',a);if(r.error)return say(r.error.message,true);if(!r.data||!r.data.length)return say('Invalid link.',true);fill(r.data[0]);say('Load ready.')}
async function status(s){say('Sending update...');let a={};a['p_'+'token']=link;a.p_status=s;a.p_lat=null;a.p_lng=null;a.p_note='Driver portal update';const r=await client.rpc('driver_update_status',a);if(r.error)return say(r.error.message,true);say(s+' saved.');start()}
el('pickedBtn').onclick=()=>status('Picked Up');
el('deliveredBtn').onclick=()=>status('Delivered');
el('uploadBtn').onclick=()=>say('Choose file support is loading. Refresh once if needed.');
start();
setTimeout(()=>{const s=document.createElement('script');s.src='pod.js?v=1';document.body.appendChild(s)},300);