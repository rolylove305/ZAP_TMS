(()=>{
const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function toast(t){const n=document.createElement('div');n.textContent=t;n.style.cssText='position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:9999;background:#0f766e;color:white;padding:12px 18px;border-radius:999px;font-weight:800;box-shadow:0 12px 28px rgba(0,0,0,.35)';document.body.appendChild(n);setTimeout(()=>n.remove(),3500)}
async function checkFiles(){try{const loads=getLoads();const ids=loads.map(x=>x.id).filter(Boolean);if(!ids.length)return;const r=await sb.from('load_documents').select('load_id').in('load_id',ids);if(r.error||!r.data)return;const c={};r.data.forEach(x=>c[x.load_id]=(c[x.load_id]||0)+1);const prev=JSON.parse(localStorage.getItem('zapFileCounts')||'{}');let added=false;document.querySelectorAll('#loadsList .list-card').forEach((card,i)=>{const l=loads[i];if(!l)return;const total=c[l.id]||0;const b=card.querySelector('.load-docs-btn');if(b)b.textContent='Docs ('+total+')';if(prev[l.id]!==undefined&&total>prev[l.id])added=true;prev[l.id]=total});localStorage.setItem('zapFileCounts',JSON.stringify(prev));if(added)toast('New document uploaded') }catch(e){}}
setInterval(()=>{try{if(typeof loadCloud==='function')loadCloud()}catch(e){}},20000);
setInterval(checkFiles,10000);
setTimeout(checkFiles,2500);
})();