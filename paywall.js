(()=>{
  /* Paywall overlay. When a logged-in user has no access (trial expired and no
     active subscription, or admin-deactivated), covers the app with a
     "Subscribe" screen that launches Stripe Checkout via create-checkout-session.
     Server-side RLS (has_access) is the real gate; this is the UX layer so a
     lapsed user sees a clear paywall instead of an empty app. Admins and
     active/trial users never see it. */

  const PRICE_LABEL='$29.99/month';

  async function getProfile(){
    try{
      const s=(await sb.auth.getSession()).data.session;
      if(!s)return {none:true};
      const r=await sb.from('profiles')
        .select('role,is_active,trial_ends_at,subscription_status')
        .eq('id',s.user.id).single();
      if(r.error)return null;
      return r.data;
    }catch(e){return null}
  }

  function hasAccess(p){
    if(!p||p.none||!p.is_active)return !!(p&&p.none);
    if(p.role==='admin')return true;
    if(p.subscription_status==='active')return true;
    if(p.trial_ends_at && new Date(p.trial_ends_at)>new Date())return true;
    return false;
  }
  function trialExpired(p){return p&&p.trial_ends_at&&new Date(p.trial_ends_at)<=new Date()}

  async function subscribe(btn){
    btn.disabled=true;btn.textContent='Opening secure checkout…';
    try{
      const s=(await sb.auth.getSession()).data.session;
      if(!s){alert('Please log in again.');return}
      const res=await fetch(cfg.url+'/functions/v1/create-checkout-session',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token,'apikey':cfg.token},
        body:'{}'
      });
      const data=await res.json().catch(()=>null);
      if(data&&data.url){location.href=data.url;return}
      alert('Could not start checkout: '+((data&&data.error)||('HTTP '+res.status)));
    }catch(e){alert('Checkout error: '+(e&&e.message?e.message:e))}
    btn.disabled=false;btn.textContent='Subscribe — '+PRICE_LABEL;
  }

  function showPaywall(p){
    if(document.getElementById('zapPaywall'))return;
    const suspended=p&&p.none!==true&&!p.is_active;
    const expired=trialExpired(p);
    const pastDue=p&&p.subscription_status==='past_due';
    let title,sub;
    if(suspended){title='Account suspended';sub='Your access has been turned off by an administrator. Please contact Zap Dispatch support.';}
    else if(pastDue){title='Payment problem';sub='Your last payment failed. Subscribe again to keep using Zap Dispatch TMS.';}
    else if(expired){title='Your free trial has ended';sub='Subscribe to keep using Zap Dispatch TMS. Your data is safe — it will be right here when you subscribe.';}
    else {title='Subscription required';sub='Subscribe to keep using Zap Dispatch TMS. Your data is safe — it will be right here when you subscribe.';}

    const el=document.createElement('div');
    el.id='zapPaywall';
    el.style.cssText='position:fixed;inset:0;z-index:100000;background:#061827;display:flex;align-items:center;justify-content:center;padding:20px';
    const buy=suspended?''
      :'<p style="font-size:28px;font-weight:800;margin:16px 0 4px">'+PRICE_LABEL+'</p>'
       +'<p class="muted" style="font-size:12px;margin-top:0">Cancel anytime.</p>'
       +'<button class="primary-btn" id="zapSubBtn" style="width:100%;margin-top:8px">Subscribe — '+PRICE_LABEL+'</button>'
       +'<p style="margin-top:16px;font-size:13px"><a href="#" id="zapPwRefresh" class="muted">I already paid — refresh</a></p>';
    el.innerHTML='<div class="card" style="max-width:460px;width:100%;text-align:center">'
      +'<p class="eyebrow">Zap Dispatch</p>'
      +'<h2 style="margin:6px 0 8px">'+esc(title)+'</h2>'
      +'<p class="muted">'+esc(sub)+'</p>'
      +buy
      +'<p style="margin-top:16px;font-size:13px"><a href="#" id="zapPwLogout" class="muted">Log out</a></p>'
      +'</div>';
    document.body.appendChild(el);
    const subBtn=el.querySelector('#zapSubBtn');
    if(subBtn)subBtn.onclick=()=>subscribe(subBtn);
    const refresh=el.querySelector('#zapPwRefresh');
    if(refresh)refresh.onclick=async(e)=>{e.preventDefault();await check();};
    el.querySelector('#zapPwLogout').onclick=async(e)=>{e.preventDefault();try{await sb.auth.signOut()}catch(_){}location.reload()};
  }
  function hidePaywall(){const el=document.getElementById('zapPaywall');if(el)el.remove()}

  function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}

  async function check(){
    if(typeof sb==='undefined'||typeof cfg==='undefined')return;
    const s=(await sb.auth.getSession()).data.session;
    if(!s){hidePaywall();return}           /* login screen handles logged-out */
    const p=await getProfile();
    if(p===null)return;                     /* transient read error: don't lock out */
    if(hasAccess(p))hidePaywall(); else showPaywall(p);
  }

  /* Returning from Stripe (success_url = /?paid=1): the webhook flips
     subscription_status async, so poll a few times before giving up. */
  async function handleReturn(){
    if(!/[?&]paid=1/.test(location.search))return;
    for(let i=0;i<8;i++){
      const p=await getProfile();
      if(hasAccess(p)){hidePaywall();break}
      await new Promise(r=>setTimeout(r,1500));
    }
    try{history.replaceState(null,'',location.origin+location.pathname)}catch(_){}
  }

  window.zapPaywallCheck=check;   /* allow other code to force a re-check */
  setInterval(check,5000);
  check();
  handleReturn();
})();
