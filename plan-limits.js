(()=>{
  const PLAN_LIMITS={
    founder:{
      name:"Founder",
      price:"$29.99/month",
      loadsPerMonth:100,
      carriers:10,
      fleetPeople:10,
      features:{aiRatecon:false,eldHos:false,customBranding:false}
    },
    starter:{
      name:"Starter",
      price:"$49.99/month",
      loadsPerMonth:200,
      carriers:25,
      fleetPeople:25,
      features:{aiRatecon:false,eldHos:true,customBranding:false}
    },
    pro:{
      name:"Pro",
      price:"$99.99/month",
      loadsPerMonth:1000,
      carriers:100,
      fleetPeople:100,
      features:{aiRatecon:true,eldHos:true,customBranding:false}
    },
    premium:{
      name:"Premium",
      price:"$149.99/month",
      loadsPerMonth:null,
      carriers:null,
      fleetPeople:null,
      features:{aiRatecon:true,eldHos:true,customBranding:true}
    }
  };
  let currentPlan="founder";
  let loaded=false;

  function isAdmin(){
    return window.zapIsAdmin===true;
  }
  function monthKey(dateValue){
    const d=dateValue?new Date(dateValue):new Date();
    if(Number.isNaN(d.getTime()))return "";
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  }
  function thisMonthLoads(){
    const key=monthKey();
    return ((window.appData&&window.appData.loads)||[]).filter(l=>monthKey(l.createdAt||l.created_at)===key).length;
  }
  function limitLabel(limit){return limit==null?"unlimited":String(limit)}
  function plan(){return isAdmin()?PLAN_LIMITS.premium:(PLAN_LIMITS[currentPlan]||PLAN_LIMITS.founder)}
  function upgradeMessage(feature){
    const p=plan();
    if(feature==="loads")return `${p.name} includes ${limitLabel(p.loadsPerMonth)} loads per month. Upgrade to keep adding loads.`;
    if(feature==="carriers")return `${p.name} includes ${limitLabel(p.carriers)} carriers. Upgrade to add more carriers.`;
    if(feature==="fleetPeople")return `${p.name} includes ${limitLabel(p.fleetPeople)} drivers / owner operators. Upgrade to add more.`;
    if(feature==="aiRatecon")return "AI RateCon reading is available on Pro and Premium.";
    if(feature==="eldHos")return "ELD/HOS readiness is available on Starter and higher.";
    return "This feature requires a higher Zap Dispatch plan.";
  }
  function showUpgrade(message){
    const text=message||"Upgrade your Zap Dispatch plan to continue.";
    if(typeof showToast==="function")showToast(text,"warning",6000);
    alert(text);
  }
  async function loadPlan(){
    if(loaded)return currentPlan;
    loaded=true;
    try{
      if(typeof sb==="undefined")return currentPlan;
      const s=(await sb.auth.getSession()).data.session;
      if(!s)return currentPlan;
      const r=await sb.from("profiles").select("plan").eq("id",s.user.id).maybeSingle();
      if(!r.error&&r.data&&PLAN_LIMITS[r.data.plan])currentPlan=r.data.plan;
    }catch(e){}
    return currentPlan;
  }
  function canUse(feature){
    if(isAdmin())return true;
    const p=plan();
    if(feature==="loads")return p.loadsPerMonth==null||thisMonthLoads()<p.loadsPerMonth;
    if(feature==="carriers")return p.carriers==null||((window.appData&&window.appData.carriers)||[]).length<p.carriers;
    if(feature==="fleetPeople")return p.fleetPeople==null||((window.appData&&window.appData.fleet_people)||[]).length<p.fleetPeople;
    return !!(p.features&&p.features[feature]);
  }
  async function requireFeature(feature){
    await loadPlan();
    if(canUse(feature))return true;
    showUpgrade(upgradeMessage(feature));
    return false;
  }
  function renderBadge(){
    const target=document.getElementById("accountTypeBadge");
    if(!target)return;
    const existing=document.getElementById("planBadge");
    if(existing)existing.remove();
    const b=document.createElement("span");
    b.className="pill";
    b.id="planBadge";
    b.textContent=isAdmin()?"Owner access · Unlimited":`${plan().name} plan`;
    target.after(b);
  }
  window.zapPlanLimits={PLAN_LIMITS,loadPlan,requireFeature,canUse,renderBadge,getPlan:()=>isAdmin()?"owner":currentPlan,isAdmin};
})();