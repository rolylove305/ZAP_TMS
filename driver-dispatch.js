(()=>{
const token=new URLSearchParams(location.search).get('t')||'';
const safe=s=>String(s||'-').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
function addBox(x){let box=document.getElementById('dispatchInfoBox');if(!box){box=document.createElement('div');box.id='dispatchInfoBox';box.className='driver-card';box.style.boxShadow='none';box.style.marginBottom='0';const route=document.querySelector('.driver-route');if(route&&route.parentNode)route.parentNode.insertBefore(box,route.nextSibling);else document.getElementById('loadBox')?.prepend(box)}box.innerHTML='<h2>You have a new load from Zap Dispatch</h2><p><b>Miles:</b> '+safe(x.miles||'-')+'</p><h3>Full addresses</h3><p><b>Pickup:</b><br>'+safe(x.pickup_address)+'</p><p><b>Delivery:</b><br>'+safe(x.delivery_address)+'</p><h3>Multiple stops / extra stops</h3><p style="white-space:pre-wrap">'+safe(x.additional_stops||'No extra stops')+'</p>'}
async function run(){try{if(!token||!window.client)return;let a={};a['p_'+'token']=token;const r=await client.rpc('driver_get_extra',a);if(r.error||!r.data||!r.data.length)return;addBox(r.data[0])}catch(e){}}
setInterval(run,2000);
setTimeout(run,1200);
})();