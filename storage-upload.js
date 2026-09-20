(()=>{
const getLoads=()=>{try{return JSON.parse(localStorage.getItem('loads')||'[]')}catch{return[]}};
function findLoad(card,i){const arr=getLoads();const id=card?.dataset?.loadId;if(id){const hit=arr.find(x=>x.id===id);if(hit)return hit}return arr[i]}

function extractFileFromClipboard(dt){
  if(!dt)return null;
  if(dt.files&&dt.files.length)return dt.files[0];
  for(const item of dt.items||[]){
    if(item.kind==='file'){const f=item.getAsFile();if(f)return f}
  }
  return null;
}

async function saveFile(l,file){
  if(file.size>10*1024*1024)return alert('File is too large. Keep it under 10 MB.');
  const kind=prompt('Document type: Rate Confirmation, BOL, POD, Lumper Receipt, Invoice Copy, Other','Rate Confirmation')||'Document';
  const user=(await sb.auth.getSession()).data.session?.user; if(!user)return alert('Login again first.');
  /* pasted images usually arrive with a generic/blank name */
  const name=file.name&&!/^image\.\w+$/i.test(file.name)?file.name:'pasted-image.'+((file.type.split('/')[1])||'png');
  const safe=name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=user.id+'/'+l.id+'/'+Date.now()+'_'+safe;
  const up=await sb.storage.from('load-documents').upload(path,file,{contentType:file.type||'application/octet-stream'});
  if(up.error)return alert('Storage upload error: '+up.error.message);
  const r=await sb.from('load_documents').insert({user_id:user.id,load_id:l.id,file_name:'['+kind+'] '+name,file_type:file.type||'application/octet-stream',storage_bucket:'load-documents',storage_path:path,uploaded_by:'dispatcher'});
  if(r.error)return alert('File uploaded, but TMS record failed: '+r.error.message);
  if(window.zapParseRateCon&&/rate/i.test(kind))return window.zapParseRateCon(l,kind,path);
  alert('Document uploaded to Storage.');
}

function pickFromDisk(l){
  const input=document.createElement('input'); input.type='file'; input.accept='image/*,.pdf';
  input.onchange=()=>{const file=input.files&&input.files[0]; if(!file)return; saveFile(l,file)};
  input.click();
}

function openUploadModal(l){
  let m=document.getElementById('zapUploadModal');
  if(!m){m=document.createElement('div');m.id='zapUploadModal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(m)}
  m.innerHTML='<div class="card" style="width:min(420px,96vw)">'
    +'<div class="section-title"><h2>Upload Document</h2><button class="small-btn" id="zapUpClose">Close</button></div>'
    +'<p class="muted">Copy an image or file (screenshot, "Copy Image", a file from your file manager) and paste it here — no need to save it to a folder first.</p>'
    +'<div id="zapPasteZone" tabindex="0" style="border:2px dashed var(--line);border-radius:14px;padding:28px 14px;text-align:center;outline:none;margin:10px 0">'
      +'<p style="margin:0;font-size:28px">📋</p>'
      +'<p class="muted" id="zapPasteHint" style="margin:8px 0 0">Click here, then press Ctrl+V (Cmd+V on Mac) to paste</p>'
    +'</div>'
    +'<div class="card-actions"><button class="small-btn" id="zapUpChoose">Choose file instead</button></div>';
  const zone=m.querySelector('#zapPasteZone');
  const hint=m.querySelector('#zapPasteHint');
  function onPaste(e){
    const file=extractFileFromClipboard(e.clipboardData);
    if(!file){hint.textContent='Nothing usable in the clipboard — copy an image or file first, or choose one below.';return}
    e.preventDefault();
    cleanup();
    m.remove();
    saveFile(l,file);
  }
  function cleanup(){document.removeEventListener('paste',onPaste)}
  document.addEventListener('paste',onPaste);
  m.querySelector('#zapUpClose').onclick=()=>{cleanup();m.remove()};
  m.onclick=e=>{if(e.target===m){cleanup();m.remove()}};
  m.querySelector('#zapUpChoose').onclick=()=>{cleanup();m.remove();pickFromDisk(l)};
  zone.focus();
}

function hook(){document.querySelectorAll('#loadsList .list-card').forEach((card,i)=>{const b=card.querySelector('.zap-upload-doc-btn');if(b){b.dataset.storage='1';b.onclick=()=>{const l=findLoad(card,i);if(!l||!l.id)return alert('Sync first.');openUploadModal(l)};b.textContent='Upload Doc';}})}
setInterval(hook,1000);
})();
