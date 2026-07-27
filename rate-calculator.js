(()=>{
const $=id=>document.getElementById(id);
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const usd=v=>{const x=n(v);return (x<0?'-$':'$')+Math.abs(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})};
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

function compute(){
  const rate=n($('rcRate')?.value),loaded=n($('rcLoadedMiles')?.value),deadhead=n($('rcDeadheadMiles')?.value),cpm=n($('rcCpm')?.value);
  const totalMiles=loaded+deadhead,rpm=loaded?rate/loaded:0,totalCost=cpm*totalMiles,profit=rate-totalCost,profitPerMile=totalMiles?profit/totalMiles:0;
  if($('rcTotalMiles'))$('rcTotalMiles').textContent=totalMiles.toLocaleString();
  if($('rcRpm'))$('rcRpm').textContent=usd(rpm)+'/mi';
  if($('rcTotalCost'))$('rcTotalCost').textContent=usd(totalCost);
  if($('rcProfit')){$('rcProfit').textContent=usd(profit);$('rcProfit').style.color=profit<0?'var(--red)':'var(--green)'}
  if($('rcProfitBadge'))$('rcProfitBadge').style.display=profit<0?'inline-block':'none';
  if($('rcProfitPerMile')){$('rcProfitPerMile').textContent=usd(profitPerMile)+'/mi';$('rcProfitPerMile').style.color=profitPerMile<0?'var(--red)':'var(--green)'}
}

function closeCard(){const c=$('rateCalcCard');if(c)c.style.display='none'}
function toggleCard(){const c=$('rateCalcCard');if(!c)return;c.style.display=c.style.display==='none'?'block':'none'}

function useInNewLoad(){
  const rateEl=$('rate'),milesEl=$('loadMiles');
  if(rateEl)rateEl.value=$('rcRate')?.value||'';
  if(milesEl)milesEl.value=$('rcLoadedMiles')?.value||'';
  if(window.zapUpdateCostPreview)window.zapUpdateCostPreview();
  if(typeof saveDraft==='function')saveDraft();
  closeCard();
  rateEl?.scrollIntoView({behavior:'smooth',block:'center'});
}

async function panel(){
  const host=document.getElementById('loads');
  if(!host||$('rateCalcBtn'))return;
  const title=host.querySelector('.section-title');
  const btn=document.createElement('button');
  btn.id='rateCalcBtn';btn.className='small-btn';btn.type='button';btn.textContent='🧮 Rate Calculator';
  btn.style.marginLeft='8px';btn.onclick=toggleCard;
  if(title)title.appendChild(btn);

  const card=document.createElement('div');
  card.id='rateCalcCard';card.className='card';card.style.display='none';card.style.margin='0 0 14px';
  card.innerHTML=
    '<div class="section-title"><h2>Rate Calculator</h2><button id="rcClose" class="small-btn" type="button">Close</button></div>'
    +'<p class="muted" style="margin:-4px 0 10px">Check a load\'s profit before you book it — pay vs. the real cost of running the truck.</p>'
    +'<div class="form-grid">'
      +'<label>Load pays $<input id="rcRate" type="number" min="0" step="0.01" placeholder="2500"></label>'
      +'<label>Loaded miles<input id="rcLoadedMiles" type="number" min="0" step="1" placeholder="850"></label>'
      +'<label>Deadhead / empty miles<input id="rcDeadheadMiles" type="number" min="0" step="1" value="0"></label>'
      +'<label>Your cost per mile $<input id="rcCpm" type="number" min="0" step="0.01" placeholder="1.55"><small class="muted">Fuel, driver pay, insurance, maintenance, truck payment — all-in cost to run the truck.</small></label>'
    +'</div>'
    +'<div class="cost-preview">'
      +'<div><span>Total miles</span><strong id="rcTotalMiles">0</strong></div>'
      +'<div><span>Rate per loaded mile</span><strong id="rcRpm">$0.00/mi</strong></div>'
      +'<div><span>Total operating cost</span><strong id="rcTotalCost">$0.00</strong></div>'
      +'<div><span>Net profit</span><strong id="rcProfit" style="color:var(--green)">$0.00</strong><span id="rcProfitBadge" class="pill red" style="display:none;margin-top:4px;width:fit-content">⚠ LOSS</span></div>'
      +'<div><span>Profit per mile</span><strong id="rcProfitPerMile" style="color:var(--green)">$0.00/mi</strong></div>'
    +'</div>'
    +'<div class="card-actions">'
      +'<button id="rcSaveDefault" class="small-btn" type="button">Save as my default cost/mile</button>'
      +'<button id="rcUseLoad" class="small-btn" type="button">Use in new load ↓</button>'
    +'</div>';
  host.insertBefore(card,host.querySelector('.card'));

  ['rcRate','rcLoadedMiles','rcDeadheadMiles','rcCpm'].forEach(id=>$(id)?.addEventListener('input',compute));
  $('rcClose').onclick=closeCard;
  $('rcUseLoad').onclick=useInNewLoad;
  $('rcSaveDefault').onclick=async()=>{
    await saveDefaultCpm(n($('rcCpm')?.value));
    $('rcSaveDefault').textContent='Saved ✓';
    setTimeout(()=>{if($('rcSaveDefault'))$('rcSaveDefault').textContent='Save as my default cost/mile'},1500);
  };

  const saved=await loadDefaultCpm();
  if(saved&&$('rcCpm'))$('rcCpm').value=saved;
  compute();
}
setTimeout(panel,1200);
})();
