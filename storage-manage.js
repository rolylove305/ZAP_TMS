(()=>{
const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
async function urlFor(d){if(d.storage_path){const r=await sb.storage.from('load-documents').createSignedUrl(d.storage_path,3600);return r.error?'':r.data.signedUrl}return d.file_data||''}
async function manageDocsStorage(i){
  const l=getLoads()[i]; if(!l||!l.id)return alert('Sync first.');
  const r=await sb.from('load_documents').select('id,file_name,file_data,storage_path,created_at').eq('load_id',l.id).order('created_at',{ascending:false});
  if(r.error)return alert(r.error.message);
  let modal=document.getElementById('zapDocsModal');
  if(!modal){modal=document.createElement('div');modal.id='zapDocsModal';modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(modal)}
  const docs=r.data||[]; const parts=[];
  for(const d of docs){const u=await urlFor(d);parts.push('<div class="card" style="margin:10px 0;padding:12px"><b>'+esc(d.file_name||'Document')+'</b><p class="muted">'+esc(new Date(d.created_at).toLocaleString())+(d.storage_path?' • Storage':' • Legacy')+'</p><div style="display:flex;gap:8px;flex-wrap:wrap">'+(u?'<a class="small-btn" href="'+u+'" target="_blank" download="'+esc(d.file_name||'document')+'">Open / Download</a>':'')+'<button class="small-btn zap-delete-doc" data-id="'+esc(d.id)+'">Delete</button></div></div>')}
  modal.innerHTML='<div class="card" style="width:min(760px,96vw);max-height:88vh;overflow:auto"><div class="section-title"><h2>Load Documents</h2><button class="small-btn" id="zapCloseDocs">Close</button></div><p class="muted">Storage links expire after 1 hour for security. Reopen Manage Docs for a fresh link.</p>'+(parts.length?parts.join(''):'<p class="muted">No documents saved for this load yet.</p>')+'</div>';
  document.getElementById('zapCloseDocs').onclick=()=>modal.remove();
  modal.querySelectorAll('.zap-delete-doc').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this document from the TMS list?'))return;const del=await sb.from('load_documents').delete().eq('id',b.dataset.id);if(del.error)return alert(del.error.message);alert('Document deleted.');manageDocsStorage(i)})
}
function hook(){document.querySelectorAll('#loadsList .list-card').forEach((card,i)=>{const b=card.querySelector('.zap-manage-docs-btn');if(b&&!b.dataset.storageManage){b.dataset.storageManage='1';b.onclick=()=>manageDocsStorage(i);}})}
setInterval(hook,1000);
})();