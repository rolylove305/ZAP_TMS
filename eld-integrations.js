(()=>{
  const by=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const endpoint=()=>`${window.ZAP_TMS_CONFIG.url}/functions/v1/eld-gateway`;
  let connections=[];

  async function authHeaders(){
    const {data,error}=await sb.auth.getSession();
    const token=data?.session?.access_token;
    if(error||!token)throw new Error("Login again before managing ELD integrations.");
    return {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  }

  async function api(method="GET",body=null,query=""){
    const response=await fetch(endpoint()+query,{method,headers:await authHeaders(),body:body?JSON.stringify(body):undefined});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`ELD request failed (${response.status})`);
    return payload;
  }

  function ensureUi(){
    const settings=by("settings");
    if(!settings||by("eldIntegrationsCard"))return;
    const card=document.createElement("div");
    card.className="card";
    card.id="eldIntegrationsCard";
    card.innerHTML=`
      <div class="section-title"><h2>ELD Integrations</h2><button type="button" class="small-btn" id="eldRefresh">Refresh</button></div>
      <p class="muted">Connect each carrier to its own ELD provider. API keys are encrypted and used only by the Supabase Edge Function.</p>
      <div class="form-grid">
        <label>Carrier<select id="eldCarrier"><option value="">No carrier selected</option></select></label>
        <label>Provider<select id="eldProvider"><option value="nextfleet">Next Fleet ELD</option></select></label>
        <label>Connection name<input id="eldDisplayName" placeholder="Estrella Trucking — Next Fleet"></label>
        <label>API key<input id="eldApiKey" type="password" autocomplete="new-password" placeholder="Paste once; it will not be shown again"></label>
      </div>
      <div class="card-actions" style="margin-top:12px"><button type="button" class="primary-btn" id="eldConnect">Test & Connect</button></div>
      <p class="muted" id="eldMessage"></p>
      <div id="eldConnectionsList" class="list"></div>`;
    const refreshCard=settings.querySelector("#syncNow")?.closest(".card");
    if(refreshCard)refreshCard.before(card);else settings.appendChild(card);
    by("eldConnect").onclick=connect;
    by("eldRefresh").onclick=loadConnections;
  }

  function fillCarriers(){
    const select=by("eldCarrier");
    if(!select)return;
    const old=select.value;
    const carriers=(typeof appData!=="undefined"&&Array.isArray(appData.carriers))?appData.carriers:[];
    select.innerHTML='<option value="">No carrier selected</option>'+carriers.map(c=>`<option value="${esc(c.id||"")}">${esc(c.name||"Unnamed carrier")}</option>`).join("");
    select.value=old;
  }

  function say(text,bad=false){
    const node=by("eldMessage");
    if(!node)return;
    node.textContent=text||"";
    node.classList.toggle("bad",!!bad);
  }

  function statusLabel(status){
    if(status==="connected")return "🟢 Connected";
    if(status==="error")return "🔴 Error";
    if(status==="disabled")return "⚪ Disabled";
    return "🟡 Pending";
  }

  function carrierName(id){
    const carriers=(typeof appData!=="undefined"&&Array.isArray(appData.carriers))?appData.carriers:[];
    return carriers.find(c=>String(c.id)===String(id))?.name||"Not assigned";
  }

  function renderConnections(){
    const list=by("eldConnectionsList");
    if(!list)return;
    if(!connections.length){list.innerHTML='<div class="card"><p class="muted">No ELD connections yet.</p></div>';return}
    list.innerHTML=connections.map(c=>`
      <div class="list-card" data-eld-id="${esc(c.id)}">
        <h3>${esc(c.display_name)}</h3>
        <p class="muted">${esc(c.provider==="nextfleet"?"Next Fleet ELD":c.provider)} • ${esc(carrierName(c.carrier_id))}</p>
        <div class="pill-row"><span class="pill">${esc(statusLabel(c.status))}</span>${c.last_synced_at?`<span class="pill">Synced ${esc(new Date(c.last_synced_at).toLocaleString())}</span>`:""}</div>
        ${c.last_error?`<p class="bad">${esc(c.last_error)}</p>`:""}
        <div class="card-actions">
          <button type="button" class="small-btn eld-test">Test</button>
          <button type="button" class="small-btn eld-sync">Sync drivers & devices</button>
          <button type="button" class="small-btn eld-view">View synced data</button>
          <button type="button" class="small-btn eld-delete">Disconnect</button>
        </div>
        <div class="eld-data"></div>
      </div>`).join("");
    list.querySelectorAll("[data-eld-id]").forEach(card=>{
      const id=card.dataset.eldId;
      card.querySelector(".eld-test").onclick=()=>runAction(id,"test_connection","Connection successful.");
      card.querySelector(".eld-sync").onclick=()=>syncConnection(id);
      card.querySelector(".eld-view").onclick=()=>viewData(id,card.querySelector(".eld-data"));
      card.querySelector(".eld-delete").onclick=()=>removeConnection(id);
    });
  }

  async function connect(){
    const displayName=by("eldDisplayName").value.trim();
    const apiKey=by("eldApiKey").value.trim();
    if(!displayName||!apiKey)return say("Connection name and API key are required.",true);
    const button=by("eldConnect");button.disabled=true;say("Testing Next Fleet connection...");
    try{
      await api("POST",{action:"save_connection",provider:by("eldProvider").value,carrier_id:by("eldCarrier").value||null,display_name:displayName,api_key:apiKey});
      by("eldApiKey").value="";
      say("Connected securely. The API key is encrypted on the server.");
      await loadConnections();
    }catch(error){say(error.message,true)}finally{button.disabled=false}
  }

  async function loadConnections(){
    ensureUi();fillCarriers();say("Loading ELD connections...");
    try{
      const payload=await api();connections=payload.connections||[];renderConnections();say("");
    }catch(error){say(error.message,true)}
  }

  async function runAction(connectionId,action,success){
    say("Working...");
    try{await api("POST",{action,connection_id:connectionId});say(success);await loadConnections()}catch(error){say(error.message,true)}
  }

  async function syncConnection(connectionId){
    say("Syncing Next Fleet drivers, GPS devices and ELD devices...");
    try{
      const result=await api("POST",{action:"sync",connection_id:connectionId});
      say(`Sync complete: ${result.drivers||0} drivers, ${result.gpsDevices||0} GPS devices, ${result.eldDevices||0} ELD devices.`);
      await loadConnections();
    }catch(error){say(error.message,true)}
  }

  async function viewData(connectionId,target){
    target.innerHTML='<p class="muted">Loading synced records...</p>';
    try{
      const payload=await api("GET",null,`?connection_id=${encodeURIComponent(connectionId)}`);
      const drivers=payload.drivers||[],devices=payload.devices||[];
      target.innerHTML=`
        <div class="card" style="margin-top:10px"><h3>Drivers (${drivers.length})</h3>${drivers.length?drivers.slice(0,100).map(d=>`<p>${esc(d.driver_name||d.external_id)}${d.phone?` • ${esc(d.phone)}`:""}${d.status?` • ${esc(d.status)}`:""}</p>`).join(""):'<p class="muted">No synced drivers.</p>'}</div>
        <div class="card" style="margin-top:10px"><h3>Devices (${devices.length})</h3>${devices.length?devices.slice(0,100).map(d=>`<p>${esc((d.device_type||"").toUpperCase())} • ${esc(d.vehicle_id||d.external_id)}${d.serial_number?` • ${esc(d.serial_number)}`:""}${d.status?` • ${esc(d.status)}`:""}</p>`).join(""):'<p class="muted">No synced devices.</p>'}</div>`;
    }catch(error){target.innerHTML=`<p class="bad">${esc(error.message)}</p>`}
  }

  async function removeConnection(connectionId){
    if(!confirm("Disconnect this ELD connection and remove its synced records?"))return;
    try{await api("POST",{action:"delete_connection",connection_id:connectionId});say("ELD connection removed.");await loadConnections()}catch(error){say(error.message,true)}
  }

  function boot(){ensureUi();fillCarriers();setTimeout(loadConnections,800)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
  document.addEventListener("click",event=>{if(event.target.closest('[data-screen="settings"]'))setTimeout(()=>{ensureUi();fillCarriers();loadConnections()},250)});
})();
