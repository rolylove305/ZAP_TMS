(()=>{
function q(id){return document.getElementById(id)}
function apply(){const s=(q('statusText')?.textContent||'').trim();const p=q('pickedBtn'),d=q('deliveredBtn');if(!p||!d)return;p.disabled=false;d.disabled=false;p.textContent='Mark Picked Up';d.textContent='Mark Delivered';if(s==='Picked Up'){p.textContent='Picked Up ✓';p.disabled=true}if(s==='Delivered'){p.textContent='Picked Up ✓';d.textContent='Delivered ✓';p.disabled=true;d.disabled=true}}
setInterval(apply,700);
document.addEventListener('click',()=>setTimeout(apply,900));
})();