(()=>{
const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function findLoad(card,i){const arr=getLoads();const id=card?.dataset?.loadId;if(id){const hit=arr.find(x=>x.id===id);if(hit)return hit}return arr[i]}
async function uploadStorage(card,i){
  const l=findLoad(card,i); if(!l||!l.id)return alert('Sync first.');
  const input=document.createElement('input'); input.type='file'; input.accept='image/*,.pdf';
  input.onchange=async()=>{
    const file=input.files&&input.files[0]; if(!file)return;
    if(file.size>10*1024*1024)return alert('File is too large. Keep it under 10 MB.');
    const kind=prompt('Document type: Rate Confirmation, BOL, POD, Lumper Receipt, Invoice Copy, Other','Rate Confirmation')||'Document';
    const user=(await sb.auth.getSession()).data.session?.user; if(!user)return alert('Login again first.');
    const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=user.id+'/'+l.id+'/'+Date.now()+'_'+safe;
    const up=await sb.storage.from('load-documents').upload(path,file,{contentType:file.type||'application/octet-stream'});
    if(up.error)return alert('Storage upload error: '+up.error.message);
    const r=await sb.from('load_documents').insert({user_id:user.id,load_id:l.id,file_name:'['+kind+'] '+file.name,file_type:file.type||'application/octet-stream',storage_bucket:'load-documents',storage_path:path,uploaded_by:'dispatcher'});
    if(r.error)return alert('File uploaded, but TMS record failed: '+r.error.message);
    if(window.zapParseRateCon&&/rate/i.test(kind))return window.zapParseRateCon(l,kind,path);
    alert('Document uploaded to Storage.');
  };
  input.click();
}
function hook(){document.querySelectorAll('#loadsList .list-card').forEach((card,i)=>{const b=card.querySelector('.zap-upload-doc-btn');if(b){b.dataset.storage='1';b.onclick=()=>uploadStorage(card,i);b.textContent='Upload Doc';}})}
setInterval(hook,1000);
})();