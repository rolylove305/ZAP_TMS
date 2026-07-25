(()=>{
  const RESET_MINUTES=10*60;
  const OFF_DUTY_STATUSES=new Set(["OFF","OFFDUTY","SB","SLEEPER","SLEEPERBERTH"]);

  function normalizedStatus(value){
    return String(value||"").toUpperCase().replace(/[\s_-]+/g,"");
  }

  function finiteMinutes(value){
    if(value===null||value===undefined||value==="")return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?Math.max(0,Math.floor(parsed)):null;
  }

  function parseTimestamp(value){
    if(!value)return null;
    const date=new Date(value);
    return Number.isNaN(date.getTime())?null:date;
  }

  function persistedAvailability(driver){
    const raw=driver?.raw_data?.HosAvailability||driver?.raw_data?.hos_availability||{};
    const state=driver?.ready_status||raw.state;
    if(!state)return null;

    const readyAt=driver?.earliest_ready_at||raw.earliest_ready_at||null;
    const remaining=finiteMinutes(
      driver?.remaining_off_duty_minutes??raw.remaining_off_duty_minutes
    );
    const duration=finiteMinutes(
      driver?.duty_status_duration??raw.duty_status_duration_minutes
    );

    return {
      state,
      earliest_ready_at:readyAt,
      remaining_off_duty_minutes:remaining,
      duty_status_duration_minutes:duration
    };
  }

  function currentStatusMinutes(driver,now=new Date()){
    const stored=finiteMinutes(driver?.duty_status_duration);
    if(stored!==null&&stored>0)return stored;
    const rawStored=finiteMinutes(driver?.raw_data?.HosAvailability?.duty_status_duration_minutes);
    if(rawStored!==null)return rawStored;
    const started=parseTimestamp(driver?.last_activity_at);
    if(!started)return null;
    return Math.max(0,Math.floor((now.getTime()-started.getTime())/60000));
  }

  function describe(result,now=new Date()){
    if(result.state==="ready_now"){
      return {
        ...result,
        label:"Ready now",
        detail:"A continuous 10-hour off-duty reset is complete."
      };
    }
    if(result.state==="ready_at"){
      const readyAt=parseTimestamp(result.earliest_ready_at);
      const remaining=result.remaining_off_duty_minutes;
      return {
        ...result,
        label:readyAt
          ?`Ready at ${readyAt.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`
          :"Reset in progress",
        detail:remaining===null
          ?"Continuous 10-hour off-duty reset is in progress."
          :`Needs ${Math.floor(remaining/60)}h ${String(remaining%60).padStart(2,"0")}m more off duty.`
      };
    }
    if(result.state==="not_resetting"){
      return {
        ...result,
        label:"10-hour reset not in progress",
        detail:"Driver is not currently off duty or in sleeper berth."
      };
    }
    return {
      ...result,
      state:"manual_review",
      label:"Manual review required",
      detail:"The ELD did not provide a reliable continuous-reset start time. Review split sleeper and recent logs."
    };
  }

  function calculateReadyAt(driver,now=new Date()){
    const persisted=persistedAvailability(driver);
    if(persisted)return describe(persisted,now);

    const duty=normalizedStatus(driver?.duty_status);
    const offDuty=OFF_DUTY_STATUSES.has(duty);
    const durationMinutes=currentStatusMinutes(driver,now);

    if(!offDuty){
      return describe({
        state:"not_resetting",
        earliest_ready_at:null,
        remaining_off_duty_minutes:null,
        duty_status_duration_minutes:durationMinutes
      },now);
    }

    if(durationMinutes===null){
      return describe({
        state:"manual_review",
        earliest_ready_at:null,
        remaining_off_duty_minutes:null,
        duty_status_duration_minutes:null
      },now);
    }

    const remaining=Math.max(0,RESET_MINUTES-durationMinutes);
    if(remaining===0){
      return describe({
        state:"ready_now",
        earliest_ready_at:now.toISOString(),
        remaining_off_duty_minutes:0,
        duty_status_duration_minutes:durationMinutes
      },now);
    }

    const readyAt=new Date(now.getTime()+remaining*60000);
    return describe({
      state:"ready_at",
      earliest_ready_at:readyAt.toISOString(),
      remaining_off_duty_minutes:remaining,
      duty_status_duration_minutes:durationMinutes
    },now);
  }

  function formatReadyAt(driver,now=new Date()){
    const result=calculateReadyAt(driver,now);
    return {
      ...result,
      status_text:result.label,
      secondary_text:result.detail
    };
  }

  window.ZapHosReady={
    RESET_MINUTES,
    normalizedStatus,
    currentStatusMinutes,
    calculateReadyAt,
    formatReadyAt
  };
})();