(()=>{
  const by=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const base=()=>window.ZAP_TMS_CONFIG.url;
  const gateway=()=>`${base()}/functions/v1/eld-gateway`;
  const endpoint=()=>`${base()}/functions/v1/eld-location`;
  const ACTIVE_LOAD_STATUSES=["Booked","Dispatched","Picked Up"];
  let connections=[];
  let locations=[];
  let activeLoads=[];
  let connectionErrors=[];
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

  async function loadActiveLoads(){
    const {data,error}=await sb
      .from("loads")
      .select("id,load_number,carrier,driver_name,truck_number,trailer_number,status,pickup,delivery,pickup_date,delivery_date")
      .in("status",ACTIVE_LOAD_STATUSES);
    if(error)throw new Error(error.message);
    activeLoads=data||[];
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
        <label>Vehicle / driver / active load<select id="eldLocationVehicle"><option value="">No locations synced</option></select></label>
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

  function unitKey(value){
    return String(value??"").trim().toLowerCase();
  }

  function words(value){
    return String(value??"")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g," ")
      .trim()
      .split(/\s+/)
      .filter(word=>word.length>1);
  }

  function namesMatch(left,right){
    const a=words(left);
    const b=words(right);
    if(!a.length||!b.length)return false;
    const shared=a.filter(word=>b.includes(word));
    return shared.length>=Math.min(2,a.length,b.length)||
      (shared.length>=1&&a[0]===b[0]);
  }

  function carrierMatch(connectionName,carrier){
    const a=words(connectionName);
    const b=words(carrier);
    return a.some(word=>word.length>3&&b.includes(word));
  }

  function driverNames(item){
    return [...new Set([
      item.driver_name,
      ...(Array.isArray(item.driver_names)?item.driver_names:[]),
    ].filter(Boolean))];
  }

  function matchLoad(item){
    const truck=unitKey(item.vehicle_id);
    const drivers=driverNames(item);
    let best=null;
    let bestScore=0;
    for(const load of activeLoads){
      let score=0;
      if(truck&&unitKey(load.truck_number)===truck)score+=120;
      if(drivers.some(name=>namesMatch(name,load.driver_name)))score+=80;
      if(carrierMatch(item.connection_name,load.carrier))score+=25;
      if(score>bestScore){best=load;bestScore=score}
    }
    return bestScore>=80?best:null;
  }

  function driverFor(item,load){
    return load?.driver_name||item.driver_name||driverNames(item)[0]||"Driver not assigned";
  }

  function optionLabel(item){
    const load=matchLoad(item);
    const parts=[`Truck ${item.vehicle_id||"Unknown"}`,driverFor(item,load)];
    if(load?.load_number)parts.push(`Load ${load.load_number}`);
    if(item.geocoded_location)parts.push(item.geocoded_location);
    return parts.join(" — ");
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
    select.innerHTML=locations.map((item,index)=>`<option value="${index}">${esc(optionLabel(item))}</option>`).join("");
    if([...select.options].some(option=>option.value===old))select.value=old;
    status.classList.remove("bad");
    renderSelected();
  }

  function renderSelected(){
    const item=selectedLocation();
    const status=by("eldLocationStatus");
    const details=by("eldLocationDetails");
    if(!item||!status||!details)return;
    const load=matchLoad(item);
    const driver=driverFor(item,load);
    const hasCoordinates=Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude));
    const mapUrl=hasCoordinates?`https://www.google.com/maps?q=${encodeURIComponent(item.latitude)},${encodeURIComponent(item.longitude)}`:"";
    const loadTruck=String(load?.truck_number||"").trim();
    const truckMismatch=loadTruck&&unitKey(loadTruck)!==unitKey(item.vehicle_id);
    const route=load?[load.pickup,load.delivery].filter(Boolean).join(" → "):"No active load matched";
    const warnings=connectionErrors.length?` • ${connectionErrors.length} ELD connection warning${connectionErrors.length===1?"":"s"}`:"";
    status.textContent=`${locations.length} trucks synced • Last report: ${formatTime(item.location_time||item.synced_at)}${warnings}`;
    details.innerHTML=`
      <div class="pill-row" style="margin:10px 0">
        <span class="pill">Truck: ${esc(item.vehicle_id||"Unknown")}</span>
        <span class="pill">Driver: ${esc(driver)}</span>
        ${item.connection_name?`<span class="pill">${esc(item.connection_name)}</span>`:""}
        ${load?.trailer_number?`<span class="pill">Trailer: ${esc(load.trailer_number)}</span>`:""}
        ${truckMismatch?`<span class="pill" style="border-color:#f59e0b;color:#fbbf24">Load says Truck ${esc(loadTruck)}</span>`:""}
      </div>
      <div class="grid two">
        <div class="metric-card"><p>Location</p><h3 style="font-size:18px">${esc(item.geocoded_location||"Address unavailable")}</h3><span class="muted">${hasCoordinates?`${esc(formatNumber(item.latitude,5))}, ${esc(formatNumber(item.longitude,5))}`:"Coordinates unavailable"}</span></div>
        <div class="metric-card"><p>Active load</p><h3 style="font-size:18px">${load?`#${esc(load.load_number||"No number")}`:"None matched"}</h3><span class="muted">${esc(load?.status||"Check Load Board")}</span></div>
        <div class="metric-card"><p>Route</p><h3 style="font-size:18px">${esc(route)}</h3><span class="muted">${load?`${esc(load.pickup_date||"No pickup date")} → ${esc(load.delivery_date||"No delivery date")}`:"Match uses truck, driver and carrier"}</span></div>
        <div class="metric-card"><p>Speed / odometer</p><h3>${esc(formatNumber(item.speed,1))} / ${esc(formatNumber(item.odometer,1))}</h3><span class="muted">ELD reported values</span></div>
      </div>
      <div class="card-actions" style="margin-top:12px">
        ${load?'<button type="button" class="primary-btn" id="eldLocationOpenLoad">Open Load Board</button>':""}
        ${mapUrl?`<a class="primary-btn" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer" style="text-align:center;text-decoration:none">Open in Google Maps</a>`:""}
      </div>
      ${connectionErrors.length?`<p class="muted bad" style="margin-top:10px">${esc(connectionErrors.join(" • "))}</p>`:""}`;
    const openLoad=by("eldLocationOpenLoad");
    if(openLoad)openLoad.onclick=()=>document.querySelector('.nav-btn[data-screen="loads"]')?.click();
  }

  async function loadLocations(sync=false){
    ensureUi();
    const button=by("eldLocationRefresh");
    const status=by("eldLocationStatus");
    if(button)button.disabled=true;
    if(status)status.textContent=sync?"Refreshing live vehicle locations...":"Loading saved vehicle locations...";
    locations=[];connectionErrors=[];lastError="";
    try{
      await loadActiveLoads().catch(error=>connectionErrors.push(`Loads: ${error.message}`));
      const connectionPayload=await request(gateway());
      connections=(connectionPayload.connections||[]).filter(connection=>["nextfleet","apollo"].includes(connection.provider));
      for(const connection of connections){
        try{
          const payload=sync
            ?await request(endpoint(),"POST",{connection_id:connection.id})
            :await request(`${endpoint()}?connection_id=${encodeURIComponent(connection.id)}`);
          (payload.locations||[]).forEach(item=>locations.push({...item,connection_id:connection.id,connection_name:connection.display_name}));
        }catch(error){
          connectionErrors.push(`${connection.display_name}: ${error.message}`);
        }
      }
      locations.sort((a,b)=>String(a.connection_name||"").localeCompare(String(b.connection_name||""))||String(a.vehicle_id||"").localeCompare(String(b.vehicle_id||""),undefined,{numeric:true}));
      if(!locations.length&&connectionErrors.length)lastError=connectionErrors.join(" • ");
    }catch(error){lastError=error.message}
    finally{if(button)button.disabled=false}
    render();
  }

  function selectVehicle(vehicleId){
    if(!vehicleId)return;
    const index=locations.findIndex(item=>unitKey(item.vehicle_id)===unitKey(vehicleId));
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
