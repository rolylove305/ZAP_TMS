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
  let fleetMap=null;
  let fleetMarkers=null;
  let markerByIndex=new Map();

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
      <div class="section-title fleet-command-title">
        <div><p class="eyebrow">Live operations</p><h2>Fleet Command Center</h2></div>
        <button type="button" class="small-btn" id="eldLocationRefresh">Refresh Fleet</button>
      </div>
      <p class="muted">All connected trucks, drivers and active loads in one operational view.</p>
      <div class="fleet-map-stats" id="fleetMapStats"></div>
      <div class="fleet-map-toolbar">
        <label>Find truck, driver or load<input id="fleetMapSearch" type="search" placeholder="Truck 20, driver, load #..."></label>
        <label>Status<select id="fleetMapStatus"><option value="">All statuses</option><option value="active">On active load</option><option value="available">Available</option><option value="attention">Needs attention</option><option value="offline">Location offline</option></select></label>
        <label>Carrier / ELD<select id="fleetMapCarrier"><option value="">All carriers</option></select></label>
        <button type="button" class="small-btn fleet-fit-btn" id="fleetMapFit">Show all trucks</button>
      </div>
      <div class="fleet-command-grid">
        <div class="fleet-map-shell"><div id="fleetMap" class="fleet-map" role="application" aria-label="Live fleet map"></div><div class="fleet-map-empty hidden" id="fleetMapEmpty">No trucks with coordinates match these filters.</div></div>
        <div class="fleet-vehicle-list" id="fleetVehicleList" aria-label="Fleet vehicle list"></div>
      </div>
      <div class="fleet-map-legend" aria-label="Map status legend">
        <span><i class="fleet-dot fleet-dot--active"></i>Active load</span>
        <span><i class="fleet-dot fleet-dot--available"></i>Available</span>
        <span><i class="fleet-dot fleet-dot--attention"></i>Needs attention</span>
        <span><i class="fleet-dot fleet-dot--offline"></i>Offline / old location</span>
      </div>
      <div class="form-grid fleet-detail-picker">
        <label>Selected vehicle / driver / active load<select id="eldLocationVehicle"><option value="">No locations synced</option></select></label>
      </div>
      <p class="muted" id="eldLocationStatus">Refresh to retrieve the latest ELD vehicle positions.</p>
      <div id="eldLocationDetails"></div>`;
    const hos=by("eldHosDashboardCard");
    if(hos)hos.after(card);else{
      const hero=dashboard.querySelector(".hero-card");
      if(hero)hero.after(card);else dashboard.prepend(card);
    }
    by("eldLocationRefresh").onclick=()=>loadLocations(true);
    by("eldLocationVehicle").onchange=()=>{renderSelected();renderFleetCommandCenter(false)};
    by("fleetMapSearch").oninput=()=>renderFleetCommandCenter(true);
    by("fleetMapStatus").onchange=()=>renderFleetCommandCenter(true);
    by("fleetMapCarrier").onchange=()=>renderFleetCommandCenter(true);
    by("fleetMapFit").onclick=fitFleetMap;
    by("fleetVehicleList").onclick=event=>{
      const button=event.target.closest("[data-fleet-index]");
      if(button)selectLocation(Number(button.dataset.fleetIndex),true);
    };
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

  function hasCoordinates(item){
    const latitude=item?.latitude;
    const longitude=item?.longitude;
    if(latitude===null||latitude===undefined||latitude===""||longitude===null||longitude===undefined||longitude==="")return false;
    return Number.isFinite(Number(latitude))&&Number.isFinite(Number(longitude));
  }

  function locationAgeMinutes(item){
    const value=item?.location_time||item?.synced_at;
    if(!value)return Infinity;
    const time=new Date(value).getTime();
    return Number.isFinite(time)?Math.max(0,(Date.now()-time)/60000):Infinity;
  }

  function carrierFor(item,load=matchLoad(item)){
    return load?.carrier||item.connection_name||"Unassigned carrier";
  }

  function fleetState(item,load=matchLoad(item)){
    const age=locationAgeMinutes(item);
    if(!hasCoordinates(item)||age>120)return "offline";
    if(age>30)return "attention";
    return load?"active":"available";
  }

  function fleetStateLabel(state){
    return ({active:"On active load",available:"Available",attention:"Needs attention",offline:"Location offline"})[state]||"Unknown";
  }

  function fleetSearchText(item,load){
    return [item.vehicle_id,driverFor(item,load),item.connection_name,item.geocoded_location,load?.load_number,load?.carrier,load?.pickup,load?.delivery,load?.status].join(" ").toLowerCase();
  }

  function fillFleetCarrierFilter(){
    const select=by("fleetMapCarrier");
    if(!select)return;
    const old=select.value;
    const carriers=[...new Set(locations.map(item=>carrierFor(item)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    select.innerHTML='<option value="">All carriers</option>'+carriers.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
    if(carriers.includes(old))select.value=old;
  }

  function fleetRows(){
    const search=String(by("fleetMapSearch")?.value||"").trim().toLowerCase();
    const status=by("fleetMapStatus")?.value||"";
    const carrier=by("fleetMapCarrier")?.value||"";
    return locations.map((item,index)=>{
      const load=matchLoad(item);
      return {item,index,load,state:fleetState(item,load),carrier:carrierFor(item,load)};
    }).filter(row=>(!search||fleetSearchText(row.item,row.load).includes(search))&&(!status||row.state===status)&&(!carrier||row.carrier===carrier));
  }

  function fleetStatsHtml(){
    const counts={active:0,available:0,attention:0,offline:0};
    locations.forEach(item=>counts[fleetState(item)]++);
    const card=(label,value,tone)=>`<div class="fleet-stat fleet-stat--${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
    return card("Trucks",locations.length,"total")+card("Active loads",counts.active,"active")+card("Available",counts.available,"available")+card("Attention",counts.attention+counts.offline,counts.attention+counts.offline?"attention":"clear");
  }

  function initializeFleetMap(){
    const element=by("fleetMap");
    if(fleetMap||!element||!window.L)return fleetMap;
    fleetMap=L.map(element,{zoomControl:true,preferCanvas:true}).setView([39.5,-98.35],4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(fleetMap);
    fleetMarkers=L.featureGroup().addTo(fleetMap);
    setTimeout(()=>fleetMap?.invalidateSize(),0);
    return fleetMap;
  }

  function markerHtml(item,state){
    return `<span class="fleet-marker fleet-marker--${state}"><span aria-hidden="true">🚚</span><b>${esc(item.vehicle_id||"?")}</b></span>`;
  }

  function popupHtml(row){
    const {item,load,state}=row;
    const route=load?[load.pickup,load.delivery].filter(Boolean).join(" → "):"No active load";
    return `<div class="fleet-popup"><strong>Truck ${esc(item.vehicle_id||"Unknown")}</strong><span>${esc(driverFor(item,load))}</span><span>${esc(fleetStateLabel(state))}</span>${load?.load_number?`<span>Load #${esc(load.load_number)}</span>`:""}<span>${esc(route)}</span><small>${esc(item.geocoded_location||"Address unavailable")}</small><small>Updated ${esc(formatTime(item.location_time||item.synced_at))}</small></div>`;
  }

  function selectLocation(index,openPopup=false){
    if(!Number.isInteger(index)||!locations[index])return;
    const select=by("eldLocationVehicle");
    if(select)select.value=String(index);
    renderSelected();
    renderFleetCommandCenter(false);
    if(openPopup)markerByIndex.get(index)?.openPopup();
    by("eldLocationDetails")?.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function fitFleetMap(){
    if(!fleetMap||!fleetMarkers)return;
    const bounds=fleetMarkers.getBounds();
    if(bounds.isValid())fleetMap.fitBounds(bounds,{padding:[36,36],maxZoom:10});
  }

  function renderFleetCommandCenter(fit=false){
    const stats=by("fleetMapStats");
    const list=by("fleetVehicleList");
    const empty=by("fleetMapEmpty");
    if(!stats||!list)return;
    stats.innerHTML=fleetStatsHtml();
    fillFleetCarrierFilter();
    const rows=fleetRows();
    const selected=Number(by("eldLocationVehicle")?.value||0);
    list.innerHTML=rows.length?rows.map(row=>{
      const {item,index,load,state}=row;
      return `<button type="button" class="fleet-vehicle ${index===selected?"is-selected":""}" data-fleet-index="${index}"><span class="fleet-vehicle-icon fleet-vehicle-icon--${state}">🚚</span><span class="fleet-vehicle-copy"><strong>Truck ${esc(item.vehicle_id||"Unknown")}</strong><span>${esc(driverFor(item,load))}</span><small>${load?.load_number?`Load #${esc(load.load_number)} • `:""}${esc(item.geocoded_location||"Location unavailable")}</small></span><span class="fleet-status fleet-status--${state}">${esc(fleetStateLabel(state))}</span></button>`;
    }).join(""):'<div class="fleet-list-empty">No trucks match these filters.</div>';

    const map=initializeFleetMap();
    if(!map){
      if(empty){empty.textContent="Map could not load. Truck details remain available in the list.";empty.classList.remove("hidden")}
      return;
    }
    fleetMarkers.clearLayers();
    markerByIndex=new Map();
    const mapped=rows.filter(row=>hasCoordinates(row.item));
    mapped.forEach(row=>{
      const icon=L.divIcon({className:"fleet-marker-wrap",html:markerHtml(row.item,row.state),iconSize:[72,34],iconAnchor:[36,17]});
      const marker=L.marker([Number(row.item.latitude),Number(row.item.longitude)],{icon,title:`Truck ${row.item.vehicle_id||"Unknown"}`}).bindPopup(popupHtml(row),{maxWidth:300});
      marker.on("click",()=>{
        const select=by("eldLocationVehicle");
        if(select)select.value=String(row.index);
        renderSelected();
        list.querySelectorAll(".fleet-vehicle").forEach(button=>button.classList.toggle("is-selected",Number(button.dataset.fleetIndex)===row.index));
      });
      marker.addTo(fleetMarkers);
      markerByIndex.set(row.index,marker);
    });
    if(empty)empty.classList.toggle("hidden",mapped.length>0);
    setTimeout(()=>{
      fleetMap?.invalidateSize();
      if(fit||mapped.length===1)fitFleetMap();
    },0);
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
      renderFleetCommandCenter(true);
      return;
    }
    select.innerHTML=locations.map((item,index)=>`<option value="${index}">${esc(optionLabel(item))}</option>`).join("");
    if([...select.options].some(option=>option.value===old))select.value=old;
    status.classList.remove("bad");
    renderFleetCommandCenter(true);
    renderSelected();
  }

  function renderSelected(){
    const item=selectedLocation();
    const status=by("eldLocationStatus");
    const details=by("eldLocationDetails");
    if(!item||!status||!details)return;
    const load=matchLoad(item);
    const driver=driverFor(item,load);
    const coordinatesAvailable=hasCoordinates(item);
    const mapUrl=coordinatesAvailable?`https://www.google.com/maps?q=${encodeURIComponent(item.latitude)},${encodeURIComponent(item.longitude)}`:"";
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
        <div class="metric-card"><p>Location</p><h3 style="font-size:18px">${esc(item.geocoded_location||"Address unavailable")}</h3><span class="muted">${coordinatesAvailable?`${esc(formatNumber(item.latitude,5))}, ${esc(formatNumber(item.longitude,5))}`:"Coordinates unavailable"}</span></div>
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
    if(select){select.value=String(index);renderSelected();renderFleetCommandCenter(false)}
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
