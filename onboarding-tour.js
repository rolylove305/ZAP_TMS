(()=>{
  const VERSION="guided-tour-1";
  const by=id=>document.getElementById(id);
  let steps=[];
  let stepIndex=0;
  let currentTarget=null;
  let active=false;
  let storageKey="";

  const dispatcherSteps=[
    {
      screen:"dashboard",
      selector:"#dashboard .hero-card",
      title:"Welcome to ZAP Dispatch",
      body:"This short tour shows you the complete workflow. It will not create fake records or change your data."
    },
    {
      screen:"dashboard",
      selector:'.quick-actions .dispatcher-only[data-screen="carriers"]',
      title:"1. Add your first carrier",
      body:"Start here. A dispatch company can manage several carriers, while every carrier account remains private."
    },
    {
      screen:"carriers",
      selector:"#carriers .card",
      title:"Enter the carrier company",
      body:"Add the carrier name, MC or DOT, contact information, equipment, trucks and your dispatch commission. Use real information when you are ready."
    },
    {
      screen:"carriers",
      selector:"#addCarrier",
      title:"Save the carrier",
      body:"This saves the carrier securely inside your dispatch account. Other dispatchers and carriers cannot see this list."
    },
    {
      screen:"loads",
      selector:"#loads .card",
      title:"2. Enter a new load",
      body:"Choose the carrier and broker, then enter pickup, delivery, appointments, rate, miles, driver, truck and trailer."
    },
    {
      screen:"loads",
      selector:"#addLoad",
      title:"Save the load",
      body:"When the information is ready, save it. The shipment will appear immediately on your Load Board."
    },
    {
      screen:"loads",
      selector:"#loadsList",
      title:"3. Dispatch and track",
      body:"Each saved load has its workflow, driver link, location, documents and status controls. Keep it moving from Booked through Paid."
    },
    {
      screen:"settings",
      selector:"#restartTour",
      title:"You are ready",
      body:"You can open this guided tour again at any time from Settings. No need to memorize everything today."
    }
  ];

  const carrierSteps=[
    {
      screen:"dashboard",
      selector:"#dashboard .hero-card",
      title:"Welcome to ZAP Dispatch",
      body:"This short tour shows you the carrier workflow. It will not create fake records or change your data."
    },
    {
      screen:"dashboard",
      selector:'.quick-actions .carrier-only[data-screen="fleet"]',
      title:"1. Build your fleet",
      body:"Carrier accounts manage their own company drivers and owner operators. You will never see another company's fleet."
    },
    {
      screen:"fleet",
      selector:"#fleet .card",
      title:"Add a driver or owner operator",
      body:"Choose the type and enter the driver, truck, trailer, equipment and pay method. Use real information when you are ready."
    },
    {
      screen:"fleet",
      selector:"#addFleetPerson",
      title:"Save the fleet record",
      body:"The driver or owner operator stays inside this carrier account and becomes available when you assign a load."
    },
    {
      screen:"loads",
      selector:"#loads .card",
      title:"2. Enter a new load",
      body:"Add the broker, route, appointments, rate, miles, driver, truck and trailer. Your carrier company is selected automatically."
    },
    {
      screen:"loads",
      selector:"#loads .load-cost-box",
      title:"3. Know the real profit",
      body:"Enter fuel, driver pay, tolls, maintenance and other costs. ZAP calculates cost per mile, revenue per mile and estimated profit."
    },
    {
      screen:"loads",
      selector:"#addLoad",
      title:"Save and track the load",
      body:"Save the shipment to place it on the Load Board, then use its status, location and document controls through payment."
    },
    {
      screen:"settings",
      selector:"#restartTour",
      title:"You are ready",
      body:"You can open this guided tour again at any time from Settings. No need to memorize everything today."
    }
  ];

  function shell(){return by("appShell")}

  function activateScreen(screen){
    const button=document.querySelector(`.nav-btn[data-screen="${screen}"]`);
    if(button)button.click();
    else{
      document.querySelectorAll(".screen").forEach(el=>el.classList.toggle("active",el.id===screen));
    }
  }

  function ensureUi(){
    if(by("zapTourLayer"))return;
    const layer=document.createElement("div");
    layer.id="zapTourLayer";
    layer.className="zap-tour-layer hidden";
    layer.innerHTML=`
      <div class="zap-tour-shade" aria-hidden="true"></div>
      <section class="zap-tour-popover" id="zapTourPopover" role="dialog" aria-modal="true" aria-labelledby="zapTourTitle" tabindex="-1">
        <div class="zap-tour-progress" id="zapTourProgress"></div>
        <p class="zap-tour-kicker">ZAP GUIDED TOUR</p>
        <h2 id="zapTourTitle"></h2>
        <p id="zapTourBody"></p>
        <div class="zap-tour-actions">
          <button class="zap-tour-skip" id="zapTourSkip" type="button">Skip tour</button>
          <div>
            <button class="zap-tour-back" id="zapTourBack" type="button">Back</button>
            <button class="zap-tour-next" id="zapTourNext" type="button">Next</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(layer);
    by("zapTourSkip").onclick=()=>finish(true);
    by("zapTourBack").onclick=()=>showStep(stepIndex-1);
    by("zapTourNext").onclick=()=>{
      if(stepIndex>=steps.length-1)finish(false);
      else showStep(stepIndex+1);
    };
  }

  function clearTarget(){
    if(currentTarget)currentTarget.classList.remove("zap-tour-target");
    currentTarget=null;
  }

  function positionPopover(){
    if(!active||!currentTarget)return;
    const popover=by("zapTourPopover");
    const rect=currentTarget.getBoundingClientRect();
    const gap=14;
    const margin=12;
    const width=Math.min(380,window.innerWidth-margin*2);
    popover.style.width=`${width}px`;
    popover.style.left=`${Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin))}px`;
    const popHeight=popover.offsetHeight;
    let top=rect.bottom+gap;
    if(top+popHeight>window.innerHeight-margin)top=rect.top-popHeight-gap;
    if(top<margin)top=Math.max(margin,window.innerHeight-popHeight-margin);
    popover.style.top=`${top}px`;
  }

  function findVisibleTarget(selector){
    const targets=[...document.querySelectorAll(selector)];
    return targets.find(el=>{
      const style=getComputedStyle(el);
      return style.display!=="none"&&style.visibility!=="hidden"&&el.getClientRects().length>0;
    })||null;
  }

  function showStep(nextIndex){
    if(!active||!steps.length)return;
    stepIndex=Math.max(0,Math.min(nextIndex,steps.length-1));
    const step=steps[stepIndex];
    activateScreen(step.screen);
    clearTarget();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      currentTarget=findVisibleTarget(step.selector);
      if(!currentTarget){
        if(stepIndex<steps.length-1)return showStep(stepIndex+1);
        return finish(false);
      }
      currentTarget.classList.add("zap-tour-target");
      currentTarget.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"});
      by("zapTourTitle").textContent=step.title;
      by("zapTourBody").textContent=step.body;
      by("zapTourProgress").textContent=`Step ${stepIndex+1} of ${steps.length}`;
      by("zapTourBack").disabled=stepIndex===0;
      by("zapTourNext").textContent=stepIndex===steps.length-1?"Finish":"Next";
      setTimeout(positionPopover,260);
    }));
  }

  function remember(){
    if(storageKey)localStorage.setItem(storageKey,new Date().toISOString());
  }

  function finish(skipped){
    if(!active)return;
    active=false;
    remember();
    clearTarget();
    document.body.classList.remove("zap-tour-active");
    by("zapTourLayer")?.classList.add("hidden");
    activateScreen(skipped?"dashboard":"settings");
  }

  async function userContext(){
    if(!window.sb)return null;
    const session=(await window.sb.auth.getSession()).data.session;
    if(!session?.user)return null;
    const type=window.zapAccountType==="carrier"?"carrier":"dispatcher";
    return {user:session.user,type};
  }

  async function start(manual=false){
    const context=await userContext();
    if(!context||active)return;
    storageKey=`zapOnboarding:${VERSION}:${context.user.id}:${context.type}`;
    steps=context.type==="carrier"?carrierSteps:dispatcherSteps;
    ensureUi();
    active=true;
    document.body.classList.add("zap-tour-active");
    by("zapTourLayer").classList.remove("hidden");
    showStep(0);
    if(manual)by("zapTourPopover")?.focus();
  }

  async function isBrandNew(context){
    const primaryTable=context.type==="carrier"?"fleet_people":"carriers";
    const [primary,loads]=await Promise.all([
      window.sb.from(primaryTable).select("id",{count:"exact",head:true}),
      window.sb.from("loads").select("id",{count:"exact",head:true})
    ]);
    if(primary.error||loads.error)return null;
    return Number(primary.count||0)===0&&Number(loads.count||0)===0;
  }

  async function autoStart(){
    const context=await userContext();
    if(!context)return;
    storageKey=`zapOnboarding:${VERSION}:${context.user.id}:${context.type}`;
    if(localStorage.getItem(storageKey))return;
    const brandNew=await isBrandNew(context);
    if(brandNew===true)start(false);
    else if(brandNew===false)remember();
  }

  function bind(){
    const button=by("restartTour");
    if(button&&!button.dataset.tourBound){
      button.dataset.tourBound="1";
      button.onclick=()=>start(true);
    }
  }

  function waitForApp(attempt=0){
    bind();
    const ready=window.sb&&window.zapAccountType&&shell()&&!shell().classList.contains("hidden");
    if(ready){setTimeout(autoStart,650);return}
    if(attempt<80)setTimeout(()=>waitForApp(attempt+1),250);
  }

  window.addEventListener("resize",positionPopover);
  window.addEventListener("scroll",positionPopover,true);
  document.addEventListener("keydown",event=>{
    if(active&&event.key==="Escape")finish(true);
  });
  window.zapStartGuidedTour=()=>start(true);
  waitForApp();
})();
