const cfg=window.ZAP_TMS_CONFIG;
const sb=window.supabase.createClient(cfg.url,cfg.token);window.sb=sb; /* helpers (invite-admin, dashboard-fix, tms-dashboard-stable) gate on window.sb, which a top-level const never sets */
const $=id=>document.getElementById(id);
const store={get(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
let currentUser=null;
let accountType="dispatcher";
let currentProfileRole="user";
let currentOrganizationId=null;
let appData={settings:store.get("settings",{companyName:"Zap Dispatch",defaultCommission:8,companyEmail:"",companyPhone:""}),carriers:[],brokers:[],loads:[],expenses:[],fleet_people:[]};
const tables=["carriers","brokers","loads","expenses","fleet_people"];
const map={
  carriers:{
    toDb:x=>({name:x.name||"",mc_dot:x.mcDot||"",contact:x.contact||"",phone:x.phone||"",email:x.email||"",equipment:x.equipment||"",trucks:num(x.trucks,0),commission:num(x.commission,8),user_id:currentUser.id,...tenantField()}),
    fromDb:x=>({id:x.id,name:x.name,mcDot:x.mc_dot,contact:x.contact,phone:x.phone,email:x.email,equipment:x.equipment,trucks:x.trucks,commission:x.commission,organizationId:x.organization_id,linkedCarrierOrganizationId:x.linked_carrier_organization_id})
  },
  brokers:{
    toDb:x=>({name:x.name||"",contact:x.contact||"",phone:x.phone||"",email:x.email||"",source:x.source||"",notes:x.notes||"",user_id:currentUser.id,...tenantField()}),
    fromDb:x=>({id:x.id,name:x.name,contact:x.contact,phone:x.phone,email:x.email,source:x.source,notes:x.notes,organizationId:x.organization_id})
  },
  loads:{
    toDb:x=>({carrier:x.carrier||"",broker:x.broker||"",pickup:x.pickup||"",delivery:x.delivery||"",pickup_date:emptyDate(x.pickupDate),delivery_date:emptyDate(x.deliveryDate),equipment:x.equipment||"",status:x.status||"Booked",rate:num(x.rate,0),commission_pct:num(x.commissionPct,8),load_number:x.loadNumber||"",notes:x.notes||"",pickup_address:x.pickupAddress||"",delivery_address:x.deliveryAddress||"",miles:(x.miles===""||x.miles==null)?null:num(x.miles,0),pickup_time:x.pickupTime||null,delivery_time:x.deliveryTime||null,driver_name:x.driverName||"",driver_phone:x.driverPhone||"",truck_number:x.truckNumber||"",trailer_number:x.trailerNumber||"",additional_stops:x.additionalStops||"",pickup_number:x.pickupNumber||"",delivery_number:x.deliveryNumber||"",stops:Array.isArray(x.stops)?x.stops:[],fleet_person_id:x.fleetPersonId||null,fuel_cost:num(x.fuelCost,0),driver_cost:num(x.driverCost,0),tolls_cost:num(x.tollsCost,0),maintenance_cost:num(x.maintenanceCost,0),other_cost:num(x.otherCost,0),user_id:currentUser.id,...tenantField()}),
    fromDb:x=>({id:x.id,carrier:x.carrier,broker:x.broker,pickup:x.pickup,delivery:x.delivery,pickupDate:x.pickup_date,deliveryDate:x.delivery_date,equipment:x.equipment,status:x.status,rate:x.rate,commissionPct:x.commission_pct,loadNumber:x.load_number,notes:x.notes,pickupAddress:x.pickup_address,deliveryAddress:x.delivery_address,miles:x.miles,pickupTime:x.pickup_time,deliveryTime:x.delivery_time,driverName:x.driver_name,driverPhone:x.driver_phone,truckNumber:x.truck_number,trailerNumber:x.trailer_number,additionalStops:x.additional_stops,pickupNumber:x.pickup_number,deliveryNumber:x.delivery_number,stops:Array.isArray(x.stops)?x.stops:[],fleetPersonId:x.fleet_person_id,fuelCost:x.fuel_cost,driverCost:x.driver_cost,tollsCost:x.tolls_cost,maintenanceCost:x.maintenance_cost,otherCost:x.other_cost,organizationId:x.organization_id,carrierOrganizationId:x.carrier_organization_id})
  },
  expenses:{
    toDb:x=>({carrier:x.carrier||"",category:x.category||"Other",amount:num(x.amount,0),expense_date:emptyDate(x.date),notes:x.notes||"",user_id:currentUser.id,...tenantField()}),
    fromDb:x=>({id:x.id,carrier:x.carrier,category:x.category,amount:x.amount,date:x.expense_date,notes:x.notes,organizationId:x.organization_id})
  },
  fleet_people:{
    toDb:x=>({person_type:x.personType||"company_driver",name:x.name||"",phone:x.phone||"",email:x.email||"",truck_number:x.truckNumber||"",trailer_number:x.trailerNumber||"",equipment:x.equipment||"",pay_type:x.payType||"per_mile",pay_rate:num(x.payRate,0),active:x.active!==false,notes:x.notes||"",user_id:currentUser.id,...tenantField()}),
    fromDb:x=>({id:x.id,personType:x.person_type,name:x.name,phone:x.phone,email:x.email,truckNumber:x.truck_number,trailerNumber:x.trailer_number,equipment:x.equipment,payType:x.pay_type,payRate:x.pay_rate,active:x.active,notes:x.notes,organizationId:x.organization_id})
  }
};
function tenantField(){return currentOrganizationId?{organization_id:currentOrganizationId}:{}}function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}function emptyDate(v){return v||null}function money(n){return "$"+(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2})}function loadCost(l){return num(l.fuelCost)+num(l.driverCost)+num(l.tollsCost)+num(l.maintenanceCost)+num(l.otherCost)}function msg(t,bad=false){const el=$("authMessage");if(el){el.textContent=t||"";el.classList.toggle("bad",!!bad)}}function setBusy(b){["loginBtn","signupBtn","addCarrier","addBroker","addLoad","addExpense","addFleetPerson","syncNow"].forEach(id=>{const el=$(id);if(el)el.disabled=b})}
function data(){return appData}function cache(){tables.forEach(t=>store.set(t,appData[t]));store.set("settings",appData.settings)}
async function loadCloud(){if(!currentUser)return;setBusy(true);try{for(const t of tables){const {data,error}=await sb.from(t).select("*").order("created_at",{ascending:false});if(error)throw error;appData[t]=(data||[]).map(map[t].fromDb)}cache();refresh()}catch(e){alert("Cloud sync error: "+e.message)}finally{setBusy(false)}}
async function insertRow(t,row){setBusy(true);try{const {data,error}=await sb.from(t).insert(map[t].toDb(row)).select().single();if(error)throw error;appData[t]=[map[t].fromDb(data),...appData[t]];cache();refresh()}catch(e){alert("Save error: "+e.message)}finally{setBusy(false)}}
async function updateRow(t,item){if(!item.id)return;setBusy(true);try{const {data,error}=await sb.from(t).update(map[t].toDb(item)).eq("id",item.id).select().single();if(error)throw error;const idx=appData[t].findIndex(x=>x.id===item.id);if(idx>-1)appData[t][idx]=map[t].fromDb(data);cache();refresh()}catch(e){alert("Update error: "+e.message)}finally{setBusy(false)}}
async function removeItem(t,i){const item=appData[t][i];if(!item)return;if(!confirm("Delete this item?"))return;setBusy(true);try{if(item.id){const {error}=await sb.from(t).delete().eq("id",item.id);if(error)throw error}appData[t].splice(i,1);cache();refresh()}catch(e){alert("Delete error: "+e.message)}finally{setBusy(false)}}window.removeItem=removeItem;
function refresh(){renderSelects();renderDashboard();renderCarriers();renderBrokers();renderLoads();renderExpenses();renderInvoices();renderSettings();if(typeof window.zapRenderCarrierOperations==="function")window.zapRenderCarrierOperations()}
function renderDashboard(){
  const d=data();
  const gross=d.loads.reduce((s,l)=>s+num(l.rate),0);
  const comm=d.loads.reduce((s,l)=>s+(num(l.rate)*num(l.commissionPct)/100),0);
  $("dashRevenue").textContent=money(gross);
  if(accountType==="carrier"){
    const active=(d.fleet_people||[]).filter(p=>p.active!==false);
    const loadCosts=d.loads.reduce((s,l)=>s+loadCost(l),0);
    const overhead=d.expenses.reduce((s,e)=>s+num(e.amount),0);
    $("dashCommission").textContent=money(gross-loadCosts-overhead);
    $("carrierCount").textContent=active.length;
    $("truckCount").textContent=new Set(active.map(p=>String(p.truckNumber||"").trim()).filter(Boolean)).size;
  }else{
    $("dashCommission").textContent=money(comm);
    $("carrierCount").textContent=d.carriers.length;
    $("truckCount").textContent=d.carriers.reduce((s,c)=>s+num(c.trucks),0);
  }
  $("loadCount").textContent=d.loads.length;
  $("openLoads").textContent=d.loads.filter(l=>!["Paid","Cancelled"].includes(l.status)).length;
}
function renderSelects(){const d=data();["loadCarrier","expenseCarrier"].forEach(id=>{const sel=$(id);if(!sel)return;const old=sel.value;sel.innerHTML="<option value=''>Select</option>";d.carriers.forEach(c=>{let o=document.createElement("option");o.value=c.name;o.textContent=c.name;sel.appendChild(o)});sel.value=old});const bsel=$("loadBroker");if(bsel){const old=bsel.value;bsel.innerHTML="<option value=''>Select</option>";d.brokers.forEach(b=>{let o=document.createElement("option");o.value=b.name;o.textContent=b.name;bsel.appendChild(o)});bsel.value=old}}
function esc(v){return String(v??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]))}function card(title,body,pills="",actions=""){return `<div class="list-card"><h3>${esc(title)}</h3><p class="muted">${esc(body)}</p><div class="pill-row">${pills}</div>${actions}</div>`}
function renderCarriers(){const list=$("carriersList"),arr=data().carriers;list.innerHTML=arr.length?"":"<div class='card'><p class='muted'>No carriers yet.</p></div>";arr.forEach((c,i)=>list.innerHTML+=card(c.name||"Unnamed carrier",`${c.equipment||""} • ${c.trucks||0} truck(s) • ${c.contact||""} ${c.phone||""}`,`<span class="pill">MC/DOT: ${esc(c.mcDot||"-")}</span><span class="pill green">${esc(c.commission||8)}%</span>`,`<div class="card-actions"><button class="small-btn" onclick="removeItem('carriers',${i})">Delete</button></div>`))}
function renderBrokers(){const list=$("brokersList"),arr=data().brokers;list.innerHTML=arr.length?"":"<div class='card'><p class='muted'>No brokers yet.</p></div>";arr.forEach((b,i)=>list.innerHTML+=card(b.name||"Unnamed broker",`${b.contact||""} • ${b.phone||""} • ${b.email||""}`,`<span class="pill">${esc(b.source||"Source")}</span>`,`<div class="card-actions"><button class="small-btn" onclick="removeItem('brokers',${i})">Delete</button></div>`))}
/* ===== Load Board v2 (Step 1): stable cards, data-load-id, native actions, one delegated listener ===== */
const LOAD_STATUSES=["Booked","Dispatched","Picked Up","Delivered","Invoiced","Paid"];
function loadById(id){return appData.loads.find(x=>x.id===id)}
function buildLoadCard(l){
  const status=String(l.status||"Booked");
  const color=status==="Paid"?"green":status==="Cancelled"?"red":(status==="Delivered"||status==="Invoiced")?"yellow":"orange";
  const comm=num(l.rate)*num(l.commissionPct)/100;
  const canInvoice=["Delivered","Invoiced","Paid"].includes(status);
  const isArchived=status==="Archived";
  const loadContext=accountType==="carrier"
    ?((l.broker||"Broker")+" • Load # "+(l.loadNumber||"-")+" • "+(l.pickupDate||""))
    :((l.carrier||"Carrier")+" • "+(l.broker||"Broker")+" • Load # "+(l.loadNumber||"-")+" • "+(l.pickupDate||""));
  const extra=[
    l.driverName?("Driver: "+l.driverName+(l.driverPhone?" ("+l.driverPhone+")":"")):"",
    l.truckNumber?("Truck "+l.truckNumber):"",
    l.trailerNumber?("Trailer "+l.trailerNumber):"",
    (l.miles!=null&&l.miles!=="")?(l.miles+" mi"):""
  ].filter(Boolean).join(" • ");
  const el=document.createElement("div");
  el.className="list-card";
  if(l.id)el.dataset.loadId=l.id;
  el.innerHTML=
    (canInvoice&&l.id?`<label class="invoice-select-box" style="display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:800;color:#86efac"><input type="checkbox" class="invoice-select" data-id="${esc(l.id)}"> Select for invoice</label>`:"")+
    `<h3>${esc((l.pickup||"Pickup")+" → "+(l.delivery||"Delivery"))}</h3>`+
    `<p class="muted">${esc(loadContext)}</p>`+
    (extra?`<p class="muted">${esc(extra)}</p>`:"")+
    `<div class="pill-row"><span class="pill ${color}">${esc(status)}</span><span class="pill">${money(l.rate)}</span>${accountType==="carrier"?`<span class="pill red">Cost ${money(loadCost(l))}</span><span class="pill green">CPM ${money(l.miles?loadCost(l)/num(l.miles):0)} • Profit ${money(num(l.rate)-loadCost(l))}</span>`:`<span class="pill green">Comm ${money(comm)}</span>`}<span class="pill">${esc(l.equipment||"")}</span></div>`+
    `<div class="card-actions">`+
      `<button type="button" class="small-btn load-link-btn" data-action="driver-link">Driver Link</button>`+
      `<button class="small-btn revoke-link-btn" data-action="revoke-link">Revoke Link</button>`+
      `<button class="small-btn load-loc-btn" data-action="location">Location</button>`+
      `<button class="small-btn zap-edit-btn" data-action="edit">Edit</button>`+
      `<button class="small-btn" data-action="next-status">Next status</button>`+
      `<button class="small-btn zap-upload-doc-btn" data-action="upload-doc">Upload Doc</button>`+
      `<button class="small-btn zap-manage-docs-btn" data-action="manage-docs">Manage Docs</button>`+
      `<button class="small-btn archive-load-btn" data-action="archive">${isArchived?"Restore":"Archive"}</button>`+
      `<button class="small-btn" data-action="delete">Delete</button>`+
    `</div>`+
    `<div class="status-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px">`+
      `<button class="small-btn" data-action="set-status" data-status="Picked Up">Picked</button>`+
      `<button class="small-btn" data-action="set-status" data-status="Delivered">Delivered</button>`+
      `<button class="small-btn" data-action="set-status" data-status="Invoiced">Invoiced</button>`+
      `<button class="small-btn" data-action="set-status" data-status="Paid">Paid</button>`+
    `</div>`;
  /* Driver Link is bound directly so it works on first load regardless of delegated-handler timing; stopImmediatePropagation keeps onLoadBoardClick from double-firing it */
  const driverBtn=el.querySelector('[data-action="driver-link"]');
  if(driverBtn)driverBtn.addEventListener("click",function(e){
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    actionDriverLink(l);
  });
  return el;
}
function renderLoads(){
  const list=$("loadsList");if(!list)return;
  const arr=data().loads;
  list.textContent="";
  if(!arr.length){list.innerHTML="<div class='card'><p class='muted'>No loads yet.</p></div>";return}
  const frag=document.createDocumentFragment();
  arr.forEach(l=>frag.appendChild(buildLoadCard(l)));
  list.appendChild(frag);
}
function portalUrl(token){const base=location.origin+location.pathname.replace(/index\.html$/,"").replace(/\/$/,"/");return base+"portal.html?t="+token}
function escAttr(v){return String(v??"").replace(/"/g,"&quot;").replace(/</g,"&lt;")}
/* US phone -> digits with country code, for sms: and wa.me links */
function telDigits(p){let d=String(p||"").replace(/\D/g,"");if(d.length===10)d="1"+d;return d}
/* Text (SMS) + WhatsApp buttons that open the phone's messaging app with the link prefilled.
   Both also copy the message to the clipboard so a desktop that doesn't prefill can just paste. */
function sendLinkButtons(phone,text){
  if(!phone)return '<p class="muted" style="margin:8px 0 0">Add a Driver cell to this load to text the link with one tap.</p>';
  const d=telDigits(phone),body=encodeURIComponent(text);
  return '<div class="card-actions">'
    +'<a class="small-btn zap-send-copy" href="sms:+'+d+'?&body='+body+'">Text (SMS)</a>'
    +'<a class="small-btn zap-send-copy" href="https://wa.me/'+d+'?text='+body+'" target="_blank" rel="noopener">WhatsApp</a>'
    +'</div>';
}
function wireSendCopy(m,text){m.querySelectorAll(".zap-send-copy").forEach(b=>b.addEventListener("click",()=>copyText(text)))}
function showDriverLinkModal(url,phone,name){
  let m=document.getElementById("zapDriverLinkModal");
  if(!m){m=document.createElement("div");m.id="zapDriverLinkModal";m.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px";document.body.appendChild(m)}
  const text=(name?String(name).trim()+", ":"")+"here is your load from Zap Dispatch. Open the link to see the details and share your location: "+url;
  m.innerHTML='<div class="card" style="width:min(480px,96vw)"><div class="section-title"><h2>Driver Link</h2><button class="small-btn" id="zdlClose">Close</button></div>'
    +'<input id="zdlUrl" readonly value="'+escAttr(url)+'" style="width:100%;margin:8px 0">'
    +sendLinkButtons(phone,text)
    +'<div class="card-actions"><a class="small-btn" href="'+escAttr(url)+'" target="_blank" rel="noopener">Open Portal</a><button class="small-btn" id="zdlCopy">Copy link</button></div>'
    +'<p class="muted">Send this link to the driver by text or WhatsApp.</p></div>';
  m.querySelector("#zdlClose").onclick=()=>m.remove();
  const inp=m.querySelector("#zdlUrl");inp.onclick=()=>inp.select();
  const cp=m.querySelector("#zdlCopy");if(cp)cp.onclick=()=>{copyText(url);cp.textContent="Copied ✓";setTimeout(()=>cp.textContent="Copy link",1500)};
  wireSendCopy(m,text);
}
async function copyText(t){try{await navigator.clipboard.writeText(t)}catch{}}
async function actionDriverLink(l){const r=await sb.rpc("create_driver_link",{p_load_id:l.id});if(r.error)return alert(r.error.message);const url=portalUrl(r.data);await copyText(url);showDriverLinkModal(url,l.driverPhone,l.driverName)}
async function actionRevokeLink(l){if(!confirm("Revoke driver link for this load? The driver portal link will stop working."))return;const r=await sb.rpc("revoke_driver_link",{p_load_id:l.id});if(r.error)return alert(r.error.message);alert("Driver link revoked. Generate a new Driver Link if needed.")}
async function actionLocation(l){const r=await sb.from("load_events").select("latitude,longitude,created_at,event_type").eq("load_id",l.id).not("latitude","is",null).not("longitude","is",null).order("created_at",{ascending:false}).limit(1);if(r.error)return alert(r.error.message);if(!r.data||!r.data.length)return alert("No location received yet.");const x=r.data[0];window.open("https://www.google.com/maps?q="+x.latitude+","+x.longitude,"_blank")}
async function actionSetStatus(l,status){if(status===l.status)return;if(status==="Paid"&&!confirm("Move this load to Paid?"))return;await updateRow("loads",{...l,status})}
async function actionNextStatus(l){const i=LOAD_STATUSES.indexOf(l.status);await updateRow("loads",{...l,status:LOAD_STATUSES[(i+1)%LOAD_STATUSES.length]})}
async function actionArchive(l){const on=String(l.status||"").toLowerCase()!=="archived";if(!confirm(on?"Archive this load?":"Restore this load to Paid?"))return;localStorage.setItem("zapFolder",on?"archive":"paid");await updateRow("loads",{...l,status:on?"Archived":"Paid"})}
function zapToast(msg){const d=document.createElement("div");d.textContent=msg;d.style.cssText="position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:100000;background:#0ea5e9;color:#04121d;font-weight:800;padding:10px 16px;border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.35)";document.body.appendChild(d);return d}
/* AI: after a Rate Confirmation PDF is uploaded, ask the parse-ratecon Edge Function to read it
   and pre-fill the load. Non-fatal — any failure just warns; the upload itself already succeeded.
   Shared by both upload paths (app.js actionUploadDoc and storage-upload.js). */
async function zapParseRateCon(l,kind,storagePath){
  if(!l||!l.id||!/rate/i.test(String(kind||"")))return;
  let notice;
  try{
    const sess=(await sb.auth.getSession()).data.session;if(!sess)return;
    notice=zapToast("Reading Rate Con with AI…");
    const res=await fetch(cfg.url+"/functions/v1/parse-ratecon",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+sess.access_token,"apikey":cfg.token},body:JSON.stringify({storage_path:storagePath})});
    const ai=await res.json().catch(()=>null);
    if(notice){notice.remove();notice=null}
    if(!res.ok||!ai||ai.error){alert("AI could not read this Rate Con"+(ai&&ai.error?": "+ai.error:".")+"\nYou can still fill the load manually.");return}
    const FIELDS=["broker","loadNumber","rate","equipment","miles","pickup","pickupAddress","pickupDate","pickupTime","pickupNumber","delivery","deliveryAddress","deliveryDate","deliveryTime","deliveryNumber","notes"];
    const patch={};
    FIELDS.forEach(k=>{const v=ai[k];if(v!==undefined&&v!==null&&v!=="")patch[k]=v});
    if(Array.isArray(ai.stops)&&ai.stops.length)patch.stops=ai.stops.map(s=>({address:s.address||"",num:s.num||"",time:s.time||"",date:s.date||""}));
    const merged={...l,...patch};
    const needsReview=!ai._meta||ai._meta.needsReview!==false;
    if(needsReview){actionEdit(merged)} /* dispatcher verifies the money before saving */
    else{await updateRow("loads",merged);alert("Rate Con imported automatically.")}
  }catch(e){if(notice)notice.remove();console.warn("parse-ratecon failed",e)}
}
window.zapParseRateCon=zapParseRateCon;
function actionUploadDoc(l){
  const input=document.createElement("input");input.type="file";input.accept="image/*,.pdf";
  input.onchange=async()=>{
    const file=input.files&&input.files[0];if(!file)return;
    if(file.size>10*1024*1024)return alert("File is too large. Keep it under 10 MB.");
    const kind=prompt("Document type: Rate Confirmation, BOL, POD, Lumper Receipt, Invoice Copy, Other","Rate Confirmation")||"Document";
    const user=(await sb.auth.getSession()).data.session?.user;if(!user)return alert("Login again first.");
    const safe=(file.name||"document").replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=user.id+"/"+l.id+"/"+Date.now()+"_"+safe;
    const up=await sb.storage.from("load-documents").upload(path,file,{contentType:file.type||"application/octet-stream"});
    if(up.error)return alert("Storage upload error: "+up.error.message);
    const r=await sb.from("load_documents").insert({user_id:user.id,load_id:l.id,file_name:"["+kind+"] "+file.name,file_type:file.type||"application/octet-stream",storage_bucket:"load-documents",storage_path:path,uploaded_by:"dispatcher"});
    if(r.error)return alert("File uploaded, but TMS record failed: "+r.error.message);
    if(/rate/i.test(kind))return zapParseRateCon(l,kind,path);
    alert("Document uploaded to Storage.");
  };
  input.click();
}
async function actionManageDocs(l){
  const r=await sb.from("load_documents").select("id,file_name,file_data,storage_path,created_at").eq("load_id",l.id).order("created_at",{ascending:false});
  if(r.error)return alert(r.error.message);
  let modal=document.getElementById("zapDocsModal");
  if(!modal){modal=document.createElement("div");modal.id="zapDocsModal";modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px";document.body.appendChild(modal)}
  const docs=r.data||[];const parts=[];
  for(const d of docs){
    let u=d.file_data||"";
    if(d.storage_path){const s=await sb.storage.from("load-documents").createSignedUrl(d.storage_path,3600);u=s.error?"":s.data.signedUrl}
    parts.push('<div class="card" style="margin:10px 0;padding:12px"><b>'+esc(d.file_name||"Document")+'</b><p class="muted">'+esc(new Date(d.created_at).toLocaleString())+(d.storage_path?" • Storage":" • Legacy")+'</p><div style="display:flex;gap:8px;flex-wrap:wrap">'+(u?'<a class="small-btn" href="'+u+'" target="_blank" download="'+esc(d.file_name||"document")+'">Open / Download</a>':"")+'<button class="small-btn zap-delete-doc" data-id="'+esc(d.id)+'">Delete</button></div></div>');
  }
  modal.innerHTML='<div class="card" style="width:min(760px,96vw);max-height:88vh;overflow:auto"><div class="section-title"><h2>Load Documents</h2><button class="small-btn" id="zapCloseDocs">Close</button></div><p class="muted">Storage links expire after 1 hour for security. Reopen Manage Docs for a fresh link.</p>'+(parts.length?parts.join(""):'<p class="muted">No documents saved for this load yet.</p>')+"</div>";
  document.getElementById("zapCloseDocs").onclick=()=>modal.remove();
  modal.querySelectorAll(".zap-delete-doc").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this document from the TMS list?"))return;const del=await sb.from("load_documents").delete().eq("id",b.dataset.id);if(del.error)return alert(del.error.message);alert("Document deleted.");actionManageDocs(l)});
}
/* Additional stops: a repeatable list, each with address / PU# / time / date. Stored as JSON in loads.stops. */
function stopRow(s){
  s=s||{};
  const d=document.createElement("div");
  d.className="stop-row";
  d.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;align-items:end;border:1px solid var(--line);border-radius:12px;padding:8px";
  d.innerHTML='<label style="font-size:12px;flex:3 1 180px">Address<input class="st-addr" placeholder="Full address"></label>'
    +'<label style="font-size:12px;flex:1 1 90px">PU #<input class="st-num" placeholder="Stop #"></label>'
    +'<label style="font-size:12px;flex:1 1 90px">Time<input class="st-time" type="time"></label>'
    +'<label style="font-size:12px;flex:1 1 120px">Date<input class="st-date" type="date"></label>'
    +'<button type="button" class="small-btn st-del" style="flex:0 0 auto;border-color:rgba(251,113,133,.4);color:#fda4af">Remove</button>';
  d.querySelector(".st-addr").value=s.address||"";
  d.querySelector(".st-num").value=s.num||"";
  d.querySelector(".st-time").value=s.time||"";
  d.querySelector(".st-date").value=s.date||"";
  d.querySelector(".st-del").onclick=()=>d.remove();
  return d;
}
function initStopsEditor(container,addBtn,stops){
  if(!container)return;
  container.textContent="";
  (Array.isArray(stops)?stops:[]).forEach(s=>container.appendChild(stopRow(s)));
  if(addBtn)addBtn.onclick=()=>container.appendChild(stopRow());
}
function collectStops(container){
  if(!container)return [];
  return [...container.querySelectorAll(".stop-row")].map(r=>({
    address:r.querySelector(".st-addr").value.trim(),
    num:r.querySelector(".st-num").value.trim(),
    time:r.querySelector(".st-time").value,
    date:r.querySelector(".st-date").value
  })).filter(s=>s.address||s.num||s.time||s.date);
}
function actionEdit(l){
  const F=[["Pickup city/state","pickup","text"],["Delivery city/state","delivery","text"],["Pickup date","pickupDate","date"],["Delivery date","deliveryDate","date"],["Pickup time","pickupTime","time"],["Delivery time","deliveryTime","time"],["Full pickup address","pickupAddress","text"],["Full delivery address","deliveryAddress","text"],["Miles","miles","number"],["Equipment","equipment","text"],["Rate $","rate","number"]];
  if(accountType==="dispatcher")F.push(["Dispatcher %","commissionPct","number"]);
  F.push(["Load #","loadNumber","text"],["Pickup #","pickupNumber","text"],["Delivery #","deliveryNumber","text"],["Driver name","driverName","text"],["Driver phone","driverPhone","text"],["Truck #","truckNumber","text"],["Trailer #","trailerNumber","text"]);
  if(accountType==="carrier")F.push(["Fuel cost $","fuelCost","number"],["Driver / Owner Op pay $","driverCost","number"],["Tolls $","tollsCost","number"],["Maintenance reserve $","maintenanceCost","number"],["Other load costs $","otherCost","number"]);
  F.push(["Notes","notes","text"]);
  const ALL=[...LOAD_STATUSES,"Archived","Cancelled"];
  let modal=document.getElementById("zapEditModal");
  if(!modal){modal=document.createElement("div");modal.id="zapEditModal";modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px";document.body.appendChild(modal)}
  modal.innerHTML='<div class="card" style="width:min(760px,96vw);max-height:88vh;overflow:auto"><div class="section-title"><h2>Edit Load</h2><button class="small-btn" id="zeClose">Close</button></div><div class="form-grid">'
    +'<label>Status<select id="ze_status">'+ALL.map(s=>'<option'+(s===l.status?" selected":"")+">"+esc(s)+"</option>").join("")+"</select></label>"
    +F.map(f=>'<label>'+esc(f[0])+'<input id="ze_'+f[1]+'" type="'+f[2]+'"'+(f[2]==="number"?' step="0.01"':"")+' value="'+esc(l[f[1]]??"")+'"></label>').join("")
    +'</div>'
    +'<div style="margin-top:12px"><div class="section-title" style="margin-bottom:6px"><h3 style="margin:0;font-size:15px">Additional stops (optional)</h3><button type="button" class="small-btn" id="zeAddStop">+ Add stop</button></div><div id="zeStops"></div></div>'
    +'<div class="card-actions" style="margin-top:12px"><button class="small-btn" id="zeSave">Save changes</button></div></div>';
  modal.querySelector("#zeClose").onclick=()=>modal.remove();
  initStopsEditor(modal.querySelector("#zeStops"),modal.querySelector("#zeAddStop"),l.stops);
  modal.querySelector("#zeSave").onclick=async()=>{
    const upd={...l,status:modal.querySelector("#ze_status").value};
    F.forEach(f=>{upd[f[1]]=modal.querySelector("#ze_"+f[1]).value});
    upd.stops=collectStops(modal.querySelector("#zeStops"));
    modal.remove();
    await updateRow("loads",upd);
  };
}
function onLoadBoardClick(e){
  const btn=e.target.closest("[data-action]");
  if(!btn||btn.onclick)return; /* if a legacy helper re-bound this button, let the helper own the click (no double-fire) */
  const cardEl=btn.closest(".list-card");if(!cardEl)return;
  const id=cardEl.dataset.loadId||"";
  const l=id&&loadById(id);
  const a=btn.dataset.action;
  if(!l){
    if(a==="delete"){const i=[...cardEl.parentNode.children].indexOf(cardEl);if(i>-1&&appData.loads[i])removeItem("loads",i);return}
    return alert("Sync first.");
  }
  if(a==="driver-link")return actionDriverLink(l);
  if(a==="revoke-link")return actionRevokeLink(l);
  if(a==="location")return actionLocation(l);
  if(a==="edit")return actionEdit(l);
  if(a==="next-status")return actionNextStatus(l);
  if(a==="set-status")return actionSetStatus(l,btn.dataset.status);
  if(a==="upload-doc")return actionUploadDoc(l);
  if(a==="manage-docs")return actionManageDocs(l);
  if(a==="archive")return actionArchive(l);
  if(a==="delete"){const i=appData.loads.findIndex(x=>x.id===id);if(i>-1)return removeItem("loads",i)}
}
(()=>{const el=$("loadsList");if(el&&!el.dataset.delegated){el.dataset.delegated="1";el.addEventListener("click",onLoadBoardClick)}})();
/* ===== end Load Board v2 ===== */
async function cycleLoad(i){const statuses=["Booked","Dispatched","Picked Up","Delivered","Invoiced","Paid"];const l=appData.loads[i];if(!l)return;let idx=statuses.indexOf(l.status);l.status=statuses[(idx+1)%statuses.length];await updateRow("loads",l)}window.cycleLoad=cycleLoad;
function renderExpenses(){const list=$("expensesList"),arr=data().expenses;list.innerHTML=arr.length?"":"<div class='card'><p class='muted'>No costs yet.</p></div>";arr.forEach((e,i)=>list.innerHTML+=card(`${e.category||"Other"} • ${money(e.amount)}`,`${e.date||""}${e.notes?" • "+e.notes:""}`,`<span class="pill red">Cost</span>`,`<div class="card-actions"><button class="small-btn" onclick="removeItem('expenses',${i})">Delete</button></div>`))}
/* #invoiceList used to show a read-only list of delivered/invoiced/paid loads (no actions),
   which duplicated the Load Board and confused users. It's kept empty because saved-invoices.js
   uses it as an anchor for the real Saved Invoices list. */
function renderInvoices(){const list=$("invoiceList");if(list)list.innerHTML=""}
function renderSettings(){const s=data().settings;$("companyName").value=s.companyName||"";$("defaultCommission").value=s.defaultCommission||8;$("companyEmail").value=s.companyEmail||"";$("companyPhone").value=s.companyPhone||""}
function clearInputs(ids){ids.forEach(id=>{const el=$(id);if(el)el.value=""})}function navTo(target){document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===target));document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id===target))}
document.querySelectorAll(".nav-btn,.jump").forEach(btn=>btn.onclick=()=>{if(btn.dataset.screen)navTo(btn.dataset.screen)});
$("themeToggle").onclick=()=>{document.body.classList.toggle("light");store.set("light",document.body.classList.contains("light"))};
$("addCarrier").onclick=()=>insertRow("carriers",{name:$("carrierName").value,mcDot:$("mcDot").value,contact:$("carrierContact").value,phone:$("carrierPhone").value,email:$("carrierEmail").value,equipment:$("carrierEquipment").value,trucks:$("carrierTrucks").value,commission:$("carrierCommission").value}).then(()=>clearInputs(["carrierName","mcDot","carrierContact","carrierPhone","carrierEmail"]));
$("addBroker").onclick=()=>insertRow("brokers",{name:$("brokerName").value,contact:$("brokerContact").value,phone:$("brokerPhone").value,email:$("brokerEmail").value,source:$("brokerSource").value,notes:$("brokerNotes").value}).then(()=>clearInputs(["brokerName","brokerContact","brokerPhone","brokerEmail","brokerSource","brokerNotes"]));
$("addLoad").onclick=()=>insertRow("loads",{carrier:accountType==="carrier"?(appData.settings.companyName||""):$("loadCarrier").value,broker:$("loadBroker").value,pickup:$("pickup").value,delivery:$("delivery").value,pickupDate:$("pickupDate").value,deliveryDate:$("deliveryDate").value,equipment:$("equipment").value,status:$("loadStatus").value,rate:$("rate").value,commissionPct:accountType==="carrier"?0:$("commissionPct").value,loadNumber:$("loadNumber").value,notes:$("loadNotes").value,pickupAddress:$("pickupAddress")?.value,deliveryAddress:$("deliveryAddress")?.value,miles:$("loadMiles")?.value,pickupTime:$("pickupTime")?.value,deliveryTime:$("deliveryTime")?.value,pickupNumber:$("pickupNumber")?.value,deliveryNumber:$("deliveryNumber")?.value,driverName:$("driverName")?.value,driverPhone:$("driverPhone")?.value,truckNumber:$("truckNumber")?.value,trailerNumber:$("trailerNumber")?.value,fleetPersonId:$("driverPick")?.selectedOptions?.[0]?.dataset?.fleetId||null,fuelCost:$("fuelCost")?.value,driverCost:$("driverCost")?.value,tollsCost:$("tollsCost")?.value,maintenanceCost:$("maintenanceCost")?.value,otherCost:$("otherCost")?.value,stops:collectStops($("newLoadStops"))}).then(()=>{clearInputs(["pickup","delivery","pickupDate","deliveryDate","rate","loadNumber","loadNotes","pickupAddress","deliveryAddress","loadMiles","pickupTime","deliveryTime","pickupNumber","deliveryNumber","driverName","driverPhone","truckNumber","trailerNumber"]);["fuelCost","driverCost","tollsCost","maintenanceCost","otherCost"].forEach(id=>{if($(id))$(id).value="0"});initStopsEditor($("newLoadStops"),null,[]);if(window.zapUpdateCostPreview)window.zapUpdateCostPreview()});
(()=>{const c=$("newLoadStops"),b=$("addStopBtn");if(c&&b&&!c.dataset.init){c.dataset.init="1";initStopsEditor(c,b,[])}})();
$("addExpense").onclick=()=>insertRow("expenses",{date:$("expenseDate").value,carrier:"",category:$("expenseCategory").value,amount:$("expenseAmount").value,notes:$("expenseNotes").value}).then(()=>clearInputs(["expenseAmount","expenseNotes"]));
$("saveSettings").onclick=()=>{appData.settings={companyName:$("companyName").value,defaultCommission:$("defaultCommission").value,companyEmail:$("companyEmail").value,companyPhone:$("companyPhone").value};cache();alert("Settings saved on this device.");refresh()};
$("exportData").onclick=()=>{$("backupBox").value=JSON.stringify(data(),null,2)};$("syncNow").onclick=loadCloud;$("logoutBtn").onclick=async()=>{await sb.auth.signOut();location.reload()};
function strongPassword(value){return value.length>=10&&/[A-Z]/.test(value)&&/[a-z]/.test(value)&&/[0-9]/.test(value)}
async function passwordAuth(create=false){const email=$("authEmail").value.trim().toLowerCase(),password=$("authSecret")?.value||"";if(!email||!password)return msg("Enter your email and password.",true);if(create&&!strongPassword(password))return msg("Use at least 10 characters with one uppercase letter, one lowercase letter, and one number.",true);if(!create&&password.length<6)return msg("Enter your full password.",true);setBusy(true);msg(create?"Creating your 30-day free trial...":"Logging in...");const signupType=$("authAccountType")?.value==="carrier"?"carrier":"dispatcher";const res=create?await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{account_type:signupType}}}):await sb.auth.signInWithPassword({email,password});setBusy(false);if(res.error){if(!create&&/confirm/i.test(res.error.message||""))return msg("Please confirm your email first, then log in.",true);if(create&&/(registered|already)/i.test(res.error.message||""))return msg("That email is already registered. Try logging in instead.",true);return msg(create?`Could not create the account: ${res.error.message}`:"Could not log in. Check your email and password.",true)}if(create&&!res.data?.session)return msg(`Account created! Check ${email} and open the confirmation link to activate your 30-day free trial, then come back and log in.`);msg(create?"Free trial activated. Opening TMS...":"Done. Opening TMS...");setTimeout(()=>location.replace(location.origin+location.pathname+"?ok="+Date.now()),500)}
$("loginBtn").onclick=()=>passwordAuth(false);$("signupBtn").onclick=()=>passwordAuth(true);$("showLogin").onclick=()=>msg("Sign in with your email and password.");$("showSignup").onclick=()=>msg("Create an account to start your 30-day free trial. No payment is required to start.");
async function migrateLocal(){const done=store.get("tmsMigratedToCloud",false);if(done||!currentUser)return;let moved=0;for(const t of tables){const old=store.get(t,[]).filter(x=>!x.id);for(const row of old){const {error}=await sb.from(t).insert(map[t].toDb(row));if(!error)moved++}}store.set("tmsMigratedToCloud",true);if(moved)alert(`Imported ${moved} old local records to cloud.`)}
async function startApp(){
  const {data:{session}}=await sb.auth.getSession();
  currentUser=session?.user;
  if(!currentUser){
    $("authShell").classList.remove("hidden");
    $("appShell").classList.add("hidden");
    return;
  }
  const profile=await sb.from("profiles").select("account_type,role,default_organization_id").eq("id",currentUser.id).maybeSingle();
  const profileAccountType=profile.data?.account_type==="carrier"?"carrier":"dispatcher";
  currentProfileRole=profile.data?.role==="admin"?"admin":"user";
  currentOrganizationId=profile.data?.default_organization_id||null;
  if(!currentOrganizationId){
    const org=await sb.rpc("current_organization_id");
    if(!org.error)currentOrganizationId=org.data||null;
  }
  const adminModeKey="zapAdminWorkMode:"+currentUser.id;
  const savedAdminMode=store.get(adminModeKey,profileAccountType);
  accountType=currentProfileRole==="admin"?(savedAdminMode==="carrier"?"carrier":"dispatcher"):profileAccountType;
  window.zapAccountType=accountType;
  window.zapIsAdmin=currentProfileRole==="admin";
  window.zapOrganizationId=currentOrganizationId;
  document.body.dataset.accountType=accountType;
  const adminModeWrap=$("adminModeWrap"),adminModeSelect=$("adminModeSelect");
  if(currentProfileRole==="admin"&&adminModeWrap&&adminModeSelect){
    adminModeWrap.classList.remove("hidden");
    adminModeSelect.value=accountType;
    adminModeSelect.onchange=()=>{
      const next=adminModeSelect.value==="carrier"?"carrier":"dispatcher";
      store.set(adminModeKey,next);
      location.reload();
    };
  }
  $("authShell").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("userEmail").textContent=currentUser.email||"";
  await migrateLocal();
  await loadCloud();
}
if(store.get("light",false))document.body.classList.add("light");
startApp();
if("serviceWorker"in navigator){
  const hadController=!!navigator.serviceWorker.controller;
  if(hadController){
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      const version="guided-tour-1";
      if(sessionStorage.getItem("zapServiceWorkerReload")===version)return;
      sessionStorage.setItem("zapServiceWorkerReload",version);
      location.reload();
    });
  }
  navigator.serviceWorker.register("service-worker.js?v=guided-tour-1").catch(()=>{});
}
