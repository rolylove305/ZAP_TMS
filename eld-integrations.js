(()=>{
  const by=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const endpoint=()=>`${window.ZAP_TMS_CONFIG.url}/functions/v1/eld-gateway`;
  const hosEndpoint=()=>`${window.ZAP_TMS_CONFIG.url}/functions/v1/eld-hos`;
  let connections=[];
  let hosDrivers=[];
  let hosError="";
  let hiddenDriverNames=new Set();
  window.eldHostData={getDrivers:()=>hosDrivers,getConnections:()=>connections};

  function driverKey(value){
    return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  }

  async function loadHiddenDriverNames(){
    hiddenDriverNames=new Set();
    const {data,error}=await sb.from("driver_locates").select("driver_name,active");
    if(error)return;
    const states=new Map();
    (data||[]).forEach(row=>{
      const key=driverKey(row.driver_name);
      if(!key)return;
      const state=states.get(key)||{hasActive:false};
      if(row.active)state.hasActive=true;
      states.set(key,state);
    });
    states.forEach((state,key)=>{if(!state.hasActive)hiddenDriverNames.add(key)});
  }

  async function authHeaders(){
    const {data,error}=await sb.auth.getSession();
    const token=data?.session?.access_token;
    if(error||!token)throw new Error("Login again before managing ELD integrations.");
    return {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  }

  async function request(url,method="GET",body=null){
    const response=await fetch(url,{method,headers:await authHeaders(),body:body?JSON.stringify(body):undefined});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`ELD request failed (${response.status})`);
    return payload;
  }

  const api=(method="GET",body=null,query="")=>request(endpoint()+query,method,body);
  const hosApi=(method="GET",body=null,query="")=>request(hosEndpoint()+query,method,body);

  function ensureUi(){
    const settings=by("settings");
    if(settings&&!by("eldIntegrationsCard")){
      const card=document.createElement("div");
      card.className="card";
      card.id="eldIntegrationsCard";
      card.innerHTML=`
        <div class="section-title"><h2>ELD Integrations</h2><button type="button" class="small-btn" id="eldRefresh">Refresh</button></div>
        <p class="muted">Connect each carrier to its own ELD provider. API keys are encrypted and used only by Supabase Edge Functions.</p>
        <div class="form-grid">
          <label>Carrier<select id="eldCarrier"><option value="">No carrier selected</option></select></label>
          <label>Provider<select id="eldProvider"><option value="nextfleet">Next Fleet ELD</option><option value="apollo">Apollo ELD</option></select></label>
          <label>Connection name<input id="eldDisplayName" placeholder="Carrier — Next Fleet"></label>
          <label><span id="eldApiKeyLabel">API key</span><input id="eldApiKey" type="password" autocomplete="new-password" placeholder="Paste once; it will not be shown again"></label>
        </div>
        <div class="card-actions" style="margin-top:12px"><button type="button" class="primary-btn" id="eldConnect">Test & Connect</button></div>
        <p class="muted" id="eldMessage"></p>
        <div id="eldConnectionsList" class="list"></div>`;
      const refreshCard=settings.querySelector("#syncNow")?.closest(".card");
      if(refreshCard)refreshCard.before(card);else settings.appendChild(card);
      by("eldConnect").onclick=connect;
      by("eldRefresh").onclick=loadConnections;
      by("eldProvider").onchange=updateProviderUi;
      updateProviderUi();
    }
    ensureHosUi();
  }

  function ensureHosUi(){
    const dashboard=by("dashboard");
    if(!dashboard||by("eldHosDashboardCard"))return;
    const card=document.createElement("div");
    card.className="card hos-dashboard-card";
    card.id="eldHosDashboardCard";
    card.innerHTML=`
      <div class="section-title">
        <h2>Driver HOS</h2>
        <button type="button" class="small-btn" id="eldHosRefresh">Refresh HOS</button>
      </div>
      <div class="form-grid">
        <label>Driver<select id="eldHosDriver"><option value="">No HOS drivers synced</option></select></label>
      </div>
      <p class="muted" id="eldHosStatus">Connect and sync an ELD provider to display real driver clocks.</p>
      <div id="eldHosSummary"></div>
      <div id="eldHosClocks" class="hos-clocks-layout"></div>`;
    const hero=dashboard.querySelector(".hero-card");
    if(hero)hero.after(card);else dashboard.prepend(card);
    by("eldHosDriver").onchange=renderSelectedHos;
    by("eldHosRefresh").onclick=refreshHos;
  }

  function fillCarriers(){
    const select=by("eldCarrier");
    if(!select)return;
    const old=select.value;
    const carriers=(typeof appData!=="undefined"&&Array.isArray(appData.carriers))?appData.carriers:[];
    select.innerHTML='<option value="">No carrier selected</option>'+carriers.map(c=>`<option value="${esc(c.id||"")}">${esc(c.name||"Unnamed carrier")}</option>`).join("");
    select.value=old;
  }

  function providerName(provider){
    if(provider==="nextfleet")return "Next Fleet ELD";
    if(provider==="apollo")return "Apollo ELD";
    return provider||"ELD";
  }

  function updateProviderUi(){
    const provider=by("eldProvider")?.value||"nextfleet";
    const name=providerName(provider).replace(" ELD","");
    const display=by("eldDisplayName");
    const label=by("eldApiKeyLabel");
    if(display)display.placeholder=`Carrier — ${name}`;
    if(label)label.textContent=provider==="apollo"?"Apollo HOS Client API key":"API key";
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

  function formatMinutes(value){
    if(value===null||value===undefined||value==="")return "—";
    const total=Math.max(0,Number(value)||0);
    const hours=Math.floor(total/60);
    const minutes=Math.floor(total%60);
    return `${hours}:${String(minutes).padStart(2,"0")}`;
  }

  function numericMinutes(value){
    if(value===null||value===undefined||value==="")return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?Math.max(0,parsed):null;
  }

  function cycleLimitMinutes(driver){
    const ruleSet=Number(driver?.raw_data?.HOSRuleSetId);
    const limits={0:60*60,1:70*60,2:80*60,3:60*60,4:70*60,5:70*60,6:120*60,7:70*60,9:60*60,10:70*60,11:70*60,12:80*60,13:60*60,14:70*60};
    return limits[ruleSet]||70*60;
  }

  function gaugeTone(value,label,dutyStatus){
    const minutes=numericMinutes(value);
    if(minutes===null)return "unknown";
    const duty=String(dutyStatus||"").toUpperCase().replace(/[\s_-]+/g,"");
    const active=["D","DRIVING","ON","ONDUTY","YM","YARDMOVE"].includes(duty);
    if(label==="Until Break"&&!active)return "normal";
    if(minutes<=60)return "critical";
    if(minutes<=120)return "warning";
    return "normal";
  }

  function hosGauge(label,value,maxMinutes,dutyStatus){
    const minutes=numericMinutes(value);
    const ratio=minutes===null?0:Math.min(1,Math.max(0,minutes/maxMinutes));
    const angle=Math.round(ratio*360);
    const tone=gaugeTone(value,label,dutyStatus);
    const display=formatMinutes(value);
    return `<article class="hos-gauge hos-gauge--${tone}" aria-label="${esc(label)}: ${esc(display)} remaining">
      <div class="hos-gauge-ring" style="--gauge-angle:${angle}deg">
        <div class="hos-gauge-center"><strong>${esc(display)}</strong><span>remaining</span></div>
      </div>
      <h3>${esc(label)}</h3>
    </article>`;
  }

  function hosAlert(driver){
    const duty=String(driver?.duty_status||"").toUpperCase().replace(/[\s_-]+/g,"");
    const active=["D","DRIVING","ON","ONDUTY","YM","YARDMOVE"].includes(duty);
    const metrics=[
      {label:"Drive",value:numericMinutes(driver?.drive_minutes)},
      {label:"Shift",value:numericMinutes(driver?.shift_minutes)},
      {label:"Cycle",value:numericMinutes(driver?.cycle_minutes)}
    ];
    if(active)metrics.push({label:"Break",value:numericMinutes(driver?.break_minutes)});
    const available=metrics.filter(metric=>metric.value!==null).sort((a,b)=>a.value-b.value);
    if(!available.length)return {tone:"neutral",text:"Waiting for complete HOS clocks from the ELD."};
    const lowest=available[0];
    if(lowest.value<=60)return {tone:"critical",text:`Critical: only ${formatMinutes(lowest.value)} of ${lowest.label} remaining.`};
    if(lowest.value<=120)return {tone:"warning",text:`Attention: ${formatMinutes(lowest.value)} of ${lowest.label} remaining.`};
    return {tone:"good",text:"HOS clocks are within the available range."};
  }

  function renderHosDashboard(){
    ensureHosUi();
    const select=by("eldHosDriver");
    const status=by("eldHosStatus");
    const summary=by("eldHosSummary");
    const clocks=by("eldHosClocks");
    if(!select||!status||!summary||!clocks)return;

    const old=select.value;
    if(!hosDrivers.length){
      select.innerHTML='<option value="">No HOS drivers synced</option>';
      status.textContent=hosError||"Press Refresh HOS or sync the ELD connection.";
      status.classList.toggle("bad",!!hosError);
      summary.innerHTML="";
      clocks.innerHTML="";
      return;
    }

    select.innerHTML=hosDrivers.map((driver,index)=>{
      const key=`${driver.connection_id}|${driver.external_id}|${index}`;
      return `<option value="${esc(key)}">${esc(driver.driver_name||driver.external_id)}${driver.vehicle_id?` — Truck ${esc(driver.vehicle_id)}`:""}</option>`;
    }).join("");
    if([...select.options].some(option=>option.value===old))select.value=old;
    status.classList.remove("bad");
    renderSelectedHos();
  }

  function renderSelectedHos(){
    const select=by("eldHosDriver");
    const status=by("eldHosStatus");
    const summary=by("eldHosSummary");
    const clocks=by("eldHosClocks");
    if(!select||!status||!summary||!clocks)return;
    const index=Number((select.value.split("|").pop()||"0"));
    const driver=hosDrivers[index]||hosDrivers[0];
    if(!driver)return renderHosDashboard();

    const duty=(driver.duty_status||"Unknown").replace(/_/g," ");
    status.textContent=`${duty}${driver.duty_status_duration?` • ${driver.duty_status_duration}`:""}${driver.last_hos_sync?` • Last HOS sync ${driver.last_hos_sync}`:""}`;
    const alert=hosAlert(driver);
    const dutyTone=["OFF","SB","SLEEPER","OFFDUTY"].includes(String(driver.duty_status||"").toUpperCase().replace(/[\s_-]+/g,""))?"good":"active";
    summary.innerHTML=`<div class="hos-driver-summary">
      <div class="hos-driver-title">
        <div><span class="muted">Selected driver</span><strong>${esc(driver.driver_name||driver.external_id)}</strong></div>
        <span class="hos-duty-badge hos-duty-badge--${dutyTone}">${esc(duty)}</span>
      </div>
      <div class="pill-row">
        ${driver.vehicle_id?`<span class="pill">Truck: ${esc(driver.vehicle_id)}</span>`:""}
        ${driver.trailer_id?`<span class="pill">Trailer: ${esc(driver.trailer_id)}</span>`:""}
        ${driver.connection_name?`<span class="pill">${esc(driver.connection_name)}</span>`:""}
      </div>
      <div class="hos-alert hos-alert--${alert.tone}">${esc(alert.text)}</div>
    </div>`;
    clocks.innerHTML=`
      <div class="hos-gauge-grid">
        ${hosGauge("Until Break",driver.break_minutes,8*60,driver.duty_status)}
        ${hosGauge("Drive",driver.drive_minutes,11*60,driver.duty_status)}
        ${hosGauge("Shift",driver.shift_minutes,14*60,driver.duty_status)}
        ${hosGauge("Cycle",driver.cycle_minutes,cycleLimitMinutes(driver),driver.duty_status)}
      </div>
      <div class="hos-tomorrow">
        <div class="hos-reset-grid">
          <div class="hos-reset-item">
            <div><span class="hos-tomorrow-icon">⏱</span><span>Time to new shift</span></div>
            <strong>${esc(formatMinutes(driver.break_minutes))}</strong>
          </div>
          <div class="hos-reset-item">
            <div><span class="hos-tomorrow-icon">↻</span><span>Time for 34h reset</span></div>
            <strong>${esc(formatMinutes(driver.cycle_tomorrow_minutes))}</strong>
          </div>
        </div>
      </div>`;
  }

  function renderConnections(){
    const list=by("eldConnectionsList");
    if(!list)return;
    if(!connections.length){list.innerHTML='<div class="card"><p class="muted">No ELD connections yet.</p></div>';return}
    list.innerHTML=connections.map(c=>`
      <div class="list-card" data-eld-id="${esc(c.id)}">
        <h3>${esc(c.display_name)}</h3>
        <p class="muted">${esc(providerName(c.provider))} • ${esc(carrierName(c.carrier_id))}</p>
        <div class="pill-row"><span class="pill">${esc(statusLabel(c.status))}</span>${c.last_synced_at?`<span class="pill">Synced ${esc(new Date(c.last_synced_at).toLocaleString())}</span>`:""}</div>
        ${c.last_error?`<p class="bad">${esc(c.last_error)}</p>`:""}
        <div class="card-actions">
          <button type="button" class="small-btn eld-test">Test</button>
          <button type="button" class="small-btn eld-sync">Sync drivers, devices & HOS</button>
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
    const provider=by("eldProvider").value;
    const button=by("eldConnect");button.disabled=true;say(`Testing ${providerName(provider)} connection...`);
    try{
      await api("POST",{action:"save_connection",provider,carrier_id:by("eldCarrier").value||null,display_name:displayName,api_key:apiKey});
      by("eldApiKey").value="";
      say("Connected securely. The API key is encrypted on the server.");
      await loadConnections();
    }catch(error){say(error.message,true)}finally{button.disabled=false}
  }

  async function loadConnections(){
    ensureUi();fillCarriers();say("Loading ELD connections...");
    try{
      const payload=await api();
      connections=payload.connections||[];
      renderConnections();
      say("");
      await loadHos(false);
    }catch(error){say(error.message,true)}
  }

  async function loadHos(sync){
    hosDrivers=[];hosError="";
    if(!connections.length){renderHosDashboard();return}
    await loadHiddenDriverNames();
    for(const connection of connections){
      try{
        const payload=sync
          ?await hosApi("POST",{connection_id:connection.id})
          :await hosApi("GET",null,`?connection_id=${encodeURIComponent(connection.id)}`);
        (payload.drivers||[]).filter(driver=>!hiddenDriverNames.has(driverKey(driver.driver_name))).forEach(driver=>hosDrivers.push({...driver,connection_id:connection.id,connection_name:connection.display_name}));
      }catch(error){
        hosError=error.message;
      }
    }
    renderHosDashboard();
  }

  async function refreshHos(){
    const button=by("eldHosRefresh");
    if(button)button.disabled=true;
    const status=by("eldHosStatus");
    if(status)status.textContent="Syncing live HOS clocks from connected ELD providers...";
    try{await loadHos(true)}finally{if(button)button.disabled=false}
  }

  async function runAction(connectionId,action,success){
    say("Working...");
    try{await api("POST",{action,connection_id:connectionId});say(success);await loadConnections()}catch(error){say(error.message,true)}
  }

  async function syncConnection(connectionId){
    const provider=connections.find(item=>String(item.id)===String(connectionId))?.provider;
    say(`Syncing ${providerName(provider)} drivers, devices and HOS clocks...`);
    try{
      const result=await api("POST",{action:"sync",connection_id:connectionId});
      let hosCount=0,hosWarning="";
      try{
        const hos=await hosApi("POST",{connection_id:connectionId});
        hosCount=(hos.drivers||[]).length;
      }catch(error){hosWarning=error.message}
      say(`Sync complete: ${result.drivers||0} drivers, ${result.gpsDevices||0} GPS, ${result.eldDevices||0} ELD, ${hosCount} HOS profile${hosCount===1?"":"s"}.${hosWarning?` HOS: ${hosWarning}`:""}`,!!hosWarning);
      await loadConnections();
    }catch(error){say(error.message,true)}
  }

  async function viewData(connectionId,target){
    target.innerHTML='<p class="muted">Loading synced records...</p>';
    try{
      const [payload,hos]=await Promise.all([
        api("GET",null,`?connection_id=${encodeURIComponent(connectionId)}`),
        hosApi("GET",null,`?connection_id=${encodeURIComponent(connectionId)}`).catch(()=>({drivers:[]}))
      ]);
      const drivers=payload.drivers||[],devices=payload.devices||[],hosDriversLocal=hos.drivers||[];
      target.innerHTML=`
        <div class="card" style="margin-top:10px"><h3>Drivers (${drivers.length})</h3>${drivers.length?drivers.slice(0,100).map(d=>`<p>${esc(d.driver_name||d.external_id)}${d.phone?` • ${esc(d.phone)}`:""}${d.status?` • ${esc(d.status)}`:""}</p>`).join(""):'<p class="muted">No synced drivers.</p>'}</div>
        <div class="card" style="margin-top:10px"><h3>HOS profiles (${hosDriversLocal.length})</h3>${hosDriversLocal.length?hosDriversLocal.slice(0,100).map(d=>`<p>${esc(d.driver_name||d.external_id)} • ${esc(d.duty_status||"Unknown")} • Drive ${esc(formatMinutes(d.drive_minutes))} • Shift ${esc(formatMinutes(d.shift_minutes))} • Cycle ${esc(formatMinutes(d.cycle_minutes))}</p>`).join(""):'<p class="muted">No HOS clocks synced yet.</p>'}</div>
        <div class="card" style="margin-top:10px"><h3>Devices (${devices.length})</h3>${devices.length?devices.slice(0,100).map(d=>`<p>${esc((d.device_type||"").toUpperCase())} • ${esc(d.vehicle_id||d.external_id)}${d.serial_number?` • ${esc(d.serial_number)}`:""}${d.status?` • ${esc(d.status)}`:""}</p>`).join(""):'<p class="muted">No synced devices.</p>'}</div>`;
    }catch(error){target.innerHTML=`<p class="bad">${esc(error.message)}</p>`}
  }

  async function removeConnection(connectionId){
    if(!confirm("Disconnect this ELD connection and remove its synced records?"))return;
    try{await api("POST",{action:"delete_connection",connection_id:connectionId});say("ELD connection removed.");await loadConnections()}catch(error){say(error.message,true)}
  }

  function boot(){ensureUi();fillCarriers();setTimeout(loadConnections,800)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
  document.addEventListener("click",event=>{
    if(event.target.closest('[data-screen="settings"]'))setTimeout(()=>{ensureUi();fillCarriers();loadConnections()},250);
    if(event.target.closest('[data-screen="dashboard"]'))setTimeout(()=>{ensureHosUi();renderHosDashboard()},150);
  });
})();
