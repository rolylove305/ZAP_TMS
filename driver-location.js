(()=>{
const q=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('t')||'';
function note(x,b=false){const m=q('driverMsg');m.textContent=x;m.classList.toggle('bad',!!b)}
function geo(){return new Promise(ok=>{if(!navigator.geolocation)return ok(null);navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lng:p.coords.longitude}),()=>ok(null),{enableHighAccuracy:true,timeout:15000})})}
async function sendLoc(){note('Getting location...');const g=await geo();if(!g)return note('Location permission denied or unavailable.',true);const a={};a['p_'+'token']=token;a.p_lat=g.lat;a.p_lng=g.lng;a.p_note='Current driver location';const r=await client.rpc('driver_send_location',a);if(r.error)return note(r.error.message,true);note('Location sent.')}
function addBtn(){const box=document.querySelector('.driver-actions');if(!box||q('locBtn'))return;const b=document.createElement('button');b.id='locBtn';b.className='primary-btn';b.textContent='Send Current Location';b.onclick=sendLoc;box.appendChild(b)}
setTimeout(addBtn,800);
})();