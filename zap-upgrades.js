(()=>{
function load(id,src){if(document.getElementById(id))return;const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}
function css(id,href){if(document.getElementById(id))return;const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
function run(){
  css('mobileFixCss','mobile-fix.css?v=5500');
  /* login-invite-patch removed: invite-only was replaced by open self-signup.
     Auth is handled by pw-login.js. */
  load('rollbackHelpers','rollback-helpers.js?v=6100');
  load('actionsKeeper','actions-keeper.js?v=6300');
  load('tmsDashboardStable','tms-dashboard-stable.js?v=5300');
  load('driverLocate','driver-locate.js?v=4');
  load('driverPicker','driver-picker.js?v=1');
}
setTimeout(run,300);
setInterval(run,8000);
})();