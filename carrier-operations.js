(()=>{
  const by=id=>document.getElementById(id);
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const usd=v=>'$'+n(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let editingId=null;

  function isCarrier(){return window.zapAccountType==='carrier'}
  function totalLoadCost(l){return n(l.fuelCost)+n(l.driverCost)+n(l.tollsCost)+n(l.maintenanceCost)+n(l.otherCost)}

  function applyAccountUi(){
    if(!window.zapAccountType)return;
    document.body.dataset.accountType=window.zapAccountType;
    const carrier=isCarrier();
    if(by('accountTypeBadge'))by('accountTypeBadge').textContent=window.zapIsAdmin?(carrier?'Admin • Carrier view':'Admin • Dispatch view'):(carrier?'Carrier account':'Dispatcher account');
    if(by('appSubtitle'))by('appSubtitle').textContent=carrier?'Loads • Fleet • Tracking • Costs • Profitability':'Carrier • Load • Broker • Revenue Tracker';
    if(by('carrierCountLabel'))by('carrierCountLabel').textContent=carrier?'Drivers / Owner Ops':'Carriers';
    if(by('truckCountLabel'))by('truckCountLabel').textContent=carrier?'Fleet trucks':'Active trucks';
    if(by('dashCommissionLabel'))by('dashCommissionLabel').textContent=carrier?'Estimated profit':'Dispatcher commission';
    const heroText=by('dashRevenue')?.parentElement?.querySelector('.muted');
    if(heroText)heroText.textContent=carrier?'Gross revenue from all saved loads.':'Estimated gross revenue from all saved loads.';
    if(!carrier)return;

    const category=by('expenseCategory');
    if(category&&!category.dataset.carrierOptions){
      const old=category.value;
      category.innerHTML=['Fuel','Truck payment','Trailer payment','Insurance','Maintenance / Repair','Tires','Tolls','Permits / IFTA','Driver pay','ELD','Factoring','Software','Other'].map(x=>'<option>'+safe(x)+'</option>').join('');
      if([...category.options].some(o=>o.value===old))category.value=old;
      category.dataset.carrierOptions='1';
    }
  }

  function payLabel(p){
    const rate=n(p.payRate);
    if(p.payType==='percentage')return rate+'% of load';
    if(p.payType==='flat')return usd(rate)+' per load';
    if(p.payType==='salary')return usd(rate)+' salary / overhead';
    return usd(rate)+' per mile';
  }

  async function requestLocation(p){
    const r=await sb.rpc('locate_request',{p_driver_name:p.name,p_driver_phone:p.phone||''});
    if(r.error)return alert(r.error.message);
    const base=location.origin+location.pathname.replace(/index\.html$/,'').replace(/\/$/,'/');
    const url=base+'locate.html?t='+r.data;
    try{await navigator.clipboard.writeText(url)}catch(_){ }
    const digits=String(p.phone||'').replace(/\D/g,'');
    const phone=digits.length===10?'1'+digits:digits;
    const message=encodeURIComponent((p.name?p.name+', ':'')+'please tap this link to share your current location with Zap Dispatch: '+url);
    const actions=phone?'<a class="small-btn" href="sms:+'+phone+'?&body='+message+'">Text (SMS)</a><a class="small-btn" target="_blank" rel="noopener" href="https://wa.me/'+phone+'?text='+message+'">WhatsApp</a>':'';
    let modal=by('carrierLocateModal');
    if(!modal){modal=document.createElement('div');modal.id='carrierLocateModal';modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px';document.body.appendChild(modal)}
    modal.innerHTML='<div class="card" style="width:min(520px,96vw)"><div class="section-title"><h2>Location request</h2><button class="small-btn" id="carrierLocateClose">Close</button></div><input readonly value="'+safe(url)+'"><div class="card-actions">'+actions+'<button class="small-btn" id="carrierLocateCopy">Copy link</button></div><p class="muted">Send the link to '+safe(p.name)+'. Their latest location stays private inside this carrier account.</p></div>';
    by('carrierLocateClose').onclick=()=>modal.remove();
    by('carrierLocateCopy').onclick=async()=>{try{await navigator.clipboard.writeText(url)}catch(_){ }by('carrierLocateCopy').textContent='Copied ✓'};
  }

  async function viewLocation(p){
    const r=await sb.from('driver_locates').select('latitude,longitude,located_at').eq('driver_name',p.name).eq('driver_phone',p.phone||'').not('located_at','is',null).order('located_at',{ascending:false}).limit(1);
    if(r.error)return alert(r.error.message);
    if(!r.data?.length)return alert('No location received yet. Send a location request first.');
    const x=r.data[0];
    window.open('https://www.google.com/maps?q='+x.latitude+','+x.longitude,'_blank');
  }

  function editPerson(p){
    editingId=p.id;
    by('fleetPersonType').value=p.personType||'company_driver';
    by('fleetPersonName').value=p.name||'';
    by('fleetPersonPhone').value=p.phone||'';
    by('fleetPersonEmail').value=p.email||'';
    by('fleetTruckNumber').value=p.truckNumber||'';
    by('fleetTrailerNumber').value=p.trailerNumber||'';
    by('fleetEquipment').value=p.equipment||'Reefer';
    by('fleetPayType').value=p.payType||'per_mile';
    by('fleetPayRate').value=p.payRate||0;
    by('fleetPersonNotes').value=p.notes||'';
    by('addFleetPerson').textContent='Save changes';
    navTo('fleet');
    by('fleetPersonName').focus();
  }

  async function removePerson(p){
    if(!confirm('Remove '+p.name+' from your active fleet? Existing loads keep their record.'))return;
    const saved=await updateRow('fleet_people',{...p,active:false});
    await sb.from('driver_locates').update({active:false}).eq('driver_name',p.name).eq('driver_phone',p.phone||'');
    return saved;
  }

  function personCard(p){
    const el=document.createElement('div');
    el.className='list-card';
    el.innerHTML='<h3>'+safe(p.name||'Unnamed')+'</h3><p class="muted">'+safe([p.equipment,p.truckNumber?'Truck '+p.truckNumber:'',p.trailerNumber?'Trailer '+p.trailerNumber:''].filter(Boolean).join(' • '))+'</p><div class="fleet-card-meta"><span class="pill">'+safe(payLabel(p))+'</span>'+(p.phone?'<span class="pill">'+safe(p.phone)+'</span>':'')+'</div>'+(p.notes?'<p class="muted">'+safe(p.notes)+'</p>':'')+'<div class="card-actions"><button class="small-btn edit-person">Edit</button><button class="small-btn locate-person">Request location</button><button class="small-btn view-person">View location</button><button class="small-btn remove-person">Remove</button></div>';
    el.querySelector('.edit-person').onclick=()=>editPerson(p);
    el.querySelector('.locate-person').onclick=()=>requestLocation(p);
    el.querySelector('.view-person').onclick=()=>viewLocation(p);
    el.querySelector('.remove-person').onclick=()=>removePerson(p);
    return el;
  }

  function renderPeople(){
    if(!isCarrier()||typeof appData==='undefined')return;
    const active=(appData.fleet_people||[]).filter(p=>p.active!==false);
    const groups=[['company_driver',by('companyDriversList'),by('companyDriverCount')],['owner_operator',by('ownerOperatorsList'),by('ownerOperatorCount')]];
    groups.forEach(([type,list,count])=>{
      if(!list)return;
      const rows=active.filter(p=>p.personType===type);
      if(count)count.textContent=String(rows.length);
      list.textContent='';
      if(!rows.length){list.innerHTML='<div class="card"><p class="muted">No '+(type==='company_driver'?'company drivers':'owner operators')+' yet.</p></div>';return}
      rows.forEach(p=>list.appendChild(personCard(p)));
    });
  }

  function updateCostSummary(){
    if(!isCarrier()||typeof appData==='undefined')return;
    const loads=appData.loads||[],expenses=appData.expenses||[];
    const gross=loads.reduce((s,l)=>s+n(l.rate),0);
    const loadCosts=loads.reduce((s,l)=>s+totalLoadCost(l),0);
    const overhead=expenses.reduce((s,e)=>s+n(e.amount),0);
    const miles=loads.reduce((s,l)=>s+n(l.miles),0);
    const profit=gross-loadCosts-overhead;
    const box=by('carrierCostSummary');
    if(!box)return;
    box.innerHTML='<div class="section-title"><div><p class="eyebrow">Carrier profitability</p><h2>Cost overview</h2></div><span class="pill '+(profit>=0?'green':'red')+'">Profit '+usd(profit)+'</span></div><div class="cost-preview"><div><span>Gross load revenue</span><strong>'+usd(gross)+'</strong></div><div><span>Costs assigned to loads</span><strong>'+usd(loadCosts)+'</strong></div><div><span>General business costs</span><strong>'+usd(overhead)+'</strong></div><div><span>Average cost per loaded mile</span><strong>'+usd(miles?loadCosts/miles:0)+'</strong></div><div><span>Total loaded miles</span><strong>'+miles.toLocaleString()+'</strong></div><div><span>Estimated net profit</span><strong class="'+(profit>=0?'profit-positive':'profit-negative')+'">'+usd(profit)+'</strong></div></div>';
  }

  function updateCostPreview(){
    if(!isCarrier())return;
    const total=['fuelCost','driverCost','tollsCost','maintenanceCost','otherCost'].reduce((s,id)=>s+n(by(id)?.value),0);
    const miles=n(by('loadMiles')?.value),rate=n(by('rate')?.value),profit=rate-total;
    if(by('newLoadTotalCost'))by('newLoadTotalCost').textContent=usd(total);
    if(by('newLoadCpm'))by('newLoadCpm').textContent=usd(miles?total/miles:0);
    if(by('newLoadRpm'))by('newLoadRpm').textContent=usd(miles?rate/miles:0);
    if(by('newLoadProfit')){by('newLoadProfit').textContent='Profit '+usd(profit);by('newLoadProfit').classList.toggle('red',profit<0);by('newLoadProfit').classList.toggle('green',profit>=0)}
  }

  function adaptInjectedUi(){
    if(!isCarrier())return;
    const dash=by('zapDash');if(dash)dash.style.display='none';
    const searchCopy=by('loadSearchBox')?.querySelector('.section-title .muted');if(searchCopy)searchCopy.textContent='Find loads by load #, broker, lane, driver, status, or date.';
    const search=by('zapSearch');if(search)search.placeholder='Load #, broker, pickup, delivery, driver...';
    const carrierFilter=by('zapCarrier');if(carrierFilter?.closest('label'))carrierFilter.closest('label').style.display='none';
    const statement=by('zapStatementBtn');if(statement)statement.style.display='none';
    const locatePanel=by('driverLocatePanel');if(locatePanel)locatePanel.style.display='none';
    const eldCarrier=by('eldCarrier');if(eldCarrier?.closest('label'))eldCarrier.closest('label').style.display='none';
    const mapCarrier=by('fleetMapCarrier');
    if(mapCarrier){
      const label=mapCarrier.closest('label');
      if(label&&label.childNodes[0])label.childNodes[0].textContent='ELD connection';
      if(mapCarrier.options[0])mapCarrier.options[0].textContent='All ELD connections';
    }
    const eldCopy=by('eldIntegrationsPanel')?.querySelector('.muted');if(eldCopy)eldCopy.textContent='Connect your carrier account to its ELD provider. API keys stay encrypted.';
    const pct=by('csPct');if(pct?.closest('label'))pct.closest('label').style.display='none';
  }

  function fleetFormRow(){return{
    personType:by('fleetPersonType').value,
    name:by('fleetPersonName').value.trim(),
    phone:by('fleetPersonPhone').value.trim(),
    email:by('fleetPersonEmail').value.trim(),
    truckNumber:by('fleetTruckNumber').value.trim(),
    trailerNumber:by('fleetTrailerNumber').value.trim(),
    equipment:by('fleetEquipment').value,
    payType:by('fleetPayType').value,
    payRate:by('fleetPayRate').value,
    notes:by('fleetPersonNotes').value.trim(),
    active:true
  }}

  async function saveFleetPerson(){
    const row=fleetFormRow();
    if(!row.name)return alert('Enter the driver or owner operator name.');
    if(editingId){const old=(appData.fleet_people||[]).find(p=>p.id===editingId);if(old)await updateRow('fleet_people',{...old,...row});}
    else await insertRow('fleet_people',row);
    editingId=null;
    ['fleetPersonName','fleetPersonPhone','fleetPersonEmail','fleetTruckNumber','fleetTrailerNumber','fleetPayRate','fleetPersonNotes'].forEach(id=>{if(by(id))by(id).value=''});
    by('addFleetPerson').textContent='Save';
  }

  function bind(){
    if(by('addFleetPerson')&&!by('addFleetPerson').dataset.bound){by('addFleetPerson').dataset.bound='1';by('addFleetPerson').onclick=saveFleetPerson}
    ['rate','loadMiles','fuelCost','driverCost','tollsCost','maintenanceCost','otherCost'].forEach(id=>{const el=by(id);if(el&&!el.dataset.costBound){el.dataset.costBound='1';el.addEventListener('input',updateCostPreview)}});
  }

  window.zapApplyFleetPerson=p=>{
    if(!p||!isCarrier())return;
    if(by('driverName'))by('driverName').value=p.name||'';
    if(by('driverPhone'))by('driverPhone').value=p.phone||'';
    if(by('truckNumber'))by('truckNumber').value=p.truckNumber||'';
    if(by('trailerNumber'))by('trailerNumber').value=p.trailerNumber||'';
    if(by('equipment')&&p.equipment)by('equipment').value=p.equipment;
    const miles=n(by('loadMiles')?.value),rate=n(by('rate')?.value),pay=n(p.payRate);
    let suggested=0;
    if(p.payType==='per_mile')suggested=miles*pay;
    else if(p.payType==='percentage')suggested=rate*pay/100;
    else if(p.payType==='flat')suggested=pay;
    if(by('driverCost')&&suggested>0)by('driverCost').value=suggested.toFixed(2);
    updateCostPreview();
  };
  window.zapUpdateCostPreview=updateCostPreview;
  window.zapRenderCarrierOperations=()=>{applyAccountUi();renderPeople();updateCostSummary();updateCostPreview();adaptInjectedUi()};

  function tick(){applyAccountUi();bind();renderPeople();updateCostSummary();updateCostPreview();adaptInjectedUi()}
  setTimeout(tick,600);
  setInterval(tick,5000);
})();
