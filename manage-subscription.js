(()=>{
  /* Adds a "Manage subscription" button to the topbar for users who have a
     Stripe customer (i.e. have subscribed). It opens the Stripe Billing Portal
     via create-portal-session so they can update payment / cancel. Isolated
     overlay; only shows when the profile has a stripe_customer_id. */

  let checked=false, hasCustomer=false;

  async function sessionUserId(){
    try{const s=(await sb.auth.getSession()).data.session;return s?s.user.id:null}catch(e){return null}
  }

  async function loadHasCustomer(uid){
    try{
      const r=await sb.from('profiles').select('stripe_customer_id').eq('id',uid).single();
      return !r.error && r.data && !!r.data.stripe_customer_id;
    }catch(e){return false}
  }

  async function openPortal(btn){
    const label=btn.textContent;
    btn.disabled=true;btn.textContent='Opening…';
    try{
      const s=(await sb.auth.getSession()).data.session;
      if(!s){alert('Please log in again.');return}
      const res=await fetch(cfg.url+'/functions/v1/create-portal-session',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.access_token,'apikey':cfg.token},
        body:'{}'
      });
      const data=await res.json().catch(()=>null);
      if(data&&data.url){location.href=data.url;return}
      alert('Could not open the billing portal: '+((data&&data.error)||('HTTP '+res.status)));
    }catch(e){alert('Billing portal error: '+(e&&e.message?e.message:e))}
    btn.disabled=false;btn.textContent=label;
  }

  function injectButton(){
    if(document.getElementById('zapManageSubBtn'))return;
    const actions=document.querySelector('.top-actions');
    if(!actions)return;
    const btn=document.createElement('button');
    btn.id='zapManageSubBtn';
    btn.className='small-btn';
    btn.textContent='Manage subscription';
    btn.onclick=()=>openPortal(btn);
    actions.insertBefore(btn,actions.firstChild);
  }
  function removeButton(){const b=document.getElementById('zapManageSubBtn');if(b)b.remove()}

  async function tick(){
    if(typeof sb==='undefined'||!sb||typeof cfg==='undefined')return;
    const uid=await sessionUserId();
    if(!uid){checked=false;hasCustomer=false;removeButton();return}
    if(!checked){hasCustomer=await loadHasCustomer(uid);checked=true;}
    if(hasCustomer)injectButton(); else removeButton();
  }

  window.zapManageSubCheck=tick;   /* allow forcing a re-check */
  setInterval(tick,3000);
  tick();
})();
