(()=>{
const by=id=>document.getElementById(id);
const money=n=>'$'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fee=x=>Number(x.rate||0)*Number(x.commission_pct||0)/100;
const dateOf=x=>x.delivery_date||x.pickup_date||'';
function card(k,v){return '<div style="background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:16px;padding:12px"><p class="muted" style="margin:0 0 6px">'+k+'</p><h3 style="margin:0">'+v+'</h3></div>'}
function grp(s){s=String(s||'').toLowerCase();if(s==='archived')return'archive';if(s==='paid')return'paid';if(['delivered','invoiced','cancelled'].includes(s))return'completed';return'active'}
function inYear(x){const v=dateOf(x);if(!v)return true;const d=new Date(v+'T12:00:00');return !isNaN(d)&&d.getFullYear()===new Date().getFullYear()}
async function run(){const grid=by('zapDashGrid');if(!grid||!window.sb)return;const r=await sb.from('loads').select('status,rate,commission_pct,pickup_date,delivery_date');if(r.error)return;const a=r.data||[],y=a.filter(inYear);const c={active:0,completed:0,paid:0,archive:0};a.forEach(x=>c[grp(x.status)]++);const paidClosed=c.paid+c.archive;const nw=new Date(),dow=(nw.getDay()+6)%7,mon=new Date(nw);mon.setHours(0,0,0,0);mon.setDate(nw.getDate()-dow);const sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59,999);const inWk=x=>{const v=dateOf(x);if(!v)return false;const d=new Date(v+'T12:00:00');return !isNaN(d)&&d>=mon&&d<=sun};const weekGross=a.filter(inWk).reduce((s,x)=>s+Number(x.rate||0),0);const weekFee=a.filter(inWk).reduce((s,x)=>s+fee(x),0);const data=[['Total Loads',a.length],['This Week Gross (Mon–Sun)',money(weekGross)],['Weekly Dispatch Fee',money(weekFee)],['YTD Dispatch Fee',money(y.reduce((s,x)=>s+fee(x),0))],['Active Loads',c.active],['Completed Loads',c.completed],['Paid / Closed',paidClosed],['Archived Loads',c.archive],['Pending Payment',a.filter(x=>String(x.status||'').toLowerCase()==='invoiced').length]];grid.innerHTML=data.map(x=>card(x[0],x[1])).join('')}
window.zapRefreshDashboard=run;
setTimeout(run,800);
setInterval(run,15000);
})();