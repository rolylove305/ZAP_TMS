(()=>{
function load(id,src){if(document.getElementById(id))return;const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}
function css(id,href){if(document.getElementById(id))return;const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
function run(){
  css('mobileFixCss','mobile-fix.css?v=5200');
  load('rollbackHelpers','rollback-helpers.js?v=6100');
  load('actionsKeeper','actions-keeper.js?v=6300');
  load('tmsDashboardStable','tms-dashboard-stable.js?v=5200');
}
setTimeout(run,300);
setInterval(run,8000);
})();