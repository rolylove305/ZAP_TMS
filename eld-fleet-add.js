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

async function addDriver(d,btn){
  if(btn){btn.disabled=true;btn.textContent='Adding...'}
  await insertRow('fleet_people',{
    personType:'company_driver',
    name:d.driver_name,
    phone:d.phone||'',
    email:d.email||'',
    truckNumber:d.vehicle_id||'',
    trailerNumber:d.trailer_id||'',
    equipment:'Dry Van',
    payType:'per_mile',
    payRate:0,
    notes:'Added from ELD'+(d.connection?' ('+d.connection.display_name+')':'')+' — review pay terms and equipment.',
    active:true,
    eldExternalDriverId:d.id
  });
  render();
}

function ignoreDriver(id){dismiss(id);render()}

async function render(){
  const host=document.getElementById('fleet');
  if(!host)return;
  const list=await fetchCandidates();
  let box=$('eldFleetCandidates');
  if(!list.length){if(box)box.remove();return}
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
    +'<p class="muted" style="margin:-4px 0 10px">Detected automatically when your ELD syncs. Add with one click, or dismiss the ones you don\'t need.</p>'
    +list.map((d,i)=>
      '<div class="list-card"><h3>'+esc(d.driver_name)+'</h3>'
      +'<p class="muted">'+esc([d.phone,d.email].filter(Boolean).join(' • ')||'No contact info from ELD')+(d.connection?' • via '+esc(d.connection.display_name):'')+'</p>'
      +'<div class="pill-row">'+(d.vehicle_id?'<span class="pill">Truck '+esc(d.vehicle_id)+'</span>':'')+(d.trailer_id?'<span class="pill">Trailer '+esc(d.trailer_id)+'</span>':'')+'</div>'
      +'<div class="card-actions"><button class="small-btn" data-add="'+i+'">+ Add to Fleet</button><button class="small-btn" data-ignore="'+i+'">Dismiss</button></div>'
      +'</div>'
    ).join('');
  box.querySelectorAll('[data-add]').forEach(btn=>btn.onclick=()=>addDriver(list[Number(btn.dataset.add)],btn));
  box.querySelectorAll('[data-ignore]').forEach(btn=>btn.onclick=()=>ignoreDriver(list[Number(btn.dataset.ignore)].id));
}

setTimeout(render,1500);
setInterval(render,10000);
document.addEventListener('click',e=>{if(e.target.closest('[data-screen="fleet"]'))setTimeout(render,300)});
})();
