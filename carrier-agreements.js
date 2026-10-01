(()=>{
const by=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const escAttr=v=>esc(v).replace(/"/g,"&quot;");
const endpoint=name=>`${window.ZAP_TMS_CONFIG.url}/functions/v1/${name}`;
let connection=null;
let agreementsByCarrier=new Map();
let lastAgreementsFetch=0;

async function authHeaders(){
  const {data,error}=await sb.auth.getSession();
  const token=data?.session?.access_token;
  if(error||!token)throw new Error("Login again first.");
  return {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
}

async function request(name,method="GET",body=null){
  const response=await fetch(endpoint(name),{method,headers:await authHeaders(),body:body?JSON.stringify(body):undefined});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||`Request failed (${response.status})`);
  return payload;
}

async function loadConnection(){
  try{connection=(await request("signwell-connect")).connection}
  catch{connection=null}
  return connection;
}

async function loadAgreements(force=false){
  const now=Date.now();
  if(!force&&now-lastAgreementsFetch<4000)return agreementsByCarrier;
  lastAgreementsFetch=now;
  const {data:rows,error}=await sb.from("carrier_agreements").select("carrier_id,status,signwell_document_id,sent_at,completed_at,storage_path").order("created_at",{ascending:false});
  if(error)return agreementsByCarrier;
  agreementsByCarrier=new Map();
  (rows||[]).forEach(row=>{if(!agreementsByCarrier.has(row.carrier_id))agreementsByCarrier.set(row.carrier_id,row)});
  return agreementsByCarrier;
}

function statusLabel(status){
  return ({draft:"Ready to review",sent:"Sent — awaiting signature",viewed:"Viewed by carrier",in_progress:"In progress",signed:"Signed ✓",declined:"Declined",expired:"Expired",canceled:"Canceled"})[status]||status;
}

const previewUrls=new Map(); // document_id -> embedded edit/preview URL, kept in memory only

async function viewSignedPdf(path){
  const r=await sb.storage.from("load-documents").createSignedUrl(path,3600);
  if(r.error)return alert("Could not open the signed agreement: "+r.error.message);
  window.open(r.data.signedUrl,"_blank");
}
window.zapViewCarrierAgreement=viewSignedPdf;

async function prepareAgreement(carrierId,btn){
  if(!connection||connection.status!=="connected"){alert("Connect your SignWell account first in Settings → Carrier Agreements.");return}
  if(!connection.template_id){alert("Save your SignWell template ID first in Settings → Carrier Agreements.");return}
  const original=btn.textContent;
  btn.disabled=true;btn.textContent="Preparing…";
  try{
    const result=await request("carrier-agreement-send","POST",{carrier_id:carrierId});
    if(result.preview_url)previewUrls.set(result.document_id,result.preview_url);
    await loadAgreements(true);
    renderCarrierButtons();
    if(result.preview_url)window.open(result.preview_url,"_blank");
    alert("Blank draft opened in a new tab — fill in the carrier's info there (SignWell saves as you type), then come back and click \"Confirm & Send\" to actually send it. Nothing has been sent yet.");
  }catch(error){
    alert("Could not prepare agreement: "+(error.message||String(error)));
  }finally{
    btn.disabled=false;btn.textContent=original;
  }
}
window.zapPrepareCarrierAgreement=prepareAgreement;

async function confirmSend(documentId,carrierId,btn){
  const carrier=(window.appData&&window.appData.carriers||[]).find(c=>c.id===carrierId);
  const name=carrier?.name||"this carrier";
  const email=carrier?.email||"(no email on file)";
  if(!confirm(`Send this agreement to ${name} (${email}) for e-signature now?\n\nThis uses 1 of your SignWell sends for this month — it cannot be undone.`))return;
  const original=btn.textContent;
  btn.disabled=true;btn.textContent="Sending…";
  try{
    await request("carrier-agreement-confirm","POST",{document_id:documentId});
    previewUrls.delete(documentId);
    await loadAgreements(true);
    renderCarrierButtons();
    alert("Sent — the carrier will get an email from SignWell to sign. They can sign right from their phone by opening that email on it, no app needed.");
  }catch(error){
    alert("Could not send: "+(error.message||String(error)));
  }finally{
    btn.disabled=false;btn.textContent=original;
  }
}
window.zapConfirmSendCarrierAgreement=confirmSend;

function renderCarrierButtons(){
  const list=by("carriersList");
  if(!list)return;
  const cards=list.querySelectorAll(".list-card");
  const carriers=(window.appData&&window.appData.carriers)||[];
  cards.forEach((card,i)=>{
    const carrier=carriers[i];
    if(!carrier||!carrier.id)return;
    let actions=card.querySelector(".card-actions");
    if(!actions)return;
    let slot=card.querySelector(".ca-agreement-row");
    if(!slot){
      slot=document.createElement("div");
      slot.className="ca-agreement-row";
      slot.style.marginTop="6px";
      actions.after(slot);
    }
    const agreement=agreementsByCarrier.get(carrier.id);
    const connected=connection&&connection.status==="connected"&&connection.template_id;
    let html="";
    if(agreement){
      html+=`<span class="pill ${agreement.status==='signed'?'green':''}">${esc(statusLabel(agreement.status))}</span> `;
      if(agreement.status==="signed"&&agreement.storage_path){
        html+=`<button class="small-btn" onclick="zapViewCarrierAgreement('${escAttr(agreement.storage_path)}')">View signed PDF</button> `;
      }
    }
    if(agreement&&agreement.status==="draft"){
      const docId=agreement.signwell_document_id;
      const url=docId&&previewUrls.get(docId);
      if(url)html+=`<button class="small-btn" onclick="window.open('${escAttr(url)}','_blank')">Fill in / review draft</button> `;
      html+=`<button class="small-btn primary-btn" ${docId?"":"disabled"} onclick="zapConfirmSendCarrierAgreement('${escAttr(docId||"")}','${escAttr(carrier.id)}',this)">Confirm &amp; Send</button>`;
    }else{
      html+=`<button class="small-btn" ${connected?"":"disabled title=\"Connect SignWell in Settings first\""} onclick="zapPrepareCarrierAgreement('${escAttr(carrier.id)}',this)">${agreement?"Resend":"Prepare"} Agreement</button>`;
    }
    slot.innerHTML=html;
  });
}

function settingsHtml(){
  const c=connection;
  const statusLine=c&&c.status==="connected"
    ?`Connected as <b>${esc(c.account_email||"")}</b>`
    :"Not connected.";
  const templateLine=c&&c.template_id
    ?`Template saved: <code>${esc(c.template_id)}</code>`
    :"No template saved yet.";
  return `<h2>📝 Carrier Agreements (SignWell)</h2>
    <p class="muted">Send your carrier/dispatcher agreement for e-signature straight from the TMS. Each dispatcher connects their own SignWell account.</p>
    <p>${statusLine}<br>${templateLine}</p>
    <div class="grid-2">
      <label>SignWell API key<input id="caApiKey" type="password" placeholder="Paste your SignWell API key"></label>
      <label>Template ID<input id="caTemplateId" placeholder="From your SignWell template URL" value="${escAttr(c?.template_id||"")}"></label>
    </div>
    <div class="card-actions">
      <button class="small-btn primary-btn" id="caConnect">Save & Connect</button>
      <button class="small-btn" id="caSaveTemplate">Save Template ID</button>
      ${c?'<button class="small-btn" id="caDisconnect" style="border-color:rgba(251,113,133,.45);color:#fda4af">Disconnect</button>':""}
    </div>
    <p class="muted" style="margin-top:10px;font-size:12px">One-time setup: in SignWell, upload your agreement PDF and create a Template with two signer roles named exactly <b>Dispatcher</b> and <b>Carrier</b> (signature + date for each). Then paste your API key and the Template ID here. "Prepare Agreement" opens a blank draft for you to fill in by hand before sending — no field setup needed.</p>`;
}

async function renderSettingsCard(){
  const settings=by("settings");
  if(!settings||by("carrierAgreementsCard"))return;
  const card=document.createElement("div");
  card.className="card";
  card.id="carrierAgreementsCard";
  const header=settings.querySelector(".section-title");
  if(header)header.after(card);else settings.prepend(card);
  await loadConnection();
  card.innerHTML=settingsHtml();
  by("caConnect").onclick=async()=>{
    const apiKey=by("caApiKey").value.trim();
    if(!apiKey)return alert("Paste your SignWell API key first.");
    const templateId=by("caTemplateId").value.trim();
    try{
      await request("signwell-connect","POST",{api_key:apiKey,template_id:templateId||null});
      await loadConnection();
      card.innerHTML=settingsHtml();
      wireSettingsButtons(card);
      alert("Connected to SignWell.");
    }catch(error){alert("Could not connect: "+(error.message||String(error)))}
  };
  wireSettingsButtons(card);
}

function wireSettingsButtons(card){
  const saveTplBtn=card.querySelector("#caSaveTemplate");
  if(saveTplBtn)saveTplBtn.onclick=async()=>{
    const templateId=by("caTemplateId").value.trim();
    if(!templateId)return alert("Enter a Template ID first.");
    try{
      await request("signwell-connect","POST",{template_id:templateId});
      await loadConnection();
      alert("Template ID saved.");
    }catch(error){alert("Could not save: "+(error.message||String(error)))}
  };
  const discBtn=card.querySelector("#caDisconnect");
  if(discBtn)discBtn.onclick=async()=>{
    if(!confirm("Disconnect your SignWell account?"))return;
    try{
      await request("signwell-connect","DELETE");
      connection=null;
      card.innerHTML=settingsHtml();
      wireSettingsButtons(card);
    }catch(error){alert("Could not disconnect: "+(error.message||String(error)))}
  };
}

async function tick(){
  if(typeof accountType!=="undefined"&&accountType!=="dispatcher")return;
  await renderSettingsCard();
  if(by("carriersList")){
    if(!connection)await loadConnection();
    await loadAgreements();
    renderCarrierButtons();
  }
}
setInterval(tick,1500);
})();
