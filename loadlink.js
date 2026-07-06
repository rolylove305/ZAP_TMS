(()=>{
const get=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
async function go(i){const l=get()[i];if(!l||!l.id)return alert('Sync first.');const r=await sb.rpc('create_driver_link',{p_load_id:l.id});if(r.error)return alert(r.error.message);const base=location.origin+location.pathname.replace(/index\.html$/,'').replace(/\/$/,'/');const url=base+'portal.html?t='+r.data;try{await navigator.clipboard.writeText(url);alert('Copied:\n'+url)}catch{prompt('Copy:',url)}}
function add(){document.querySelectorAll('#loadsList .list-card').forEach((c,i)=>{if(c.querySelector('.load-link-btn'))return;let a=c.querySelector('.card-actions');if(!a){a=document.createElement('div');a.className='card-actions';c.appendChild(a)}let b=document.createElement('button');b.className='small-btn load-link-btn';b.textContent='Driver Link';b.onclick=()=>go(i);a.insertBefore(b,a.firstChild)})}
setInterval(add,1000);
})();