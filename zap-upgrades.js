(()=>{
function load(id,src){if(document.getElementById(id))return;const s=document.createElement('script');s.id=id;s.src=src;document.body.appendChild(s)}
function css(id,href){if(document.getElementById(id))return;const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
function run(){
  css('mobileFixCss','mobile-fix.css?v=5200');
  // Step 2D: disabled legacy DOM mutators that conflict with native Load Board v2.
  // rollback-helpers.js and actions-keeper.js re-inject old buttons/timers and can race app.js.
  // Driver Link, Location, status, archive, docs are now handled natively by app.js.
  load('tmsDashboardStable','tms-dashboard-stable.js?v=5200');
}
setTimeout(run,300);
})();
