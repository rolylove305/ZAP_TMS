(()=>{
const $=id=>document.getElementById(id);
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const usd=v=>{const x=n(v);return (x<0?'-$':'$')+Math.abs(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})};
const mi=v=>usd(v)+'/mi';
async function user(){return (await sb.auth.getSession()).data.session?.user}

async function loadDefaultCpm(){
  const u=await user();if(!u)return 0;
  const r=await sb.from('company_settings').select('default_cost_per_mile').eq('user_id',u.id).maybeSingle();
  return r.data?.default_cost_per_mile!=null?Number(r.data.default_cost_per_mile):0;
}
async function saveDefaultCpm(v){
  const u=await user();if(!u)return alert('Log in again first.');
  const r=await sb.from('company_settings').upsert({user_id:u.id,default_cost_per_mile:v,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(r.error)alert(r.error.message);
}
function setText(id,value){const el=$(id);if(el)el.textContent=value}
function setMoneyColor(id,value){const el=$(id);if(!el)return;el.textContent=usd(value);el.style.color=value<0?'var(--red)':'var(--green)'}

function computeLoad(){
  const rate=n($('rcRate')?.value),loaded=n($('rcLoadedMiles')?.value),deadhead=n($('rcDeadheadMiles')?.value),cpm=n($('rcCpm')?.value);
  const totalMiles=loaded+deadhead;
  const loadedRpm=loaded?rate/loaded:0;
  const allMilesRpm=totalMiles?rate/totalMiles:0;
  const totalCost=cpm*totalMiles;
  const profit=rate-totalCost;
  const profitPerMile=totalMiles?profit/totalMiles:0;
  const margin=rate?profit/rate*100:0;
  const deadheadPct=totalMiles?deadhead/totalMiles*100:0;
  setText('rcTotalMiles',totalMiles.toLocaleString('en-US'));
  setText('rcRpm',mi(loadedRpm));
  setText('rcAllMilesRpm',mi(allMilesRpm));
  setText('rcOperatingCpm',mi(cpm));
  setText('rcTotalCost',usd(totalCost));
  setMoneyColor('rcProfit',profit);
  const ppm=$('rcProfitPerMile');if(ppm){ppm.textContent=mi(profitPerMile);ppm.style.color=profitPerMile<0?'var(--red)':'var(--green)'}
  setText('rcMargin',margin.toFixed(1)+'%');
  setText('rcDeadheadPct',deadheadPct.toFixed(1)+'%');
  if($('rcProfitBadge'))$('rcProfitBadge').style.display=profit<0?'inline-block':'none';
  let verdict='Enter the load details to calculate.';
  let color='var(--muted)';
  if(rate&&totalMiles){
    if(profit<0){verdict='DO NOT BOOK — this load loses money.';color='var(--red)'}
    else if(margin>=25&&profitPerMile>=0.50){verdict='STRONG LOAD — healthy profit and margin.';color='var(--green)'}
    else if(profit>0){verdict='REVIEW — profitable, but the margin is thin.';color='var(--yellow)'}
  }
  const rec=$('rcRecommendation');if(rec){rec.textContent=verdict;rec.style.color=color}
}

function computeCpm(){
  const monthlyMiles=n($('cpmMonthlyMiles')?.value);
  const fixed=n($('cpmTruck')?.value)+n($('cpmInsurance')?.value)+n($('cpmPermits')?.value)+n($('cpmOffice')?.value)+n($('cpmOtherFixed')?.value);
  const variable=n($('cpmFuel')?.value)+n($('cpmDriver')?.value)+n($('cpmMaintenance')?.value)+n($('cpmTires')?.value)+n($('cpmTolls')?.value)+n($('cpmOtherVariable')?.value);
  const fixedPerMile=monthlyMiles?fixed/monthlyMiles:0;
  const totalCpm=fixedPerMile+variable;
  const monthlyCost=fixed+(variable*monthlyMiles);
  setText('cpmFixedTotal',usd(fixed));
  setText('cpmFixedPerMile',mi(fixedPerMile));
  setText('cpmVariablePerMile',mi(variable));
  setText('cpmTotal',mi(totalCpm));
  setText('cpmMonthlyCost',usd(monthlyCost));
  return totalCpm;
}
function computeFuel(){
  const miles=n($('fuelMiles')?.value),mpg=n($('fuelMpg')?.value),price=n($('fuelPrice')?.value);
  const gallons=mpg?miles/mpg:0,cost=gallons*price,cpm=miles?cost/miles:0;
  setText('fuelGallons',gallons.toLocaleString('en-US',{maximumFractionDigits:1}));
  setText('fuelCost',usd(cost));
  setText('fuelCpm',mi(cpm));
}
function computeCommission(){
  const gross=n($('commGross')?.value),pct=n($('commPct')?.value);
  const fee=gross*pct/100;
  setText('commFee',usd(fee));setText('commCarrierNet',usd(gross-fee));
}
function computeWeekly(){
  const loads=n($('wkLoads')?.value),avgRate=n($('wkAvgRate')?.value),miles=n($('wkMiles')?.value),cpm=n($('wkCpm')?.value);
  const revenue=loads*avgRate,cost=miles*cpm,profit=revenue-cost;
  setText('wkRevenue',usd(revenue));setText('wkCost',usd(cost));setText('wkProfit',usd(profit));setText('wkRpm',mi(miles?revenue/miles:0));
}
function closeCard(){const c=$('rateCalcCard');if(c)c.style.display='none'}
function toggleCard(){const c=$('rateCalcCard');if(!c)return;c.style.display=c.style.display==='none'?'block':'none'}
function showTab(name){
  document.querySelectorAll('#rateCalcCard [data-calc-panel]').forEach(p=>p.style.display=p.dataset.calcPanel===name?'block':'none');
  document.querySelectorAll('#rateCalcCard [data-calc-tab]').forEach(b=>b.classList.toggle('active-tab',b.dataset.calcTab===name));
}
function useInNewLoad(){
  const rateEl=$('rate'),milesEl=$('loadMiles');
  if(rateEl)rateEl.value=$('rcRate')?.value||'';
  if(milesEl)milesEl.value=$('rcLoadedMiles')?.value||'';
  if(window.zapUpdateCostPreview)window.zapUpdateCostPreview();
  if(typeof saveDraft==='function')saveDraft();
  closeCard();rateEl?.scrollIntoView({behavior:'smooth',block:'center'});
}
function field(label,id,placeholder,step='0.01',value=''){return '<label>'+label+'<input id="'+id+'" type="number" min="0" step="'+step+'" placeholder="'+placeholder+'"'+(value!==''?' value="'+value+'"':'')+'></label>'}
function metric(label,id,initial='$0.00'){return '<div><span>'+label+'</span><strong id="'+id+'">'+initial+'</strong></div>'}

async function panel(){
  const host=$('loads');if(!host||$('rateCalcBtn'))return;
  const title=host.querySelector('.section-title');
  const btn=document.createElement('button');btn.id='rateCalcBtn';btn.className='small-btn';btn.type='button';btn.textContent='🧮 Trucking Calculators';btn.style.marginLeft='8px';btn.onclick=toggleCard;if(title)title.appendChild(btn);
  const card=document.createElement('div');card.id='rateCalcCard';card.className='card';card.style.display='none';card.style.margin='0 0 14px';
  card.innerHTML='<div class="section-title"><h2>Trucking Calculator Suite</h2><button id="rcClose" class="small-btn" type="button">Close</button></div>'
    +'<div class="auth-tabs" style="display:flex;gap:6px;overflow-x:auto;margin-bottom:14px;padding-bottom:4px">'
      +'<button class="small-btn active-tab" data-calc-tab="load">Load Profit</button><button class="small-btn" data-calc-tab="cpm">CPM Builder</button><button class="small-btn" data-calc-tab="fuel">Fuel</button><button class="small-btn" data-calc-tab="commission">Commission</button><button class="small-btn" data-calc-tab="weekly">Weekly</button>'
    +'</div>'
    +'<div data-calc-panel="load"><p class="muted">Check profit, break-even cost and revenue per total mile before booking.</p><div class="form-grid">'
      +field('Load pays $','rcRate','2500')+field('Loaded miles','rcLoadedMiles','850','1')+field('Deadhead / empty miles','rcDeadheadMiles','0','1','0')+field('Your all-in cost per mile $','rcCpm','1.55')
    +'</div><div class="cost-preview">'+metric('Total miles','rcTotalMiles','0')+metric('Rate per loaded mile','rcRpm','$0.00/mi')+metric('Revenue per total mile','rcAllMilesRpm','$0.00/mi')+metric('Operating CPM / break-even','rcOperatingCpm','$0.00/mi')+metric('Total operating cost','rcTotalCost')+'<div><span>Net profit</span><strong id="rcProfit" style="color:var(--green)">$0.00</strong><span id="rcProfitBadge" class="pill red" style="display:none;margin-top:4px;width:fit-content">⚠ LOSS</span></div>'+metric('Profit per mile','rcProfitPerMile','$0.00/mi')+metric('Profit margin','rcMargin','0.0%')+metric('Deadhead percentage','rcDeadheadPct','0.0%')+'</div><div class="card" style="margin-top:10px"><b>Recommendation</b><p id="rcRecommendation" class="muted" style="margin:6px 0 0">Enter the load details to calculate.</p></div><div class="card-actions"><button id="rcSaveDefault" class="small-btn" type="button">Save default cost/mile</button><button id="rcUseLoad" class="small-btn" type="button">Use in new load ↓</button></div></div>'
    +'<div data-calc-panel="cpm" style="display:none"><p class="muted">Build your real company cost per mile from fixed monthly costs and variable costs.</p><div class="form-grid">'
      +field('Expected monthly miles','cpmMonthlyMiles','10000','1')+field('Truck payment / month $','cpmTruck','2500')+field('Insurance / month $','cpmInsurance','1800')+field('Permits, plates & compliance / month $','cpmPermits','300')+field('Office & software / month $','cpmOffice','250')+field('Other fixed costs / month $','cpmOtherFixed','0')+field('Fuel cost per mile $','cpmFuel','0.65')+field('Driver pay per mile $','cpmDriver','0.60')+field('Maintenance reserve per mile $','cpmMaintenance','0.18')+field('Tires reserve per mile $','cpmTires','0.05')+field('Tolls per mile $','cpmTolls','0.04')+field('Other variable cost per mile $','cpmOtherVariable','0')
    +'</div><div class="cost-preview">'+metric('Monthly fixed costs','cpmFixedTotal')+metric('Fixed cost per mile','cpmFixedPerMile','$0.00/mi')+metric('Variable cost per mile','cpmVariablePerMile','$0.00/mi')+metric('True operating CPM','cpmTotal','$0.00/mi')+metric('Estimated monthly operating cost','cpmMonthlyCost')+'</div><div class="card-actions"><button id="cpmUseRate" class="small-btn" type="button">Use this CPM in Load Profit</button><button id="cpmSaveRate" class="small-btn" type="button">Save as company default</button></div></div>'
    +'<div data-calc-panel="fuel" style="display:none"><div class="form-grid">'+field('Trip miles','fuelMiles','850','1')+field('Truck MPG','fuelMpg','7.2','0.1')+field('Diesel price per gallon $','fuelPrice','3.75')+'</div><div class="cost-preview">'+metric('Gallons needed','fuelGallons','0')+metric('Estimated fuel cost','fuelCost')+metric('Fuel cost per mile','fuelCpm','$0.00/mi')+'</div></div>'
    +'<div data-calc-panel="commission" style="display:none"><div class="form-grid">'+field('Load gross $','commGross','2500')+field('Dispatch commission %','commPct','8','0.1')+'</div><div class="cost-preview">'+metric('Dispatch fee','commFee')+metric('Carrier receives','commCarrierNet')+'</div></div>'
    +'<div data-calc-panel="weekly" style="display:none"><div class="form-grid">'+field('Loads per week','wkLoads','5','1')+field('Average rate per load $','wkAvgRate','2200')+field('Total weekly miles','wkMiles','3500','1')+field('Operating CPM $','wkCpm','1.55')+'</div><div class="cost-preview">'+metric('Weekly gross revenue','wkRevenue')+metric('Weekly operating cost','wkCost')+metric('Estimated weekly profit','wkProfit')+metric('Weekly revenue per mile','wkRpm','$0.00/mi')+'</div></div>';
  host.insertBefore(card,host.querySelector('.card'));
  card.querySelectorAll('[data-calc-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.calcTab));
  ['rcRate','rcLoadedMiles','rcDeadheadMiles','rcCpm'].forEach(id=>$(id)?.addEventListener('input',computeLoad));
  ['cpmMonthlyMiles','cpmTruck','cpmInsurance','cpmPermits','cpmOffice','cpmOtherFixed','cpmFuel','cpmDriver','cpmMaintenance','cpmTires','cpmTolls','cpmOtherVariable'].forEach(id=>$(id)?.addEventListener('input',computeCpm));
  ['fuelMiles','fuelMpg','fuelPrice'].forEach(id=>$(id)?.addEventListener('input',computeFuel));
  ['commGross','commPct'].forEach(id=>$(id)?.addEventListener('input',computeCommission));
  ['wkLoads','wkAvgRate','wkMiles','wkCpm'].forEach(id=>$(id)?.addEventListener('input',computeWeekly));
  $('rcClose').onclick=closeCard;$('rcUseLoad').onclick=useInNewLoad;
  $('rcSaveDefault').onclick=async()=>{await saveDefaultCpm(n($('rcCpm')?.value));$('rcSaveDefault').textContent='Saved ✓';setTimeout(()=>{if($('rcSaveDefault'))$('rcSaveDefault').textContent='Save default cost/mile'},1500)};
  $('cpmUseRate').onclick=()=>{const value=computeCpm();$('rcCpm').value=value.toFixed(2);computeLoad();showTab('load')};
  $('cpmSaveRate').onclick=async()=>{const value=computeCpm();await saveDefaultCpm(value);$('cpmSaveRate').textContent='Saved ✓';setTimeout(()=>{if($('cpmSaveRate'))$('cpmSaveRate').textContent='Save as company default'},1500)};
  const saved=await loadDefaultCpm();if(saved){if($('rcCpm'))$('rcCpm').value=saved;if($('wkCpm'))$('wkCpm').value=saved}
  computeLoad();computeCpm();computeFuel();computeCommission();computeWeekly();
}
setTimeout(panel,1200);
})();