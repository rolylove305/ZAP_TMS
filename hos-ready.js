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

  function currentStatusMinutes(driver,now=new Date()){
    const stored=finiteMinutes(driver?.duty_status_duration);
    if(stored!==null&&stored>0)return stored;
    const started=parseTimestamp(driver?.last_activity_at);
    if(!started)return null;
    return Math.max(0,Math.floor((now.getTime()-started.getTime())/60000));
  }

  function calculateReadyAt(driver,now=new Date()){
    const duty=normalizedStatus(driver?.duty_status);
    const offDuty=OFF_DUTY_STATUSES.has(duty);
    const durationMinutes=currentStatusMinutes(driver,now);

    if(!offDuty){
      return {
        state:"not_resetting",
        earliest_ready_at:null,
        remaining_off_duty_minutes:null,
        duty_status_duration_minutes:durationMinutes,
        label:"10-hour reset not in progress",
        detail:"Driver is not currently off duty or in sleeper berth."
      };
    }

    if(durationMinutes===null){
      return {
        state:"manual_review",
        earliest_ready_at:null,
        remaining_off_duty_minutes:null,
        duty_status_duration_minutes:null,
        label:"Manual review required",
        detail:"The ELD did not provide a reliable start time for the current duty status."
      };
    }

    const remaining=Math.max(0,RESET_MINUTES-durationMinutes);
    if(remaining===0){
      return {
        state:"ready_now",
        earliest_ready_at:now.toISOString(),
        remaining_off_duty_minutes:0,
        duty_status_duration_minutes:durationMinutes,
        label:"Ready now",
        detail:"A continuous 10-hour off-duty reset is complete."
      };
    }

    const readyAt=new Date(now.getTime()+remaining*60000);
    return {
      state:"ready_at",
      earliest_ready_at:readyAt.toISOString(),
      remaining_off_duty_minutes:remaining,
      duty_status_duration_minutes:durationMinutes,
      label:`Ready at ${readyAt.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`,
      detail:`Needs ${Math.floor(remaining/60)}h ${String(remaining%60).padStart(2,"0")}m more off duty.`
    };
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
