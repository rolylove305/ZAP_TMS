(()=>{
const e=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const t=q.get('t')||'';
function note(x,b=false){const m=e('driverMsg');m.textContent=x;m.classList.toggle('bad',!!b)}
function dataUrl(file){return new Promise((ok,no)=>{const reader=new FileReader();reader.onload=()=>ok(reader.result);reader.onerror=no;reader.readAsDataURL(file)})}
async function saveDoc(){const f=e('docFile')?.files?.[0];if(!f)return note('Choose a file first.',true);if(f.size>4500000)return note('File too large. Send a smaller photo or PDF.',true);note('Saving document...');const d=await dataUrl(f);const a={};a['p_'+'token']=t;a.p_file_name=f.name;a.p_file_type=f.type||'file';a.p_file_data=d;const r=await client.rpc('driver_upload_document',a);if(r.error)return note(r.error.message,true);e('docFile').value='';note('Document uploaded and saved to this load.')}
setTimeout(()=>{const b=e('uploadBtn');if(b)b.onclick=saveDoc;const s=document.createElement('script');s.src='driver-state.js?v=1';document.body.appendChild(s);const g=document.createElement('script');g.src='driver-location.js?v=2';document.body.appendChild(g)},500);
})();