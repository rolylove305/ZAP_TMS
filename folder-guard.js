(()=>{
function ls(){try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}}
function g(s){s=String(s||'').toLowerCase();if(s==='archived')return'archive';if(s==='paid')return'paid';if(['delivered','invoiced','cancelled'].includes(s))return'completed';return'active'}
function run(){const a=ls(),f=localStorage.getItem('zapFolder')||'active';document.querySelectorAll('#loadsList .list-card').forEach((c,i)=>{let x=a.find(v=>v.id&&c.dataset.loadId===v.id)||a[i];if(!x)return;if(x.id)c.dataset.loadId=x.id;c.style.display=g(x.status)===f?'block':'none'})}
setInterval(run,300);
})();