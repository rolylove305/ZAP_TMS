(()=>{
  const by=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const base=()=>window.ZAP_TMS_CONFIG.url;
  const gateway=()=>`${base()}/functions/v1/eld-gateway`;
  const endpoint=()=>`${base()}/functions/v1/eld-location`;
  let connections=[];
  let locations=[];
  let lastError="";

  async function headers(){
    const {data,error}=await sb.auth.getSession();
    const token=data?.session?.access_token;
    if(error||!token)throw new Error("Login again before refreshing vehicle locations.");
    return {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  }

  async function request(url,method="GET",body=null){
    const response=await fetch(url,{method,headers:await headers(),body:body?JSON.stringify(body):undefined});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`Location request failed (${response.status})`);
    return payload;
  }

  function ensureUi(){
    const dashboard=by("dashboard");
    if(!dashboard||by("eldLocationCard"))return;
    const card=document.createElement("div");
    card.className="card";
    card.id="eldLocationCard";
    card.innerHTML=`
      <div class="section-title">
        <h2>Vehicle Location</h2>
        <button type="button" class="small-btn" id="eldLocationRefresh">Refresh Location</button>
      </div>
      <div class="form-grid">
        <label>Vehicle<select id="eldLocationVehicle"><option value="">No locations synced</option></select></label>
      </div>
      <p class="muted" id="eldLocationStatus">Refresh to retrieve the latest ELD vehicle position.</p>
      <div id="eldLocationDetails"></div>`;
    const hos=by("eldHosDashboardCard");
    if(hos)hos.after(card);else{
      const hero=dashboard.querySelector(".hero-card");
      if(hero)hero.after(card);else dashboard.prepend(card);
    }
    by("eldLocationRefresh").onclick=()=>loadLocations(true);
    by("eldLocationVehicle").onchange=renderSelected;
  }

  function formatNumber(value,digits=1){
    const n=Number(value);
    return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):"—";
  }

  function formatTime(value){
    if(!value)return "Unknown";
    const date=new Date(value);
    return Number.isNaN(date.getTime())?String(value):date.toLocaleString();
  }

  function selectedLocation(){
    const index=Number(by("eldLocationVehicle")?.value||0);
    return locations[index]||locations[0]||null;
  }

  function render(){
    ensureUi();
    const select=by("eldLocationVehicle");
    const status=by("eldLocationStatus");
    const details=by("eldLocationDetails");
    if(!select||!status||!details)return;
    const old=select.value;
    if(!locations.length){
      select.innerHTML='<option value="">No locations synced</option>';
      status.textContent=lastError||"Press Refresh Location to retrieve the latest ELD position.";
      status.classList.toggle("bad",!!lastError);
      details.innerHTML="";
      return;
    }
    select.innerHTML=locations.map((item,index)=>`<option value="${index}">Truck ${esc(item.vehicle_id||"Unknown")}${item.geocoded_location?` — ${esc(item.geocoded_location)}`:""}</option>`).join("");
    if([...select.options].some(option=>option.value===old))select.value=old;
    status.classList.remove("bad");
    renderSelected();
  }

  function renderSelected(){
    const item=selectedLocation();
    const status=by("eldLocationStatus");
    const details=by("eldLocationDetails");
    if(!item||!status||!details)return;
    const hasCoordinates=Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude));
    const mapUrl=hasCoordinates?`https://www.google.com/maps?q=${encodeURIComponent(item.latitude)},${encodeURIComponent(item.longitude)}`:"";
    status.textContent=`Last vehicle report: ${formatTime(item.location_time||item.synced_at)}`;
    details.innerHTML=`
      <div class="pill-row" style="margin:10px 0">
        <span class="pill">Truck: ${esc(item.vehicle_id||"Unknown")}</span>
        ${item.connection_name?`<span class="pill">${esc(item.connection_name)}</span>`:""}
        ${item.bearing?`<span class="pill">Bearing: ${esc(item.bearing)}</span>`:""}
      </div>
      <div class="grid two">
        <div class="metric-card"><p>Location</p><h3 style="font-size:18px">${esc(item.geocoded_location||"Address unavailable")}</h3><span class="muted">${hasCoordinates?`${esc(formatNumber(item.latitude,5))}, ${esc(formatNumber(item.longitude,5))}`:"Coordinates unavailable"}</span></div>
        <div class="metric-card"><p>Speed reported</p><h3>${esc(formatNumber(item.speed,1))}</h3><span class="muted">Next Fleet API value</span></div>
        <div class="metric-card"><p>Odometer</p><h3>${esc(formatNumber(item.odometer,1))}</h3><span class="muted">Next Fleet API value</span></div>
        <div class="metric-card"><p>Engine hours</p><h3>${esc(formatNumber(item.engine_hours,1))}</h3><span class="muted">Next Fleet API value</span></div>
      </div>
      ${mapUrl?`<div class="card-actions" style="margin-top:12px"><a class="primary-btn" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer" style="text-align:center;text-decoration:none">Open in Google Maps</a></div>`:""}`;
  }

  async function loadLocations(sync=false){
    ensureUi();
    const button=by("eldLocationRefresh");
    const status=by("eldLocationStatus");
    if(button)button.disabled=true;
    if(status)status.textContent=sync?"Refreshing live vehicle locations...":"Loading saved vehicle locations...";
    locations=[];lastError="";
    try{
      const connectionPayload=await request(gateway());
      connections=(connectionPayload.connections||[]).filter(connection=>["nextfleet","apollo"].includes(connection.provider));
      for(const connection of connections){
        try{
          const payload=sync
            ?await request(endpoint(),"POST",{connection_id:connection.id})
            :await request(`${endpoint()}?connection_id=${encodeURIComponent(connection.id)}`);
          (payload.locations||[]).forEach(item=>locations.push({...item,connection_id:connection.id,connection_name:connection.display_name}));
        }catch(error){lastError=error.message}
      }
    }catch(error){lastError=error.message}
    finally{if(button)button.disabled=false}
    render();
  }

  function selectVehicle(vehicleId){
    if(!vehicleId)return;
    const index=locations.findIndex(item=>String(item.vehicle_id)===String(vehicleId));
    if(index<0)return;
    const select=by("eldLocationVehicle");
    if(select){select.value=String(index);renderSelected()}
  }

  function boot(){ensureUi();setTimeout(()=>loadLocations(false),1300)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
  document.addEventListener("click",event=>{
    if(event.target.closest('[data-screen="dashboard"]'))setTimeout(()=>{ensureUi();render()},180);
  });
  document.addEventListener("change",event=>{
    if(event.target?.id!=="eldHosDriver")return;
    const label=event.target.selectedOptions?.[0]?.textContent||"";
    const match=label.match(/Truck\s+(.+)$/i);
    if(match)selectVehicle(match[1].trim());
  });
})();
