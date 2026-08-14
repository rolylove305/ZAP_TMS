(()=>{
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function user(){return (await sb.auth.getSession()).data.session?.user}

const DISMISS_KEY='zapEldFleetDismissed';
function dismissedSet(){return new Set(store.get(DISMISS_KEY,[]))}
function dismiss(id){const s=dismissedSet();s.add(id);store.set(DISMISS_KEY,[...s])}

async function fetchCandidates(){
  const u=await user();if(!u)return [];
  const [conn,drv]=await Promise.all([
    sb.from('eld_connections').select('id,provider,display_name').eq('user_id',u.id),
    sb.from('eld_external_drivers').select('id,connection_id,driver_name,phone,email,vehicle_id,trailer_id').eq('user_id',u.id)
  ]);
  if(drv.error||!drv.data)return [];
  const connMap=new Map((conn.data||[]).map(c=>[c.id,c]));
  const linked=new Set((typeof data==='function'?data().fleet_people:[]||[]).map(p=>p.eldExternalDriverId).filter(Boolean));
  const seen=dismissedSet();
  return drv.data
    .filter(d=>d.driver_name&&d.driver_name.trim())
    .filter(d=>!linked.has(d.id))
    .filter(d=>!seen.has(d.id))
    .map(d=>({...d,connection:connMap.get(d.connection_id)||null}));
}

async function addDriver(d,btn,card){
  if(btn){btn.disabled=true;btn.textContent='Adding...'}
  const truckNumber=card?.querySelector('[data-truck]')?.value.trim()||'';
  const trailerNumber=card?.querySelector('[data-trailer]')?.value.trim()||'';
  const personType=card?.querySelector('[data-persontype]')?.value||'company_driver';
  await insertRow('fleet_people',{
    personType,
    name:d.driver_name,
    phone:d.phone||'',
    email:d.email||'',
    truckNumber,
    trailerNumber,
    equipment:'Dry Van',
    payType:'per_mile',
    payRate:0,
    notes:'Added from ELD'+(d.connection?' ('+d.connection.display_name+')':'')+' — review pay terms and equipment.',
    active:true,
    eldExternalDriverId:d.id
  });
  render(true);
}

function ignoreDriver(id){dismiss(id);render(true)}

let lastSig=null;
async function render(force){
  const host=document.getElementById('fleet');
  if(!host)return;
  const list=await fetchCandidates();
  let box=$('eldFleetCandidates');
  if(!list.length){if(box)box.remove();lastSig=null;return}
  const sig=list.map(d=>d.id).join(',');
  if(!force&&box&&sig===lastSig)return; // avoid wiping in-progress truck/trailer edits on the periodic refresh
  lastSig=sig;
  if(!box){
    box=document.createElement('div');
    box.id='eldFleetCandidates';
    box.className='card';
    box.style.margin='0 0 14px';
    const firstCard=host.querySelector('.card');
    host.insertBefore(box,firstCard);
  }
  box.innerHTML=
    '<div class="section-title"><h2>New drivers from your ELD ('+list.length+')</h2></div>'
    +'<p class="muted" style="margin:-4px 0 10px">Detected automatically when your ELD syncs. Correct the truck/trailer if needed, then add with one click — or dismiss the ones you don\'t need.</p>'
    +list.map((d,i)=>
      '<div class="list-card" data-eld-card="'+i+'"><h3>'+esc(d.driver_name)+'</h3>'
      +'<p class="muted">'+esc([d.phone,d.email].filter(Boolean).join(' • ')||'No contact info from ELD')+(d.connection?' • via '+esc(d.connection.display_name):'')+'</p>'
      +'<div class="form-grid">'
        +'<label>Type<select data-persontype><option value="company_driver">Company Driver</option><option value="owner_operator">Owner Operator</option></select></label>'
        +'<label>Truck #<input data-truck value="'+esc(d.vehicle_id||'')+'" placeholder="Truck #"></label>'
        +'<label>Trailer #<input data-trailer value="'+esc(d.trailer_id||'')+'" placeholder="Trailer #"></label>'
      +'</div>'
      +'<div class="card-actions"><button class="small-btn" data-add="'+i+'">+ Add to Fleet</button><button class="small-btn" data-ignore="'+i+'">Dismiss</button></div>'
      +'</div>'
    ).join('');
  box.querySelectorAll('[data-add]').forEach(btn=>btn.onclick=()=>addDriver(list[Number(btn.dataset.add)],btn,btn.closest('[data-eld-card]')));
  box.querySelectorAll('[data-ignore]').forEach(btn=>btn.onclick=()=>ignoreDriver(list[Number(btn.dataset.ignore)].id));
}

setTimeout(()=>render(true),1500);
setInterval(()=>render(false),10000);
document.addEventListener('click',e=>{if(e.target.closest('[data-screen="fleet"]'))setTimeout(()=>render(true),300)});
})();
