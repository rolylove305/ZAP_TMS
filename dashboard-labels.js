(()=>{
const by=id=>document.getElementById(id);
const money=n=>'$'+Number(n||0).toFixed(2);
function loads(){try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}}
function dateOf(x){return x.delivery_date||x.pickup_date||''}
function fee(x){return Number(x.rate||0)*Number(x.commission_pct||0)/100}
function group(s){s=String(s||'').toLowerCase();if(s==='archived')return'archive';if(s==='paid')return'paid';if(['delivered','invoiced','cancelled'].includes(s))return'completed';return'active'}
function inYear(x){const v=dateOf(x);if(!v)return false;const d=new Date(v+'T12:00:00'),n=new Date();return !isNaN(d)&&d.getFullYear()===n.getFullYear()}
function startWeek(d){d=new Date(d);const day=d.getDay();const diff=d.getDate()-day+(day===0?-6:1);return new Date(d.setDate(diff)).setHours(0,0,0,0)}
function inWeek(x){const v=dateOf(x);if(!v)return false;return new Date(v+'T12:00:00').getTime()>=startWeek(new Date())}
function cell(label,value){const d=document.createElement('div');d.style.cssText='background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:16px;padding:12px';const p=document.createElement('p');p.className='muted';p.style.margin='0 0 6px';p.textContent=label;const h=document.createElement('h3');h.style.margin='0';h.textContent=value;d.appendChild(p);d.appendChild(h);return d}
function run(){const grid=by('zapDashGrid');if(!grid)return;const a=loads();const y=a.filter(inYear);const counts={active:0,completed:0,paid:0,archive:0};a.forEach(x=>counts[group(x.status)]++);const data=[['Total Loads',a.length],['YTD Gross',money(y.reduce((s,x)=>s+Number(x.rate||0),0))],['YTD Dispatch Fee',money(y.reduce((s,x)=>s+fee(x),0))],['Gross This Week',money(a.filter(inWeek).reduce((s,x)=>s+Number(x.rate||0),0))],['Dispatch Fee This Week',money(a.filter(inWeek).reduce((s,x)=>s+fee(x),0))],['Active Loads',counts.active],['Completed Loads',counts.completed],['Paid Loads',counts.paid],['Archived Loads',counts.archive],['Pending Invoice',a.filter(x=>String(x.status||'').toLowerCase()==='delivered').length],['Pending Payment',a.filter(x=>String(x.status||'').toLowerCase()==='invoiced').length],['Loads Missing Dates',a.filter(x=>!dateOf(x)).length]];grid.textContent='';data.forEach(x=>grid.appendChild(cell(x[0],x[1])));const card=by('zapDash');const m=card&&card.querySelector('.muted');if(m)m.textContent='Year-to-date revenue, dispatch fees, and load counts.'}
setInterval(run,1000);
})();