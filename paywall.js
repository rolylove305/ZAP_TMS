(()=>{
  /* Paywall overlay. Owners/admins always bypass billing and trials. */
  const PLANS={
    founder:{name:'Founder',price:'$29.99/month',summary:'100 loads/month, 10 carriers, and core dispatch tools.'},
    starter:{name:'Starter',price:'$49.99/month',summary:'200 loads/month, 25 carriers, plus ELD/HOS readiness.'},
    pro:{name:'Pro',price:'$99.99/month',summary:'1,000 loads/month, 100 carriers, ELD/HOS, and AI RateCon.'},
    premium:{name:'Premium',price:'$149.99/month',summary:'Fair-use unlimited operations, ELD/HOS, AI, and premium support.'}
  };
  const PLAN_ORDER=['founder','starter','pro','premium'];

  function planFromUrl(){
    try{const p=new URLSearchParams(location.search).get('plan');return PLANS[p]?p:'founder'}catch(e){return 'founder'}
  }
  let selectedPlan=planFromUrl();
  function priceLabel(plan){const p=PLANS[plan]||PLANS.founder;return p.price+' '+p.name}
  function isOwnerRole(role){return role==='owner'||role==='admin'}

  async function getProfile(){
    try{
      const s=(await sb.auth.getSession()).data.session;
      if(!s)return {none:true};
      const r=await sb.from('profiles').select('role,is_active,trial_ends_at,subscription_status,plan').eq('id',s.user.id).single();
      if(r.error)return null;
      if(isOwnerRole(r.data.role)){
        window.zapIsOwner=true;
        window.zapIsAdmin=true;
      }
      return r.data;
    }catch(e){return null}
  }

  function hasAccess(p){
    if(!p||p.none)return !!(p&&p.none);
    if(isOwnerRole(p.role))return true;
    if(!p.is_active)return false;
    if(p.subscription_status==='active')return true;
    if(p.trial_ends_at&&new Date(p.trial_ends_at)>new Date())return true;
    return false;
  }
  function trialExpired(p){return p&&p.trial_ends_at&&new Date(p.trial_ends_at)<=new Date()}

  async function subscribe(btn){
    const plan=(document.querySelector('input[name="zapPlan"]:checked')||{}).value||selectedPlan||'founder';
    selectedPlan=PLANS[plan]?plan:'founder';
    btn.disabled=true;btn.textContent='Opening secure checkout…';
    try{
      const s=(await sb.auth.getSession()).data.session;
      if(!s){alert('Please log in again.');return}
      const res=await fetch(cfg.url+'/functions/v1/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token,'apikey':cfg.token},body:JSON.stringify({plan:selectedPlan})});
      const data=await res.json().catch(()=>null);
      if(data&&data.url){location.href=data.url;return}
      alert('Could not start checkout: '+((data&&data.error)||('HTTP '+res.status)));
    }catch(e){alert('Checkout error: '+(e&&e.message?e.message:e))}
    btn.disabled=false;btn.textContent='Subscribe — '+priceLabel(selectedPlan);
  }

  function planOptions(){
    return '<div style="display:grid;gap:8px;margin:18px 0;text-align:left">'+PLAN_ORDER.map(key=>{const p=PLANS[key],checked=key===selectedPlan?' checked':'';return '<label style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;border:1px solid rgba(148,163,184,.35);border-radius:10px;padding:12px;background:rgba(255,255,255,.04);cursor:pointer"><input type="radio" name="zapPlan" value="'+esc(key)+'"'+checked+' style="margin-top:3px"><span><b style="display:flex;justify-content:space-between;gap:12px"><span>'+esc(p.name)+'</span><span>'+esc(p.price)+'</span></b><small class="muted" style="display:block;margin-top:5px;line-height:1.45">'+esc(p.summary)+'</small></span></label>'}).join('')+'</div>';
  }

  function showPaywall(p){
    if(isOwnerRole(p&&p.role)){hidePaywall();return}
    if(document.getElementById('zapPaywall'))return;
    const suspended=p&&p.none!==true&&!p.is_active,expired=trialExpired(p),pastDue=p&&p.subscription_status==='past_due';
    let title,sub;
    if(suspended){title='Account suspended';sub='Your access has been turned off by an administrator. Please contact Zap Dispatch support.'}
    else if(pastDue){title='Payment problem';sub='Your last payment failed. Subscribe again to keep using Zap Dispatch TMS.'}
    else if(expired){title='Your free trial has ended';sub='Subscribe to keep using Zap Dispatch TMS. Your data is safe — it will be right here when you subscribe.'}
    else {title='Subscription required';sub='Subscribe to keep using Zap Dispatch TMS. Your data is safe — it will be right here when you subscribe.'}
    const el=document.createElement('div');el.id='zapPaywall';el.style.cssText='position:fixed;inset:0;z-index:100000;background:#061827;display:flex;align-items:center;justify-content:center;padding:20px';
    const buy=suspended?'':planOptions()+'<button class="primary-btn" id="zapSubBtn" style="width:100%;margin-top:8px">Subscribe — '+priceLabel(selectedPlan)+'</button><p style="margin-top:16px;font-size:13px"><a href="#" id="zapPwRefresh" class="muted">I already paid — refresh</a></p>';
    el.innerHTML='<div class="card" style="max-width:460px;width:100%;text-align:center"><p class="eyebrow">Zap Dispatch</p><h2 style="margin:6px 0 8px">'+esc(title)+'</h2><p class="muted">'+esc(sub)+'</p>'+buy+'<p style="margin-top:16px;font-size:13px"><a href="#" id="zapPwLogout" class="muted">Log out</a></p></div>';
    document.body.appendChild(el);
    const subBtn=el.querySelector('#zapSubBtn');if(subBtn)subBtn.onclick=()=>subscribe(subBtn);
    el.querySelectorAll('input[name="zapPlan"]').forEach(input=>{input.onchange=()=>{selectedPlan=input.value;if(subBtn)subBtn.textContent='Subscribe — '+priceLabel(selectedPlan)}});
    const refresh=el.querySelector('#zapPwRefresh');if(refresh)refresh.onclick=async e=>{e.preventDefault();await check()};
    el.querySelector('#zapPwLogout').onclick=async e=>{e.preventDefault();try{await sb.auth.signOut()}catch(_){}location.reload()};
  }
  function hidePaywall(){const el=document.getElementById('zapPaywall');if(el)el.remove()}
  function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}

  async function check(){
    if(typeof sb==='undefined'||typeof cfg==='undefined')return;
    const s=(await sb.auth.getSession()).data.session;
    if(!s){hidePaywall();return}
    const p=await getProfile();
    if(p===null)return;
    if(hasAccess(p))hidePaywall();else showPaywall(p);
  }

  async function handleReturn(){
    if(!/[?&]paid=1/.test(location.search))return;
    for(let i=0;i<8;i++){const p=await getProfile();if(hasAccess(p)){hidePaywall();break}await new Promise(r=>setTimeout(r,1500))}
    try{history.replaceState(null,'',location.origin+location.pathname)}catch(_){}
  }

  window.zapPaywallCheck=check;
  setInterval(check,5000);check();handleReturn();
})();